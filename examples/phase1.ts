/**
 * TGE Phase 1 Demo — Imperative pixel rendering in the terminal.
 *
 * This is the Phase 1 milestone: render a rounded rect with shadow,
 * a gradient background, and a glowing circle — all pixel-native
 * in the terminal via the Zig SDF engine.
 *
 * Press 'q' or Ctrl+C to exit.
 *
 * Run: bun run examples/phase1.ts
 * Requires: bun zig:build (to produce libtge.dylib)
 */

import { createTerminal } from "@tge/terminal"
import { create, paint, clear } from "@tge/pixel"
import { createComposer } from "@tge/output"
import { createParser } from "@tge/input"

async function main() {
  const term = await createTerminal()

  const composer = createComposer(term.write, term.rawWrite, term.caps)

  // Debug info — write to terminal title bar instead of screen
  const info = `TGE: ${term.kind}/${composer.backend} ${term.size.cols}x${term.size.rows} cell:${term.size.cellWidth}x${term.size.cellHeight}`
  term.rawWrite(`\x1b]2;${info}\x07`)

  // Create pixel buffer matching terminal pixel dimensions
  const pw = term.size.pixelWidth || term.size.cols * 8
  const ph = term.size.pixelHeight || term.size.rows * 16
  const buf = create(pw, ph)

  // ── Paint the scene ──

  // 1. Dark gradient background
  paint.linearGradient(buf, 0, 0, pw, ph, 0x04, 0x04, 0x0a, 0xff, 0x0a, 0x0a, 0x18, 0xff, 135)

  // 2. Card dimensions — centered
  const cardW = Math.min(320, pw - 80)
  const cardH = Math.min(200, ph - 80)
  const cardX = Math.floor((pw - cardW) / 2)
  const cardY = Math.floor((ph - cardH) / 2)

  // 3. Shadow (paint shadow rect, then blur)
  const shadowOff = 6
  paint.roundedRect(buf, cardX + shadowOff, cardY + shadowOff, cardW, cardH, 0x00, 0x00, 0x00, 0x88, 12)
  paint.blur(buf, cardX - 8, cardY - 8, cardW + 24, cardH + 24, 8, 3)

  // 4. Card background — dark blue with rounded corners
  paint.roundedRect(buf, cardX, cardY, cardW, cardH, 0x16, 0x21, 0x3e, 0xff, 12)

  // 5. Card border — subtle
  paint.strokeRect(buf, cardX, cardY, cardW, cardH, 0x30, 0x38, 0x50, 0xff, 12, 1)

  // 6. Accent line at top of card
  paint.fillRect(buf, cardX + 12, cardY + 1, cardW - 24, 2, 0x4f, 0xc4, 0xd4, 0xff)

  // 7. Glowing circle
  const cx = cardX + Math.floor(cardW / 2)
  const cy = cardY + Math.floor(cardH / 2) - 10
  paint.halo(buf, cx, cy, 40, 40, 0x4f, 0xc4, 0xd4, 0x60, 100)
  paint.filledCircle(buf, cx, cy, 20, 20, 0x4f, 0xc4, 0xd4, 0xff)
  paint.strokedCircle(buf, cx, cy, 20, 20, 0x80, 0xd8, 0xe8, 0xff, 1)

  // 8. Smaller circles
  paint.filledCircle(buf, cardX + 50, cardY + cardH - 40, 8, 8, 0x5c, 0xb8, 0x78, 0xff)
  paint.filledCircle(buf, cardX + 80, cardY + cardH - 40, 8, 8, 0xc8, 0xa0, 0x40, 0xff)
  paint.filledCircle(buf, cardX + 110, cardY + cardH - 40, 8, 8, 0xa8, 0x48, 0x3e, 0xff)

  // 9. Diagonal line
  paint.line(buf, cardX + cardW - 60, cardY + 30, cardX + cardW - 20, cardY + 70, 0x6b, 0x5a, 0x9a, 0xc0, 2)

  // 10. Bezier curve
  paint.bezier(buf,
    cardX + 20, cardY + cardH - 20,
    cardX + Math.floor(cardW / 2), cardY + cardH - 80,
    cardX + cardW - 20, cardY + cardH - 20,
    0x4f, 0xc4, 0xd4, 0x60, 2,
  )

  // ── Render ──
  const cols = term.size.cols
  const rows = term.size.rows
  const cellW = term.size.cellWidth || 8
  const cellH = term.size.cellHeight || 16

  term.beginSync()
  composer.render(buf, 0, 0, cols, rows, cellW, cellH)
  term.endSync()

  // ── Input handling ──
  const parser = createParser((event) => {
    if (event.type === "key") {
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
        cleanup()
      }
    }
  })

  const unsub = term.onData((data) => parser.feed(data))

  function cleanup() {
    unsub()
    parser.destroy()
    composer.destroy()
    term.destroy()
    process.exit(0)
  }
}

main().catch((err) => {
  // Restore terminal even on crash
  console.error(err)
  process.exit(1)
})
