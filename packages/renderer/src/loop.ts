/**
 * Render loop — connects SolidJS tree → Clay layout → Zig paint → output.
 *
 * Browser-style layer compositing with recursive boundary detection:
 *   1. Walk TGENode tree and replay into Clay (immediate mode)
 *   2. Simultaneously build a command→layer assignment map
 *   3. Clay calculates layout → flat array of RenderCommands
 *   4. Group commands by layer using the assignment map
 *   5. Only repaint dirty layers → per-layer pixel buffer
 *   6. Only retransmit dirty layers → per-layer Kitty image with z-index
 *   7. Clean layers: zero I/O (terminal keeps the old image in GPU VRAM)
 *
 * Layer boundary rules (evaluated recursively):
 *   - `layer` prop: explicit opt-in, any Box becomes its own layer
 *   - Background layer: everything above the first layer boundary
 *
 * This replaces the old "each layoutRoot child = one layer" approach
 * with recursive layer detection at ANY depth in the tree.
 */

import type { Terminal } from "@tge/terminal"
import type { PixelBuffer } from "@tge/pixel"
import { create, clear, paint, over } from "@tge/pixel"
import { createComposer, createLayerComposer } from "@tge/output"
import { clay, CMD, ATTACH_TO, ATTACH_POINT, POINTER_CAPTURE } from "./clay"
import type { RenderCommand } from "./clay"
import {
  type TGENode,
  createNode,
  parseColor,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
} from "./node"
import { isDirty, clearDirty, markDirty } from "./dirty"
import {
  type Layer,
  createLayer,
  markAllDirty,
  updateLayerGeometry,
  clearLayer,
  markLayerClean,
  imageIdForLayer,
  resetLayers,
  dirtyCount,
} from "./layers"
import { measureForClay, layoutText, getFont, fontToCSS } from "./text-layout"
import { appendFileSync } from "fs"

const LOG = "/tmp/tge-layers.log"
function log(msg: string) {
  appendFileSync(LOG, msg + "\n")
}

// ── Text metadata ──
// During walkTree, we record text props for each <Text> node.
// During paint, we look up the metadata by text content to do multi-line layout.
type TextMeta = { content: string; fontId: number; fontSize: number; lineHeight: number }
const textMetaMap = new Map<string, TextMeta>()

// ── Selectable text collection ──
// In selectableText mode, CMD.TEXT is skipped during pixel paint.
// Instead, text commands are collected here and emitted as ANSI after rendering.
type AnsiTextCommand = {
  text: string
  x: number          // pixel x
  y: number          // pixel y
  r: number; g: number; b: number; a: number  // color components
  lineHeight: number
  maxWidth: number
  fontId: number
}
let pendingAnsiTexts: AnsiTextCommand[] = []
/** Module-level flag set by createRenderLoop when selectableText is active. */
let selectableTextMode = false

// ── Effect metadata ──
// During walkTree, we record shadow/glow configs for nodes with backgroundColor.
// After Clay layout, we match RECT commands to these configs by color+radius
// (emitted in tree-walk order) and apply effects in paintCommand.

type EffectConfig = {
  color: number        // packed bgColor to match against RECT command
  cornerRadius: number // to disambiguate rects with same color
  shadow?: { x: number; y: number; blur: number; color: number }
  glow?: { radius: number; color: number; intensity: number }
}

/** Effects queue — populated during walkTree, consumed during paintCommand. */
let effectsQueue: EffectConfig[] = []

export type RenderLoopOptions = {
  /** When true, text is rendered as ANSI escape codes (selectable/copiable)
   *  instead of bitmap pixels. Backgrounds render as images at z=-1. */
  selectableText?: boolean
}

export type RenderLoop = {
  /** The root TGENode — SolidJS mounts here */
  root: TGENode
  /** Start the render loop */
  start: () => void
  /** Stop the render loop */
  stop: () => void
  /** Force a single frame render */
  frame: () => void
  /** Feed scroll delta from input events */
  feedScroll: (dx: number, dy: number) => void
  /** Feed mouse pointer position */
  feedPointer: (x: number, y: number, down: boolean) => void
  /** Suspend rendering — stop loop, restore terminal for external process ($EDITOR) */
  suspend: () => void
  /** Resume rendering — re-enter TGE mode, force full repaint */
  resume: () => void
  /** Whether the loop is currently suspended */
  suspended: () => boolean
  /** Destroy everything */
  destroy: () => void
}

// ── Layer assignment map ──

/**
 * A "layer slot" discovered during tree walking.
 * Each slot corresponds to a node with `layer` prop or the background.
 */
type LayerSlot = {
  /** Stable key — stringified tree path so we can reuse Layer objects across frames. */
  key: string
  /** z-order: -1 for background, 0+ for content layers in tree order. */
  z: number
  /** Command indices assigned to this slot. */
  cmdIndices: number[]
}

export function createRenderLoop(term: Terminal, opts?: RenderLoopOptions): RenderLoop {
  const selectableText = opts?.selectableText ?? false
  selectableTextMode = selectableText
  const root = createNode("root")

  // Initialize Clay with pixel dimensions
  const pw = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
  const ph = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)

  root.props = { width: pw, height: ph, direction: "column" }
  clay.init(pw, ph)

  // Detect backend: use layer compositor for kitty direct, old compositor for others
  const useLayerCompositing = term.caps.kittyGraphics
  const layerComposer = useLayerCompositing
    ? createLayerComposer(term.write, term.rawWrite)
    : null
  const fallbackComposer = !useLayerCompositing
    ? createComposer(term.write, term.rawWrite, term.caps)
    : null

  // Fallback single-buffer for non-kitty backends
  let fallbackBuf = !useLayerCompositing ? create(pw, ph) : null

  let timer: ReturnType<typeof setInterval> | null = null
  let isSuspended = false

  // ── Scroll + pointer state ──
  // Accumulates scroll deltas from input events between frames.
  let scrollDeltaX = 0
  let scrollDeltaY = 0
  let pointerX = pw / 2  // Default to center so scroll container is "hovered"
  let pointerY = ph / 2
  let pointerDown = false
  let pointerDirty = true  // Feed at least once
  let scrollSpeedCap = 0  // 0 = no cap (natural), >0 = lines per tick
  let lastFrameTime = Date.now()

  /** Feed a scroll event from the input system. Called by mount(). */
  function feedScroll(dx: number, dy: number) {
    scrollDeltaX += dx
    scrollDeltaY += dy
    markDirty() // scroll changes need a repaint
  }

  /** Feed mouse position from the input system. */
  function feedPointer(x: number, y: number, down: boolean) {
    pointerX = x
    pointerY = y
    pointerDown = down
    pointerDirty = true
  }

  // ── Layer cache ──
  // Maps slot key → Layer object. Layers persist across frames.
  const layerCache = new Map<string, Layer>()
  let nextZ = 0

  /** Get or create a Layer for a given slot key and z-order. */
  function getOrCreateLayer(key: string, z: number): Layer {
    const existing = layerCache.get(key)
    if (existing) {
      existing.z = z
      return existing
    }
    const layer = createLayer(z)
    layerCache.set(key, layer)
    return layer
  }

  // ── Tree walking with layer assignment ──

  /** Collect all text content from a node's children recursively. */
  function collectText(node: TGENode): string {
    if (node.text) return node.text
    let result = ""
    for (const child of node.children) {
      result += collectText(child)
    }
    return result
  }

  /**
   * Walk TGENode tree and replay into Clay (immediate mode).
   * This is the FIRST pass — it only feeds Clay, no layer assignment.
   *
   * Text measurement: Before calling clay.text(), we pre-measure
   * the text with Pretext and register the measurement so Clay's
   * callback can read accurate width/height.
   */
  let scrollIdCounter = 0
  let textMeasureIndex = 0

  const textMetas: TextMeta[] = []

  /** Nodes that emit a RECT command, in walkTree order. Used to write layout back. */
  const rectNodes: TGENode[] = []
  /** Nodes that emit a TEXT command, in walkTree order. */
  const textNodes: TGENode[] = []
  /** ALL box nodes in walkTree order (open/close pairs = Clay element order). */
  const boxNodes: TGENode[] = []

  function walkTree(node: TGENode) {
    if (node.kind === "text") {
      const content = node.text || collectText(node)
      if (!content) return
      const color = parseColor(node.props.color) || 0xe0e0e0ff
      const fontSize = node.props.fontSize ?? 14
      const fontId = node.props.fontId ?? 0
      const lineHeight = node.props.lineHeight ?? Math.ceil(fontSize * 1.2)

      // Pre-measure with Pretext for Clay
      const measurement = measureForClay(content, fontId, fontSize)
      clay.setTextMeasure(textMeasureIndex, measurement.width, measurement.height)
      textMeasureIndex++

      // Track metadata for multi-line paint
      const meta: TextMeta = { content, fontId, fontSize, lineHeight }
      textMetas.push(meta)
      textMetaMap.set(content, meta)

      clay.text(content, color, fontId, fontSize)
      textNodes.push(node)
      return
    }

    boxNodes.push(node)

    // Scroll containers need a stable Clay ID for scroll offset tracking
    if (node.props.scrollX || node.props.scrollY) {
      const sid = node.props.scrollId ?? `tge-scroll-${scrollIdCounter++}`
      clay.setId(sid)
      if (node.props.scrollSpeed) {
        scrollSpeedCap = node.props.scrollSpeed
      }
    } else {
      clay.openElement()
    }

    // Layout — resolve aliases, then use per-side padding if set
    const dir = parseDirection(node.props.direction ?? node.props.flexDirection)
    const gap = node.props.gap ?? 0
    const ax = parseAlignX(node.props.alignX ?? node.props.justifyContent)
    const ay = parseAlignY(node.props.alignY ?? node.props.alignItems)

    const hasPerSidePadding = node.props.paddingLeft !== undefined || node.props.paddingRight !== undefined ||
                              node.props.paddingTop !== undefined || node.props.paddingBottom !== undefined
    if (hasPerSidePadding) {
      const basePx = node.props.paddingX ?? node.props.padding ?? 0
      const basePy = node.props.paddingY ?? node.props.padding ?? 0
      clay.configureLayoutFull(dir,
        node.props.paddingLeft ?? basePx,
        node.props.paddingRight ?? basePx,
        node.props.paddingTop ?? basePy,
        node.props.paddingBottom ?? basePy,
        gap, ax, ay)
    } else {
      const px = node.props.paddingX ?? node.props.padding ?? 0
      const py = node.props.paddingY ?? node.props.padding ?? 0
      clay.configureLayout(dir, px, py, gap, ax, ay)
    }

    // Sizing — resolve flexGrow alias, then use min/max if set
    const effectiveWidth = node.props.flexGrow !== undefined && node.props.width === undefined ? "grow" : node.props.width
    const ws = parseSizing(effectiveWidth)
    const hs = parseSizing(node.props.height)
    const hasMinMax = node.props.minWidth !== undefined || node.props.maxWidth !== undefined ||
                      node.props.minHeight !== undefined || node.props.maxHeight !== undefined
    if (hasMinMax) {
      clay.configureSizingMinMax(
        ws.type, ws.value, node.props.minWidth ?? 0, node.props.maxWidth ?? 100000,
        hs.type, hs.value, node.props.minHeight ?? 0, node.props.maxHeight ?? 100000,
      )
    } else {
      clay.configureSizing(ws.type, ws.value, hs.type, hs.value)
    }

    // Floating / absolute positioning
    if (node.props.floating) {
      const f = node.props.floating
      const ox = node.props.floatOffset?.x ?? 0
      const oy = node.props.floatOffset?.y ?? 0
      const z = node.props.zIndex ?? 0
      const ape = node.props.floatAttach?.element ?? ATTACH_POINT.LEFT_TOP
      const app = node.props.floatAttach?.parent ?? ATTACH_POINT.LEFT_TOP
      const pc = node.props.pointerPassthrough ? POINTER_CAPTURE.PASSTHROUGH : POINTER_CAPTURE.CAPTURE

      if (f === "parent") {
        clay.configureFloating(ATTACH_TO.PARENT, ox, oy, z, ape, app, pc, 0)
      } else if (f === "root") {
        clay.configureFloating(ATTACH_TO.ROOT, ox, oy, z, ape, app, pc, 0)
      } else if (typeof f === "object" && f.attachTo) {
        const pid = clay.hashString(f.attachTo)
        clay.configureFloating(ATTACH_TO.ELEMENT, ox, oy, z, ape, app, pc, pid)
      }
    }

    if (node.props.backgroundColor !== undefined) {
      const bgColor = parseColor(node.props.backgroundColor)
      const cr = node.props.cornerRadius ?? 0
      clay.configureRectangle(bgColor, cr)
      rectNodes.push(node)

      // Record effects for this RECT — matched during paint
      if (node.props.shadow || node.props.glow) {
        const effect: EffectConfig = { color: bgColor, cornerRadius: cr }
        if (node.props.shadow) {
          effect.shadow = node.props.shadow
        }
        if (node.props.glow) {
          effect.glow = {
            radius: node.props.glow.radius,
            color: node.props.glow.color,
            intensity: node.props.glow.intensity ?? 80,
          }
        }
        effectsQueue.push(effect)
      }
    }

    // Borders — per-side or uniform
    const hasPerSideBorder = node.props.borderLeft !== undefined || node.props.borderRight !== undefined ||
                             node.props.borderTop !== undefined || node.props.borderBottom !== undefined ||
                             node.props.borderBetweenChildren !== undefined
    if (hasPerSideBorder && node.props.borderColor !== undefined) {
      const borderColor = parseColor(node.props.borderColor)
      clay.configureBorderSides(borderColor,
        node.props.borderLeft ?? 0,
        node.props.borderRight ?? 0,
        node.props.borderTop ?? 0,
        node.props.borderBottom ?? 0,
        node.props.borderBetweenChildren ?? 0)
    } else if (node.props.borderColor !== undefined && node.props.borderWidth) {
      const borderColor = parseColor(node.props.borderColor)
      clay.configureBorder(borderColor, node.props.borderWidth)
    }

    // Scroll / clip container
    if (node.props.scrollX || node.props.scrollY) {
      const offset = clay.getScrollOffset()
      clay.configureClip(
        node.props.scrollX ?? false,
        node.props.scrollY ?? false,
        offset.x,
        offset.y,
      )
    }

    for (const child of node.children) {
      walkTree(child)
    }

    clay.closeElement()
  }

  // ── Layer assignment (spatial matching) ──

  /**
   * Find layer boundaries in the TGENode tree and record their paths.
   * Returns an array of { path, z } for each node with `layer` prop.
   */
  function findLayerBoundaries(
    node: TGENode,
    path: string,
    result: { path: string; z: number }[],
  ) {
    if (node.kind === "text") return

    if (node.props.layer === true) {
      result.push({ path, z: nextZ++ })
    }

    for (let i = 0; i < node.children.length; i++) {
      findLayerBoundaries(node.children[i], `${path}.${i}`, result)
    }
  }

  /**
   * Assign commands to layers using spatial matching.
   *
   * Instead of trying to predict Clay's command emission order (which is
   * fragile — Clay emits extra RECT commands for gaps, separators, etc.),
   * we use the BOUNDING BOX of each layer's anchor RECTANGLE to claim
   * all commands that fall within its bounds.
   *
   * Algorithm:
   *   1. Find all layer boundary nodes (nodes with `layer` prop)
   *   2. For each boundary, find its anchor RECTANGLE in the command array
   *      (first RECT command at that node's position, matched by walking
   *       the tree and finding bg-colored nodes)
   *   3. All commands whose center falls within a layer's bounding box
   *      belong to that layer
   *   4. Commands not claimed by any content layer go to background
   *
   * Layers with higher z-index take priority (innermost/latest wins).
   */
  function assignLayersSpatial(
    commands: RenderCommand[],
    boundaries: { path: string; z: number }[],
  ): { bgSlot: LayerSlot; contentSlots: LayerSlot[] } {
    const bgSlot: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }

    if (boundaries.length === 0) {
      // No layer boundaries — everything goes to bg
      for (let i = 0; i < commands.length; i++) {
        bgSlot.cmdIndices.push(i)
      }
      return { bgSlot, contentSlots: [] }
    }

    // For each layer boundary, find its bounding box from the command array.
    // Walk the tree to find each boundary node and its backgroundColor RECT.
    // We use the commands themselves — each layer boundary should have a
    // RECTANGLE command with a unique position+size combination.
    //
    // Strategy: for each boundary, search the TGENode tree for the node,
    // get its bg color, and find the matching RECT command. Then use that
    // RECT's bounds to claim commands.

    // Simpler approach: find RECT commands that could be layer anchors.
    // A layer boundary node has `layer` prop and typically `backgroundColor`.
    // Its RECT command has a specific x,y,w,h. We find it by walking the
    // tree to that path and matching against the command array.

    // Even simpler: for each content layer, ALL commands whose spatial
    // extent is fully contained within that layer's anchor RECT belong to it.
    // The anchor RECT is found by tree-path matching.

    // SIMPLEST correct approach: collect all RECT commands that correspond
    // to layer boundary nodes. Then assign all commands spatially.

    // We need to find the bounding box for each layer. Walk the node tree
    // to each boundary path, check if it has backgroundColor, find the
    // corresponding RECT in the command array by matching.

    // Actually the most robust approach: use ALL commands to find each
    // layer's extent. Each layer boundary creates a slot. For each command,
    // find the innermost (highest z) layer whose anchor bbox contains it.

    // Step 1: Find anchor RECT for each boundary by scanning commands.
    // Each boundary node with backgroundColor emits a RECT. We find it by
    // looking at the node tree to get the expected color, then matching.
    type LayerBounds = {
      slot: LayerSlot
      x: number
      y: number
      right: number
      bottom: number
    }

    const layerBounds: LayerBounds[] = []

    for (const b of boundaries) {
      const node = resolveNodeByPath(root, b.path)
      if (!node) continue

      const slot: LayerSlot = { key: `layer:${b.path}`, z: b.z, cmdIndices: [] }

      if (node.props.backgroundColor !== undefined) {
        // Find the RECT command for this node's backgroundColor.
        // We match by the packed color value.
        const targetColor = parseColor(node.props.backgroundColor)
        const [tr, tg, tb, ta] = [(targetColor >>> 24) & 0xff, (targetColor >>> 16) & 0xff, (targetColor >>> 8) & 0xff, targetColor & 0xff]

        // Find matching RECT command (not already claimed by a higher-z layer)
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i]
          if (cmd.type !== CMD.RECTANGLE) continue
          if (cmd.color[0] === tr && cmd.color[1] === tg && cmd.color[2] === tb && cmd.color[3] === ta) {
            // Check this RECT isn't already the anchor for another layer
            const alreadyClaimed = layerBounds.some(lb =>
              lb.x === Math.round(cmd.x) && lb.y === Math.round(cmd.y) &&
              lb.right === Math.round(cmd.x + cmd.width) && lb.bottom === Math.round(cmd.y + cmd.height)
            )
            if (!alreadyClaimed) {
              layerBounds.push({
                slot,
                x: Math.round(cmd.x),
                y: Math.round(cmd.y),
                right: Math.round(cmd.x + cmd.width),
                bottom: Math.round(cmd.y + cmd.height),
              })
              break
            }
          }
        }
      } else {
        // Layer boundary without backgroundColor — use first child commands
        // to determine bounds. For now, push with zero bounds and fill later.
        layerBounds.push({ slot, x: 0, y: 0, right: 0, bottom: 0 })
      }
    }

    // Step 2: For layers without bg (no anchor RECT), compute bounds from
    // all commands that would spatially fall within them. We need a first
    // pass to find their extent. Use commands not claimed by other layers.
    // For now, these layers claim commands by their TEXT children's positions.

    // Step 3: Assign each command to the innermost (highest z) layer
    // whose bounding box contains the command's position.
    // Commands not in any content layer go to bgSlot.
    const contentSlots: LayerSlot[] = []
    for (const lb of layerBounds) {
      contentSlots.push(lb.slot)
    }

    // Sort layerBounds by z descending (highest z = innermost = check first)
    const sortedBounds = [...layerBounds].filter(lb => lb.right > lb.x).sort((a, b) => b.slot.z - a.slot.z)

    // For layers without bounds, collect their commands via leftover
    const noBoundsLayers = layerBounds.filter(lb => lb.right <= lb.x)

    // Track SCISSOR regions — commands between SCISSOR_START and SCISSOR_END
    // are force-assigned to the layer containing the SCISSOR_START bbox.
    // This handles scroll containers where content scrolls OUTSIDE the
    // layer's anchor bounding box.
    let scissorLayer: LayerBounds | null = null

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]

      // SCISSOR_START: find which layer owns this scissor region
      if (cmd.type === CMD.SCISSOR_START) {
        const sx = Math.round(cmd.x)
        const sy = Math.round(cmd.y)
        // Find the layer whose bbox contains the scissor origin
        for (const lb of sortedBounds) {
          if (sx >= lb.x && sy >= lb.y && sx < lb.right && sy < lb.bottom) {
            scissorLayer = lb
            break
          }
        }
        // The SCISSOR_START itself goes to that layer (or bg)
        if (scissorLayer) {
          scissorLayer.slot.cmdIndices.push(i)
        } else {
          bgSlot.cmdIndices.push(i)
        }
        continue
      }

      // SCISSOR_END: assign to scissor layer and clear
      if (cmd.type === CMD.SCISSOR_END) {
        if (scissorLayer) {
          scissorLayer.slot.cmdIndices.push(i)
          scissorLayer = null
        } else {
          bgSlot.cmdIndices.push(i)
        }
        continue
      }

      // If inside a SCISSOR region, force-assign to that layer
      if (scissorLayer) {
        scissorLayer.slot.cmdIndices.push(i)
        continue
      }

      // Normal spatial assignment
      const cx = Math.round(cmd.x)
      const cy = Math.round(cmd.y)

      let assigned = false
      for (const lb of sortedBounds) {
        if (cx >= lb.x && cy >= lb.y && cx < lb.right && cy < lb.bottom) {
          lb.slot.cmdIndices.push(i)
          assigned = true
          break
        }
      }

      if (!assigned) {
        bgSlot.cmdIndices.push(i)
      }
    }

    // Handle no-bounds layers: find their commands among bgSlot's commands
    // by looking at commands that are near the layer's tree position.
    // For text-only layers (no bg), we need to extract their TEXT commands
    // from bgSlot and move them to the layer slot.
    for (const lb of noBoundsLayers) {
      const node = resolveNodeByPath(root, lb.slot.key.replace("layer:", ""))
      if (!node) continue

      // Collect expected text content from this subtree
      const texts = collectAllTexts(node)
      if (texts.length === 0) continue

      // Find TEXT commands in bgSlot matching these texts
      const toMove: number[] = []
      for (const cmdIdx of bgSlot.cmdIndices) {
        const cmd = commands[cmdIdx]
        if (cmd.type === CMD.TEXT && cmd.text && texts.includes(cmd.text)) {
          toMove.push(cmdIdx)
        }
      }

      // Move from bgSlot to this layer
      for (const idx of toMove) {
        const pos = bgSlot.cmdIndices.indexOf(idx)
        if (pos >= 0) bgSlot.cmdIndices.splice(pos, 1)
        lb.slot.cmdIndices.push(idx)
      }
    }

    return { bgSlot, contentSlots }
  }

  /** Resolve a TGENode by its tree path (e.g. "r.0.1.2"). */
  function resolveNodeByPath(fromRoot: TGENode, path: string): TGENode | null {
    const parts = path.split(".")
    let node = fromRoot
    // Skip "r" (root prefix)
    for (let i = 1; i < parts.length; i++) {
      const idx = parseInt(parts[i])
      if (isNaN(idx) || idx >= node.children.length) return null
      node = node.children[idx]
    }
    return node
  }

  /** Collect all text strings from a node's subtree. */
  function collectAllTexts(node: TGENode): string[] {
    const result: string[] = []
    function walk(n: TGENode) {
      if (n.kind === "text") {
        const t = n.text || collectText(n)
        if (t) result.push(t)
        return
      }
      for (const child of n.children) walk(child)
    }
    walk(node)
    return result
  }

  // ── Layout writeback ──

  /**
   * After Clay layout, write computed geometry back to TGENodes.
   *
   * RECT commands map 1:1 with rectNodes (same order as walkTree).
   * TEXT commands map 1:1 with textNodes (same order as walkTree).
   * Box nodes without backgroundColor also get layout from the
   * first command that spatially contains them (approximation).
   */
  function writeLayoutBack(commands: RenderCommand[]) {
    let rectIdx = 0
    let textIdx = 0

    for (const cmd of commands) {
      if (cmd.type === CMD.RECTANGLE && rectIdx < rectNodes.length) {
        const node = rectNodes[rectIdx]
        node.layout.x = cmd.x
        node.layout.y = cmd.y
        node.layout.width = cmd.width
        node.layout.height = cmd.height
        rectIdx++
      } else if (cmd.type === CMD.TEXT && textIdx < textNodes.length) {
        const node = textNodes[textIdx]
        node.layout.x = cmd.x
        node.layout.y = cmd.y
        node.layout.width = cmd.width
        node.layout.height = cmd.height
        textIdx++
      }
    }

    // For box nodes that had backgroundColor, layout was already written via RECT.
    // For box nodes WITHOUT backgroundColor, attempt to inherit from their first
    // child's command position. This is an approximation — full accuracy would
    // require Clay to expose per-element layout (which it doesn't via commands).
    // NOTE: This is a best-effort. Nodes with no background and no children
    // will have layout { 0, 0, 0, 0 } until a more precise approach is added.
  }

  // ── Frame rendering ──

  /** Paint a single frame with layer compositing. */
  function frameLayered() {
    // 0. Feed pointer + scroll to Clay before layout.
    // Clay_UpdateScrollContainers MUST be called every frame — it maintains
    // internal scroll state including momentum/deceleration.
    const now = Date.now()
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1) // cap at 100ms
    lastFrameTime = now
    clay.setPointer(pointerX, pointerY, pointerDown)

    // Cap scroll delta if any scroll container has scrollSpeed set
    let sdx = scrollDeltaX
    let sdy = scrollDeltaY
    if (scrollSpeedCap > 0 && (sdx !== 0 || sdy !== 0)) {
      const cellH = term.size.cellHeight || 16
      const maxDelta = scrollSpeedCap * cellH
      sdx = Math.max(-maxDelta, Math.min(maxDelta, sdx))
      sdy = Math.max(-maxDelta, Math.min(maxDelta, sdy))
    }
    clay.updateScroll(sdx, sdy, dt)
    scrollDeltaX = 0
    scrollDeltaY = 0
    scrollIdCounter = 0

    // 1. Walk tree into Clay (first pass — feeds Clay, no counting)
    scrollSpeedCap = 0 // reset — will be set by walkTree if any node has scrollSpeed
    effectsQueue = [] // reset effects for this frame
    pendingAnsiTexts = [] // reset ANSI text collection
    textMeasureIndex = 0 // reset text measure counter
    textMetas.length = 0 // clear text metadata
    textMetaMap.clear()
    clay.resetTextMeasures() // reset C-side counter
    rectNodes.length = 0
    textNodes.length = 0
    boxNodes.length = 0
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

    // Write layout geometry back to TGENodes for ref access
    writeLayoutBack(commands)

    if (commands.length === 0) {
      clearDirty()
      return
    }

    // 2. Find layer boundaries and assign commands spatially
    nextZ = 0
    const boundaries: { path: string; z: number }[] = []
    findLayerBoundaries(root, "r", boundaries)
    const { bgSlot, contentSlots } = assignLayersSpatial(commands, boundaries)

    // If no explicit layers found, everything non-bg becomes one content layer
    if (contentSlots.length === 0 && commands.length > bgSlot.cmdIndices.length) {
      const fallbackSlot: LayerSlot = { key: "layer:fallback", z: 0, cmdIndices: [] }
      for (let i = 0; i < commands.length; i++) {
        if (!bgSlot.cmdIndices.includes(i)) {
          fallbackSlot.cmdIndices.push(i)
        }
      }
      if (fallbackSlot.cmdIndices.length > 0) {
        contentSlots.push(fallbackSlot)
      }
    }

    const allSlots = [bgSlot, ...contentSlots]
    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16

    log(`[frame] cmds=${commands.length} layers=${allSlots.length} slots=[${allSlots.map(s => `${s.key}(${s.cmdIndices.length})`).join(',')}]`)

    term.beginSync()

    // 3. Render each layer slot
    for (const slot of allSlots) {
      if (slot.cmdIndices.length === 0) continue

      const layer = getOrCreateLayer(slot.key, slot.z)

      // Compute bounding box from commands.
      // If the layer has a SCISSOR_START, use the scissor rect as the
      // bounding box — this IS the clip rect. Content outside it is
      // automatically clipped by Zig's bounds checking against the buffer.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      let hasScissor = false

      for (const idx of slot.cmdIndices) {
        const cmd = commands[idx]
        if (!cmd) continue
        if (cmd.type === CMD.SCISSOR_START) {
          // Use scissor rect as the layer bounds
          minX = cmd.x
          minY = cmd.y
          maxX = cmd.x + cmd.width
          maxY = cmd.y + cmd.height
          hasScissor = true
          break // scissor defines the bounds, ignore everything else
        }
      }

      if (!hasScissor) {
        for (const idx of slot.cmdIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          minX = Math.min(minX, cmd.x)
          minY = Math.min(minY, cmd.y)
          maxX = Math.max(maxX, cmd.x + cmd.width)
          maxY = Math.max(maxY, cmd.y + cmd.height)
        }
      }

      // Background layer at (0,0) fullscreen
      const isBg = slot.z < 0
      const lx = isBg ? 0 : Math.floor(minX)
      const ly = isBg ? 0 : Math.floor(minY)
      const lw = isBg ? (Math.round(commands[0].width) || pw) : (Math.ceil(maxX) - lx)
      const lh = isBg ? (Math.round(commands[0].height) || ph) : (Math.ceil(maxY) - ly)

      updateLayerGeometry(layer, lx, ly, lw, lh)

      if (layer.buf) {
        // Paint into buffer and compare against previous frame
        const prev = layer.buf.data.slice()
        clearLayer(layer, 0x00000000)

        // Sort command indices to preserve SCISSOR ordering
        const sortedIndices = slot.cmdIndices.slice().sort((a, b) => a - b)
        for (const idx of sortedIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          paintCommand(layer.buf, cmd, lx, ly)
        }

        const changed = layer.dirty || !buffersEqual(prev, layer.buf.data)
        if (changed) {
          // In selectableText mode, force ALL layers to z=-1 so they render UNDER ANSI text
          const renderZ = selectableText ? -1 : layer.z
          log(`  [${slot.key}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${renderZ} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${slot.cmdIndices.length}`)
          layerComposer!.renderLayer(layer.buf, imageIdForLayer(layer), lx, ly, renderZ, cellW, cellH)
          markLayerClean(layer)
        } else {
          log(`  [${slot.key}] SKIP (unchanged)`)
          markLayerClean(layer)
        }
      }
    }

    // 4. Clean up orphan layers (layers from previous frame that no longer exist)
    const activeKeys = new Set(allSlots.map(s => s.key))
    for (const [key, layer] of layerCache) {
      if (!activeKeys.has(key)) {
        layerComposer!.removeLayer(imageIdForLayer(layer))
        layerCache.delete(key)
      }
    }

    // 5. Emit ANSI text in selectableText mode
    if (selectableText && pendingAnsiTexts.length > 0) {
      emitAnsiText(term, pendingAnsiTexts, cellW, cellH)
    }

    term.endSync()
    clearDirty()
  }

  /** Paint a single frame with the old single-buffer approach (fallback). */
  function frameFallback() {
    log(`[frame] FALLBACK single-buffer`)
    if (!fallbackBuf) return
    clear(fallbackBuf, 0x04040aff)

    // Feed pointer + scroll — must call every frame
    const now = Date.now()
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1)
    lastFrameTime = now
    clay.setPointer(pointerX, pointerY, pointerDown)
    clay.updateScroll(scrollDeltaX, scrollDeltaY, dt)
    scrollDeltaX = 0
    scrollDeltaY = 0
    scrollIdCounter = 0

    effectsQueue = [] // reset effects for this frame
    textMeasureIndex = 0
    textMetas.length = 0
    textMetaMap.clear()
    rectNodes.length = 0
    textNodes.length = 0
    boxNodes.length = 0
    clay.resetTextMeasures()
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

    writeLayoutBack(commands)

    for (const cmd of commands) {
      paintCommand(fallbackBuf, cmd, 0, 0)
    }

    const cols = term.size.cols
    const rows = term.size.rows
    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16

    term.beginSync()
    fallbackComposer!.render(fallbackBuf, 0, 0, cols, rows, cellW, cellH)
    term.endSync()
    clearDirty()
  }

  /** Paint a frame — dispatches to layered or fallback based on backend. */
  function frame() {
    if (useLayerCompositing) {
      frameLayered()
    } else {
      frameFallback()
    }
  }

  /** Resize handler */
  const unsubResize = term.onResize(() => {
    const newW = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
    const newH = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)
    clay.setDimensions(newW, newH)
    root.props.width = newW
    root.props.height = newH

    if (useLayerCompositing) {
      layerComposer!.clear()
      resetLayers()
      layerCache.clear()
    } else {
      fallbackBuf = create(newW, newH)
    }
    markDirty()
    markAllDirty()
  })

  return {
    root,
    feedScroll,
    feedPointer,

    start() {
      frame() // initial render
      timer = setInterval(() => {
        if (isDirty()) frame()
      }, 33) // ~30fps
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    frame,

    suspend() {
      if (isSuspended) return
      isSuspended = true
      // Stop the render loop first
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      // Restore terminal (alt screen, cursor, mouse, etc.)
      term.suspend()
    },

    resume() {
      if (!isSuspended) return
      isSuspended = false
      // Re-enter TGE mode
      term.resume()
      // Force full repaint — all layers dirty, all buffers stale
      markDirty()
      markAllDirty()
      // Restart the render loop
      frame()
      timer = setInterval(() => {
        if (isDirty()) frame()
      }, 33)
    },

    suspended() {
      return isSuspended
    },

    destroy() {
      if (timer) clearInterval(timer)
      unsubResize()
      if (layerComposer) layerComposer.destroy()
      if (fallbackComposer) fallbackComposer.destroy()
      resetLayers()
      layerCache.clear()
      clay.destroy()
    },
  }
}

/** Fast byte-level comparison of two buffers. */
function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      return false
    }
  }
  return true
}

// ── Scissor clipping ──

type ScissorRect = { x: number; y: number; w: number; h: number }

/** Active scissor stack (screen coordinates). */
const scissorStack: ScissorRect[] = []

/** Push a scissor rect (from SCISSOR_START command). */
function pushScissor(cmd: RenderCommand) {
  scissorStack.push({
    x: Math.round(cmd.x),
    y: Math.round(cmd.y),
    w: Math.round(cmd.width),
    h: Math.round(cmd.height),
  })
}

/** Pop the scissor stack (on SCISSOR_END). */
function popScissor() {
  scissorStack.pop()
}

/** Get the current active scissor rect, or null if none. */
function activeScissor(): ScissorRect | null {
  return scissorStack.length > 0 ? scissorStack[scissorStack.length - 1] : null
}

/**
 * Check if a command is fully outside the active scissor rect.
 * Returns true if the command should be skipped (fully clipped).
 */
function isClipped(cmd: RenderCommand): boolean {
  const s = activeScissor()
  if (!s) return false
  const cx = Math.round(cmd.x)
  const cy = Math.round(cmd.y)
  const cw = Math.round(cmd.width)
  const ch = Math.round(cmd.height)
  // Fully outside?
  return cx + cw <= s.x || cy + ch <= s.y || cx >= s.x + s.w || cy >= s.y + s.h
}

/**
 * Clip a paint rect to the active scissor. Returns the clipped rect
 * in LOCAL buffer coordinates (offset subtracted).
 * Returns null if fully clipped.
 */
function clipToScissor(
  x: number, y: number, w: number, h: number,
  offsetX: number, offsetY: number,
): { x: number; y: number; w: number; h: number } | null {
  const s = activeScissor()
  if (!s) return { x: x - offsetX, y: y - offsetY, w, h }

  // Clamp to scissor bounds (screen coords)
  const left = Math.max(x, s.x)
  const top = Math.max(y, s.y)
  const right = Math.min(x + w, s.x + s.w)
  const bottom = Math.min(y + h, s.y + s.h)

  if (left >= right || top >= bottom) return null

  return {
    x: left - offsetX,
    y: top - offsetY,
    w: right - left,
    h: bottom - top,
  }
}

/**
 * Emit collected text commands as ANSI escape codes.
 * Converts pixel coordinates to terminal cell positions and writes
 * colored text at those positions. Called in selectableText mode
 * after all pixel layers have been rendered.
 */
function emitAnsiText(
  term: Terminal,
  texts: AnsiTextCommand[],
  cellW: number,
  cellH: number,
) {
  for (const t of texts) {
    // Convert pixel coords to cell (1-indexed for ANSI)
    const col = Math.floor(t.x / cellW) + 1
    const row = Math.floor(t.y / cellH) + 1

    // Word wrap using atlas metrics
    const result = layoutText(t.text, t.fontId, t.maxWidth, t.lineHeight)

    for (let li = 0; li < result.lines.length; li++) {
      const line = result.lines[li]
      const lineRow = row + li
      // Move cursor to position
      term.write(`\x1b[${lineRow};${col}H`)
      // Set foreground color (24-bit true color)
      term.write(`\x1b[38;2;${t.r};${t.g};${t.b}m`)
      // Write the text
      term.write(line.text)
    }
  }
  // Reset color
  term.write("\x1b[39m")
}

/**
 * Paint a Clay RenderCommand into a pixel buffer.
 * offsetX/offsetY translate from absolute screen coords to local buffer coords.
 * Respects active scissor rect for clipping.
 */
function paintCommand(buf: PixelBuffer, cmd: RenderCommand, offsetX: number, offsetY: number) {
  // Handle scissor commands
  if (cmd.type === CMD.SCISSOR_START) {
    pushScissor(cmd)
    return
  }
  if (cmd.type === CMD.SCISSOR_END) {
    popScissor()
    return
  }

  // Skip fully clipped commands
  if (isClipped(cmd)) return

  const x = Math.round(cmd.x) - offsetX
  const y = Math.round(cmd.y) - offsetY
  const w = Math.round(cmd.width)
  const h = Math.round(cmd.height)
  const [r, g, b, a] = cmd.color

  switch (cmd.type) {
    case CMD.RECTANGLE: {
      const radius = Math.round(cmd.cornerRadius)
      const cmdColor = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0

      // Check for shadow/glow effects matching this RECT
      const effectIdx = effectsQueue.findIndex(
        (e) => e.color === cmdColor && e.cornerRadius === radius
      )
      if (effectIdx >= 0) {
        const effect = effectsQueue[effectIdx]
        effectsQueue.splice(effectIdx, 1) // consume — one match per node

        // Effects use TEMPORARY BUFFERS to avoid destructive in-place blur.
        // Without this, blur() would corrupt neighboring pixels (other cards,
        // text, background). The temp buffer isolates the effect, then we
        // composite it onto the main buffer with src-over alpha blending.

        // Glow: rounded rect in glow color → blur → composite
        if (effect.glow) {
          const gl = effect.glow
          const gr = (gl.color >>> 24) & 0xff
          const gg = (gl.color >>> 16) & 0xff
          const gb = (gl.color >>> 8) & 0xff
          const ga = Math.round(((gl.color & 0xff) * gl.intensity) / 100)
          const spread = gl.radius
          const blurR = Math.ceil(spread * 0.6)
          const margin = spread + blurR
          // Temp buffer sized to contain the glow + blur margin
          const tw = w + margin * 2
          const th = h + margin * 2
          if (tw > 0 && th > 0) {
            const tmp = create(tw, th)
            // Paint shape centered in temp buffer
            const lx = margin
            const ly = margin
            if (radius > 0) {
              paint.roundedRect(tmp, lx, ly, w, h, gr, gg, gb, ga, radius)
            } else {
              paint.fillRect(tmp, lx, ly, w, h, gr, gg, gb, ga)
            }
            // Blur the entire temp buffer — safe, no neighbors to corrupt
            paint.blur(tmp, 0, 0, tw, th, blurR, 3)
            // Composite onto main buffer
            over(buf, tmp, x - margin, y - margin)
          }
        }

        // Shadow: rounded rect at offset → blur → composite
        if (effect.shadow) {
          const s = effect.shadow
          const sr = (s.color >>> 24) & 0xff
          const sg = (s.color >>> 16) & 0xff
          const sb = (s.color >>> 8) & 0xff
          const sa = s.color & 0xff
          const blurR = Math.ceil(s.blur)
          const margin = blurR * 2
          // Temp buffer: rect size + blur margin + offset
          const tw = w + margin * 2 + Math.abs(s.x)
          const th = h + margin * 2 + Math.abs(s.y)
          if (tw > 0 && th > 0) {
            const tmp = create(tw, th)
            // Paint shadow shape in temp buffer (offset from center)
            const lx = margin + Math.max(0, s.x)
            const ly = margin + Math.max(0, s.y)
            if (radius > 0) {
              paint.roundedRect(tmp, lx, ly, w, h, sr, sg, sb, sa, radius)
            } else {
              paint.fillRect(tmp, lx, ly, w, h, sr, sg, sb, sa)
            }
            // Blur in isolated temp buffer
            paint.blur(tmp, 0, 0, tw, th, blurR, 3)
            // Composite onto main buffer
            const dx = x - margin + Math.min(0, s.x)
            const dy = y - margin + Math.min(0, s.y)
            over(buf, tmp, dx, dy)
          }
        }
      }

      // Paint the actual rect ON TOP of shadow/glow
      if (radius > 0) {
        paint.roundedRect(buf, x, y, w, h, r, g, b, a, radius)
      } else {
        paint.fillRect(buf, x, y, w, h, r, g, b, a)
      }
      break
    }

    case CMD.BORDER: {
      const radius = Math.round(cmd.cornerRadius)
      const bw = Math.round(cmd.extra1) || 1
      paint.strokeRect(buf, x, y, w, h, r, g, b, a, radius, bw)
      break
    }

    case CMD.TEXT: {
      if (!cmd.text) break
      const meta = textMetaMap.get(cmd.text)
      const fontId = meta?.fontId ?? 0
      const lineHeight = meta?.lineHeight ?? 17

      if (selectableTextMode) {
        // Collect for ANSI rendering — use ABSOLUTE coordinates (add offset back)
        pendingAnsiTexts.push({
          text: cmd.text,
          x: x + offsetX,
          y: y + offsetY,
          r, g, b, a,
          lineHeight,
          maxWidth: Math.max(w, 1),
          fontId,
        })
        break
      }

      // Pixel paint mode — render bitmap text
      const maxTextWidth = Math.max(w, 1)
      const result = layoutText(cmd.text, fontId, maxTextWidth, lineHeight)
      if (result.lines.length <= 1) {
        paint.drawText(buf, x, y, cmd.text, r, g, b, a)
      } else {
        for (let li = 0; li < result.lines.length; li++) {
          const line = result.lines[li]
          const lineY = y + li * lineHeight
          paint.drawText(buf, x, lineY, line.text, r, g, b, a)
        }
      }
      break
    }
  }
}
