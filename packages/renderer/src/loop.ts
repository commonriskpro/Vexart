/**
 * Render loop — connects SolidJS tree → Clay layout → Zig paint → output.
 *
 * Each frame:
 *   1. Walk the TGENode tree and replay it into Clay (immediate mode)
 *   2. Clay calculates layout → array of RenderCommands
 *   3. Each RenderCommand → @tge/pixel paint call
 *   4. Composite buffer → @tge/output composer
 *
 * The loop runs on requestAnimationFrame-like timing (setInterval for terminal).
 */

import type { Terminal } from "@tge/terminal"
import type { PixelBuffer } from "@tge/pixel"
import { create, clear, paint } from "@tge/pixel"
import type { Composer } from "@tge/output"
import { createComposer } from "@tge/output"
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
// Note: solidRender is used by index.ts, not here.
// Phase 4: all rendering (including text) is pixel-based via Zig.

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

  // Root MUST use FIXED sizing with actual pixel dimensions.
  // Clay_BeginLayout() creates an internal root container — our root is its child.
  // Using PERCENT here would fail because Clay's internal root doesn't propagate
  // size correctly to PERCENT children. Phase 2 demo uses FIXED and works.
  root.props = { width: pw, height: ph, direction: "column" }
  clay.init(pw, ph)

  // Create pixel buffer and composer
  let buf = create(pw, ph)
  const composer = createComposer(term.write, term.rawWrite, term.caps)

  let timer: ReturnType<typeof setInterval> | null = null
  let dirty = true

  // Mark dirty when SolidJS updates
  // (In a full implementation, SolidJS effects would set this)

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
      // Text element — collect text from self or children (text nodes created by SolidJS)
      const content = node.text || collectText(node)
      if (!content) return
      const color = parseColor(node.props.color) || 0xe0e0e0ff
      const fontSize = node.props.fontSize ?? 16
      const fontId = node.props.fontId ?? 0
      clay.text(content, color, fontId, fontSize)
      return
    }

    // Box or root — open element
    clay.openElement()

    // Configure layout
    const dir = parseDirection(node.props.direction)
    const px = node.props.paddingX ?? node.props.padding ?? 0
    const py = node.props.paddingY ?? node.props.padding ?? 0
    const gap = node.props.gap ?? 0
    const ax = parseAlignX(node.props.alignX)
    const ay = parseAlignY(node.props.alignY)
    clay.configureLayout(dir, px, py, gap, ax, ay)

    // Configure sizing
    const ws = parseSizing(node.props.width)
    const hs = parseSizing(node.props.height)
    clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

    // Configure background color + corner radius
    if (node.props.backgroundColor !== undefined) {
      const bgColor = parseColor(node.props.backgroundColor)
      clay.configureRectangle(bgColor, node.props.cornerRadius ?? 0)
    }

    // Configure border
    if (node.props.borderColor !== undefined && node.props.borderWidth) {
      const borderColor = parseColor(node.props.borderColor)
      clay.configureBorder(borderColor, node.props.borderWidth)
    }

    // Walk children
    for (const child of node.children) {
      walkTree(child)
    }

    clay.closeElement()
  }

  /** Paint a single frame. */
  function frame() {
    // 1. Clear buffer
    clear(buf, 0x04040aff)

    // 2. Walk tree into Clay
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

    // 3. Paint each render command — ALL rendering is pixel-based (Phase 4).
    // Text is drawn directly into the pixel buffer via the Zig bitmap font.
    // No ANSI text overlay, no placeholder/text conflicts.
    for (const cmd of commands) {
      paintCommand(buf, cmd)
    }

    // 4. Output pixel buffer — single image, everything is pixels
    const cols = term.size.cols
    const rows = term.size.rows
    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16

    term.beginSync()
    composer.render(buf, 0, 0, cols, rows, cellW, cellH)
    term.endSync()

    dirty = false
  }

  /** Resize handler */
  const unsubResize = term.onResize(() => {
    const newW = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
    const newH = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)
    clay.setDimensions(newW, newH)
    root.props.width = newW
    root.props.height = newH
    buf = create(newW, newH)
    dirty = true
  })

  return {
    root,

    start() {
      frame() // initial render
      timer = setInterval(() => {
        if (dirty) frame()
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
      composer.destroy()
      clay.destroy()
    },
  }
}

/** Paint a Clay RenderCommand into the pixel buffer. Everything is pixels. */
function paintCommand(buf: PixelBuffer, cmd: RenderCommand) {
  const x = Math.round(cmd.x)
  const y = Math.round(cmd.y)
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
      // Phase 4: text is rendered as pixels via Zig bitmap font.
      // No ANSI overlay — everything in the same pixel buffer.
      if (!cmd.text) break
      paint.drawText(buf, x, y, cmd.text, r, g, b, a)
      break
    }

    case CMD.SCISSOR_START:
    case CMD.SCISSOR_END:
      // Clipping not yet implemented
      break
  }
}
