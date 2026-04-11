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
// paintCommand uses raw RGBA from cmd.color (no packing needed).

export type TextEntry = {
  text: string
  col: number
  row: number
  /** Pixel position from Clay (for rect containment check) */
  px: number
  py: number
  r: number
  g: number
  b: number
}

type PaintedRect = {
  px: number
  py: number
  pw: number
  ph: number
  cr: number // corner radius
  r: number
  g: number
  b: number
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

    // 3. Paint each render command, collect text entries and painted rects
    const textEntries: TextEntry[] = []
    const paintedRects: PaintedRect[] = []
    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16

    for (const cmd of commands) {
      paintCommand(buf, cmd, cellW, cellH, textEntries, paintedRects)
    }

    // 4. Output pixel buffer
    const cols = term.size.cols
    const rows = term.size.rows

    term.beginSync()
    composer.render(buf, 0, 0, cols, rows, cellW, cellH)

    // 5. Overlay text on top of pixel image.
    // For each text row: fill the ENTIRE row within its container rect
    // with ANSI bg spaces (replacing all placeholders uniformly on that row),
    // then write the text. This avoids the seam between text cells (ANSI bg)
    // and non-text cells (placeholder image) on the same row.
    // We only fill the TEXT ROW, not the full rect — this preserves corners,
    // padding rows, and other elements rendered by the placeholder image.
    const filledRows = new Set<string>() // "row:colStart:colEnd" dedup key

    for (const t of textEntries) {
      // Find bg from innermost non-fullscreen container rect
      let bgR = 4, bgG = 4, bgB = 10
      let rowColStart = t.col
      let rowColEnd = t.col + t.text.length
      for (const rc of paintedRects) {
        if (t.px >= rc.px && t.py >= rc.py &&
            t.px < rc.px + rc.pw && t.py < rc.py + rc.ph) {
          bgR = rc.r; bgG = rc.g; bgB = rc.b
          // Use container bounds for row fill (only if not fullscreen)
          if (rc.pw < buf.width || rc.ph < buf.height) {
            rowColStart = Math.ceil(rc.px / cellW)
            rowColEnd = Math.floor((rc.px + rc.pw) / cellW)
          }
        }
      }

      // Fill entire row span within container with bg spaces
      const key = `${t.row}:${rowColStart}:${rowColEnd}`
      if (!filledRows.has(key)) {
        filledRows.add(key)
        const w = rowColEnd - rowColStart
        if (w > 0) {
          term.rawWrite(`\x1b[${t.row + 1};${rowColStart + 1}H`)
          term.rawWrite(`\x1b[48;2;${bgR};${bgG};${bgB}m`)
          term.rawWrite(" ".repeat(w))
        }
      }

      // Write text at correct position
      term.rawWrite(`\x1b[${t.row + 1};${t.col + 1}H`)
      term.rawWrite(`\x1b[38;2;${t.r};${t.g};${t.b};48;2;${bgR};${bgG};${bgB}m`)
      term.rawWrite(t.text)
    }
    if (textEntries.length > 0) {
      term.rawWrite(`\x1b[0m`)
    }

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

/** Paint a Clay RenderCommand into the pixel buffer. Collects text entries and painted rects. */
function paintCommand(buf: PixelBuffer, cmd: RenderCommand, cellW: number, cellH: number, textEntries: TextEntry[], paintedRects: PaintedRect[]) {
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
      // Track painted rects for text container lookup
      if (a > 0) {
        paintedRects.push({ px: x, py: y, pw: w, ph: h, cr: radius, r, g, b })
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
      const col = Math.floor(x / cellW)
      const row = Math.floor(y / cellH)
      textEntries.push({ text: cmd.text, col, row, px: x, py: y, r, g, b })
      break
    }

    case CMD.SCISSOR_START:
    case CMD.SCISSOR_END:
      // Clipping not yet implemented
      break
  }
}
