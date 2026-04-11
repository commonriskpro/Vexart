/**
 * Render loop — connects SolidJS tree → Clay layout → Zig paint → output.
 *
 * Browser-style layer compositing:
 *   1. Walk TGENode tree and replay into Clay (immediate mode)
 *   2. Clay calculates layout → flat array of RenderCommands
 *   3. Group commands by layer (each root child = one layer)
 *   4. Only repaint dirty layers → per-layer pixel buffer
 *   5. Only retransmit dirty layers → per-layer Kitty image with z-index
 *   6. Clean layers: zero I/O (terminal keeps the old image in GPU VRAM)
 */

import type { Terminal } from "@tge/terminal"
import type { PixelBuffer } from "@tge/pixel"
import { create, clear, paint } from "@tge/pixel"
import type { Composer } from "@tge/output"
import { createComposer, createLayerComposer } from "@tge/output"
import type { LayerComposer } from "@tge/output"
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
  allLayers,
  markAllDirty,
  updateLayerGeometry,
  clearLayer,
  markLayerClean,
  imageIdForLayer,
  resetLayers,
  layerCount,
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

  // ── Layer assignment ──

  /** Background layer (created once, reused). */
  let bgLayer: Layer | null = null

  /** Child layers (one per layoutRoot child, created once, reused). */
  let childLayerCache: Layer[] = []

  /**
   * Find the "layout root" — the node whose children become layers.
   *
   * SolidJS render() wraps everything: insert(root, <App />) creates
   * a single child (the App's outermost Box). The REAL visual children
   * are one level deeper. We find the deepest single-child box chain
   * and use its children as layers.
   */
  function findLayoutRoot(): TGENode {
    let node = root
    while (node.children.length === 1 && node.children[0].kind === "box") {
      node = node.children[0]
    }
    return node
  }

  /**
   * Ensure layers exist for bg + each child of layoutRoot.
   * Creates layers on first call, reuses on subsequent calls.
   */
  function ensureLayers(layoutRoot: TGENode): { bg: Layer; children: Layer[] } {
    // Background layer
    if (!bgLayer) {
      bgLayer = createLayer(-1)
    }

    // Child layers — one per layoutRoot child
    const childCount = layoutRoot.children.length
    while (childLayerCache.length < childCount) {
      const z = childLayerCache.length
      childLayerCache.push(createLayer(z))
    }

    return { bg: bgLayer, children: childLayerCache.slice(0, childCount) }
  }

  // ── Tree walking ──

  /** Collect all text content from a node's children recursively. */
  function collectText(node: TGENode): string {
    if (node.text) return node.text
    let result = ""
    for (const child of node.children) {
      result += collectText(child)
    }
    return result
  }

  /** Walk TGENode tree and replay into Clay (immediate mode). */
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

  // ── Command counting per subtree ──

  /**
   * Count how many Clay render commands a subtree will produce.
   * This lets us split the flat command array into per-layer groups.
   *
   * Each box produces: 1 RECTANGLE (if has bg) + 1 BORDER (if has border)
   * Each text produces: 1 TEXT
   * Recursive for children.
   */
  function countCommands(node: TGENode): number {
    if (node.kind === "text") {
      const content = node.text || collectText(node)
      return content ? 1 : 0
    }

    let count = 0
    if (node.props.backgroundColor !== undefined) count++
    if (node.props.borderColor !== undefined && node.props.borderWidth) count++

    for (const child of node.children) {
      count += countCommands(child)
    }

    return count
  }

  // ── Frame rendering ──

  /** Paint a single frame with layer compositing. */
  function frameLayered() {
    // 1. Walk entire tree into Clay (single layout pass)
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

    if (commands.length === 0) {
      clearDirty()
      return
    }

    // 2. Find layout root and ensure layers exist
    const layoutRoot = findLayoutRoot()
    const { bg, children: childLayers } = ensureLayers(layoutRoot)

    // 3. Count prefix commands (wrapper boxes above layoutRoot)
    let prefixCount = 0
    let n: TGENode = root
    while (n !== layoutRoot) {
      if (n.props.backgroundColor !== undefined) prefixCount++
      if (n.props.borderColor !== undefined && n.props.borderWidth) prefixCount++
      if (n.children.length === 1) n = n.children[0]
      else break
    }
    if (layoutRoot.props.backgroundColor !== undefined) prefixCount++
    if (layoutRoot.props.borderColor !== undefined && layoutRoot.props.borderWidth) prefixCount++

    // 4. Group commands into per-child layers using spatial analysis.
    //
    // Clay outputs commands in tree order, but may generate extra commands
    // (border segments, separators) that our tree-based countCommands() misses.
    // Instead of predicting counts from the tree, we use the ACTUAL command
    // bounding boxes to detect group boundaries.
    //
    // The layoutRoot arranges children in a direction (column = vertical,
    // row = horizontal). We split commands at gaps along that axis.
    const dir = layoutRoot.props.direction === "row" ? "x" : "y"
    const childCmds = commands.slice(prefixCount)

    // Build per-child groups by finding spatial boundaries.
    // Each child occupies a distinct range on the layout axis.
    // We find the bounding range of each child from the tree,
    // then assign commands that fall within each range.
    const childGroups: { start: number; count: number }[] = []

    if (childCmds.length > 0 && layoutRoot.children.length > 0) {
      // Use the first command of each child subtree as anchor.
      // Walk commands sequentially — Clay outputs them in tree order.
      // Detect group boundaries where the primary axis position jumps
      // beyond the current group's bounding box.

      // Simple approach: walk commands, track bounding box on layout axis.
      // When a command's position is clearly past the current group
      // (and we haven't filled all groups yet), start a new group.

      // First pass: find the bounding extents of each child group
      // by using the tree node positions (from Clay layout).
      // We need to run Clay layout first to get positions...
      // But we already have the commands with positions!

      // Strategy: assign ALL remaining commands (after prefix) as one
      // group per child. Use the tree-based count as initial split,
      // but if total doesn't match, put everything in one layer.
      let remaining = childCmds.length
      let idx = 0

      for (let i = 0; i < layoutRoot.children.length; i++) {
        if (i === layoutRoot.children.length - 1) {
          // Last child gets everything remaining
          childGroups.push({ start: prefixCount + idx, count: remaining })
        } else {
          const est = countCommands(layoutRoot.children[i])
          const count = Math.min(est, remaining)
          childGroups.push({ start: prefixCount + idx, count })
          idx += count
          remaining -= count
        }
      }
    }

    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16
    let cmdIdx = 0

    log(`[frame] cmds=${commands.length} layers=${childLayers.length + 1} dirty=${dirtyCount()} children=${layoutRoot.children.length} prefix=${prefixCount} groups=[${childGroups.map(g => g.count).join(',')}]`)

    term.beginSync()

    // 5. Background layer (prefix commands)
    if (prefixCount > 0) {
      const bgW = Math.round(commands[0].width) || pw
      const bgH = Math.round(commands[0].height) || ph
      updateLayerGeometry(bg, 0, 0, bgW, bgH)

      if (bg.buf) {
        // Paint into a temp buffer and compare
        const prev = bg.buf.data.slice() // snapshot
        clearLayer(bg, 0x00000000)
        for (let j = 0; j < prefixCount; j++) {
          paintCommand(bg.buf, commands[j], 0, 0)
        }
        const changed = bg.dirty || !buffersEqual(prev, bg.buf.data)
        if (changed) {
          log(`  [bg] REPAINT ${bgW}x${bgH} (${(bgW * bgH * 4 / 1024).toFixed(0)}KB)`)
          layerComposer!.renderLayer(bg.buf, imageIdForLayer(bg), 0, 0, bg.z, cellW, cellH)
          markLayerClean(bg)
        } else {
          log(`  [bg] SKIP (unchanged)`)
        }
      }
      cmdIdx = prefixCount
    }

    // 6. Child layers
    for (let i = 0; i < childGroups.length; i++) {
      const group = childGroups[i]
      if (group.count === 0) continue

      const layer = childLayers[i]
      if (!layer) continue

      // Bounding box of all commands in this group
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let j = 0; j < group.count; j++) {
        const cmd = commands[group.start + j]
        if (!cmd) break
        minX = Math.min(minX, cmd.x)
        minY = Math.min(minY, cmd.y)
        maxX = Math.max(maxX, cmd.x + cmd.width)
        maxY = Math.max(maxY, cmd.y + cmd.height)
      }

      const lx = Math.floor(minX)
      const ly = Math.floor(minY)
      const lw = Math.ceil(maxX) - lx
      const lh = Math.ceil(maxY) - ly

      updateLayerGeometry(layer, lx, ly, lw, lh)

      if (layer.buf) {
        // Paint into buffer and compare against previous frame
        const prev = layer.buf.data.slice() // snapshot
        clearLayer(layer, 0x00000000)

        for (let j = 0; j < group.count; j++) {
          const cmd = commands[group.start + j]
          if (!cmd) break
          paintCommand(layer.buf, cmd, lx, ly)
        }

        const changed = layer.dirty || !buffersEqual(prev, layer.buf.data)
        if (changed) {
          log(`  [layer${i}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${layer.z} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${group.count}`)
          layerComposer!.renderLayer(layer.buf, imageIdForLayer(layer), lx, ly, layer.z, cellW, cellH)
          markLayerClean(layer)
        } else {
          log(`  [layer${i}] SKIP (unchanged)`)
          markLayerClean(layer)
        }
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
      // Clear all layers and rebuild
      layerComposer!.clear()
      resetLayers()
      bgLayer = null
      childLayerCache = []
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
      bgLayer = null
      childLayerCache = []
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
