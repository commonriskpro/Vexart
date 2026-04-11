/**
 * TGE Phase 2 Demo — Clay layout + Zig paint.
 *
 * Tests the Clay layout engine integration:
 *   1. Declare a UI tree via Clay API
 *   2. Clay calculates layout positions
 *   3. Paint each element with Zig SDF
 *   4. Output via composer
 *
 * Press 'q' to exit.
 *
 * Run: bun run examples/phase2.ts
 * Requires: bun zig:build && bun run clay:build
 */

import { createTerminal } from "@tge/terminal"
import { create, clear, paint } from "@tge/pixel"
import { createComposer } from "@tge/output"
import { createParser } from "@tge/input"
import { clay, CMD, SIZING, DIRECTION, ALIGN_X, ALIGN_Y } from "@tge/renderer/clay"

async function main() {
  const term = await createTerminal()
  const composer = createComposer(term.write, term.rawWrite, term.caps)

  const pw = term.size.pixelWidth || term.size.cols * 8
  const ph = term.size.pixelHeight || term.size.rows * 16

  // Initialize Clay
  clay.init(pw, ph)

  // Create pixel buffer
  const buf = create(pw, ph)

  // ── Layout pass ──
  clay.beginLayout()

  // Root container — full screen, centered
  clay.openElement()
  clay.configureSizing(SIZING.FIXED, pw, SIZING.FIXED, ph)
  clay.configureLayout(DIRECTION.LEFT_TO_RIGHT, 0, 0, 0, ALIGN_X.CENTER, ALIGN_Y.CENTER)
  clay.configureRectangle(0x04040aff, 0)

    // Card
    clay.openElement()
    clay.configureSizing(SIZING.FIXED, 320, SIZING.FIXED, 220)
    clay.configureLayout(DIRECTION.TOP_TO_BOTTOM, 24, 24, 16, ALIGN_X.CENTER, ALIGN_Y.TOP)
    clay.configureRectangle(0x16213eff, 12)

      // Header row
      clay.openElement()
      clay.configureSizing(SIZING.GROW, 0, SIZING.FIT, 0)
      clay.configureLayout(DIRECTION.LEFT_TO_RIGHT, 0, 0, 12, ALIGN_X.LEFT, ALIGN_Y.CENTER)

        // Green dot
        clay.openElement()
        clay.configureSizing(SIZING.FIXED, 16, SIZING.FIXED, 16)
        clay.configureRectangle(0x5cb878ff, 8)
        clay.closeElement()

        // Yellow dot
        clay.openElement()
        clay.configureSizing(SIZING.FIXED, 16, SIZING.FIXED, 16)
        clay.configureRectangle(0xb8a850ff, 8)
        clay.closeElement()

        // Red dot
        clay.openElement()
        clay.configureSizing(SIZING.FIXED, 16, SIZING.FIXED, 16)
        clay.configureRectangle(0xa8483eff, 8)
        clay.closeElement()

      clay.closeElement() // header row

      // Content area
      clay.openElement()
      clay.configureSizing(SIZING.GROW, 0, SIZING.GROW, 0)
      clay.configureLayout(DIRECTION.TOP_TO_BOTTOM, 12, 12, 8, ALIGN_X.CENTER, ALIGN_Y.CENTER)
      clay.configureRectangle(0x0e0e18ff, 8)

        // Inner box
        clay.openElement()
        clay.configureSizing(SIZING.FIXED, 120, SIZING.FIXED, 40)
        clay.configureRectangle(0x4fc4d4ff, 6)
        clay.closeElement()

        // Another box
        clay.openElement()
        clay.configureSizing(SIZING.FIXED, 80, SIZING.FIXED, 24)
        clay.configureRectangle(0x6b5a9aff, 6)
        clay.closeElement()

      clay.closeElement() // content area

      // Footer row
      clay.openElement()
      clay.configureSizing(SIZING.GROW, 0, SIZING.FIT, 0)
      clay.configureLayout(DIRECTION.LEFT_TO_RIGHT, 0, 0, 8, ALIGN_X.CENTER, ALIGN_Y.CENTER)

        // Small boxes in a row
        for (let i = 0; i < 5; i++) {
          clay.openElement()
          clay.configureSizing(SIZING.FIXED, 24, SIZING.FIXED, 8)
          const colors = [0x4fc4d4ff, 0x4088ccff, 0xc8a040ff, 0xa8483eff, 0x6b5a9aff]
          clay.configureRectangle(colors[i], 4)
          clay.closeElement()
        }

      clay.closeElement() // footer row

    clay.closeElement() // card

  clay.closeElement() // root

  const commands = clay.endLayout()

  // ── Paint ──
  clear(buf, 0x04040aff)

  for (const cmd of commands) {
    if (cmd.type === CMD.RECTANGLE) {
      const x = Math.round(cmd.x)
      const y = Math.round(cmd.y)
      const w = Math.round(cmd.width)
      const h = Math.round(cmd.height)
      const [r, g, b, a] = cmd.color
      const radius = Math.round(cmd.cornerRadius)

      if (a === 0) continue
      if (radius > 0) {
        paint.roundedRect(buf, x, y, w, h, r, g, b, a, radius)
      } else {
        paint.fillRect(buf, x, y, w, h, r, g, b, a)
      }
    }
  }

  // ── Output ──
  const cols = term.size.cols
  const rows = term.size.rows
  const cellW = term.size.cellWidth || 8
  const cellH = term.size.cellHeight || 16

  term.beginSync()
  composer.render(buf, 0, 0, cols, rows, cellW, cellH)
  term.endSync()

  // ── Input ──
  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      composer.destroy()
      clay.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
