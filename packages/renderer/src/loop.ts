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
import { render as solidRender } from "./reconciler"
import { packColor } from "./paint-bridge"

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
  root.props = { width: "100%", height: "100%", direction: "column" }

  // Initialize Clay with pixel dimensions
  const pw = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
  const ph = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)
  clay.init(pw, ph)

  // Create pixel buffer and composer
  let buf = create(pw, ph)
  const composer = createComposer(term.write, term.rawWrite, term.caps)

  let timer: ReturnType<typeof setInterval> | null = null
  let dirty = true

  // Mark dirty when SolidJS updates
  // (In a full implementation, SolidJS effects would set this)

  /** Walk TGENode tree and replay into Clay (immediate mode). */
  function walkTree(node: TGENode) {
    if (node.kind === "text") {
      // Text is a leaf node
      const color = parseColor(node.props.color) || 0xe0e0e0ff
      const fontSize = node.props.fontSize ?? 16
      const fontId = node.props.fontId ?? 0
      clay.text(node.text, color, fontId, fontSize)
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

    // 3. Paint each render command
    for (const cmd of commands) {
      paintCommand(buf, cmd)
    }

    // 4. Output
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

/** Paint a Clay RenderCommand into the pixel buffer. */
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
      // For Phase 2, text is rendered as a simple colored rect placeholder
      // Real text rendering comes in Phase 3
      // For now, we skip text painting — Clay calculated the layout positions
      break
    }

    case CMD.SCISSOR_START:
    case CMD.SCISSOR_END:
      // Clipping not yet implemented
      break
  }
}
