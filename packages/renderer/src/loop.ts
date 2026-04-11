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
import { create, clear, paint } from "@tge/pixel"
import { createComposer, createLayerComposer } from "@tge/output"
import { clay, CMD } from "./clay"
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
import { appendFileSync } from "fs"

const LOG = "/tmp/tge-layers.log"
function log(msg: string) {
  appendFileSync(LOG, msg + "\n")
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

export function createRenderLoop(term: Terminal): RenderLoop {
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
   */
  function walkTree(node: TGENode) {
    if (node.kind === "text") {
      const content = node.text || collectText(node)
      if (!content) return
      const color = parseColor(node.props.color) || 0xe0e0e0ff
      const fontSize = node.props.fontSize ?? 16
      const fontId = node.props.fontId ?? 0
      clay.text(content, color, fontId, fontSize)
      return
    }

    clay.openElement()

    const dir = parseDirection(node.props.direction)
    const px = node.props.paddingX ?? node.props.padding ?? 0
    const py = node.props.paddingY ?? node.props.padding ?? 0
    const gap = node.props.gap ?? 0
    const ax = parseAlignX(node.props.alignX)
    const ay = parseAlignY(node.props.alignY)
    clay.configureLayout(dir, px, py, gap, ax, ay)

    const ws = parseSizing(node.props.width)
    const hs = parseSizing(node.props.height)
    clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

    if (node.props.backgroundColor !== undefined) {
      const bgColor = parseColor(node.props.backgroundColor)
      clay.configureRectangle(bgColor, node.props.cornerRadius ?? 0)
    }

    if (node.props.borderColor !== undefined && node.props.borderWidth) {
      const borderColor = parseColor(node.props.borderColor)
      clay.configureBorder(borderColor, node.props.borderWidth)
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

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]
      const cx = Math.round(cmd.x)
      const cy = Math.round(cmd.y)

      // Find innermost layer containing this command
      let assigned = false
      for (const lb of sortedBounds) {
        if (cx >= lb.x && cy >= lb.y && cx < lb.right && cy < lb.bottom) {
          lb.slot.cmdIndices.push(i)
          assigned = true
          break
        }
      }

      if (!assigned) {
        // Check no-bounds layers — assign to the first one found based on
        // z proximity (these are typically text-only layers)
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

  // ── Frame rendering ──

  /** Paint a single frame with layer compositing. */
  function frameLayered() {
    // 1. Walk tree into Clay (first pass — feeds Clay, no counting)
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

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

      // Compute bounding box from commands
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const idx of slot.cmdIndices) {
        const cmd = commands[idx]
        if (!cmd) continue
        minX = Math.min(minX, cmd.x)
        minY = Math.min(minY, cmd.y)
        maxX = Math.max(maxX, cmd.x + cmd.width)
        maxY = Math.max(maxY, cmd.y + cmd.height)
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

        for (const idx of slot.cmdIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          paintCommand(layer.buf, cmd, lx, ly)
        }

        const changed = layer.dirty || !buffersEqual(prev, layer.buf.data)
        if (changed) {
          log(`  [${slot.key}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${layer.z} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${slot.cmdIndices.length}`)
          layerComposer!.renderLayer(layer.buf, imageIdForLayer(layer), lx, ly, layer.z, cellW, cellH)
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

    term.endSync()
    clearDirty()
  }

  /** Paint a single frame with the old single-buffer approach (fallback). */
  function frameFallback() {
    log(`[frame] FALLBACK single-buffer`)
    if (!fallbackBuf) return
    clear(fallbackBuf, 0x04040aff)

    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

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

/**
 * Paint a Clay RenderCommand into a pixel buffer.
 * offsetX/offsetY translate from absolute screen coords to local buffer coords.
 */
function paintCommand(buf: PixelBuffer, cmd: RenderCommand, offsetX: number, offsetY: number) {
  const x = Math.round(cmd.x) - offsetX
  const y = Math.round(cmd.y) - offsetY
  const w = Math.round(cmd.width)
  const h = Math.round(cmd.height)
  const [r, g, b, a] = cmd.color

  switch (cmd.type) {
    case CMD.RECTANGLE: {
      const radius = Math.round(cmd.cornerRadius)
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
      paint.drawText(buf, x, y, cmd.text, r, g, b, a)
      break
    }

    case CMD.SCISSOR_START:
    case CMD.SCISSOR_END:
      break
  }
}
