/**
 * Z-index test — investigates if ANSI text over Kitty images (z=-1)
 * produces selectable/copiable text with acceptable visual quality.
 *
 * Run: bun run ztest
 *
 * What to look for:
 *   Card 1 (z=-1): text should be VISIBLE over the dark card, and SELECTABLE with mouse
 *   Card 2 (z=0):  text should be HIDDEN under the image
 *   Visual quality: does the ANSI text look "different" from normal terminal text?
 *
 * Press q to quit.
 */

import { createTerminal } from "@tge/terminal"

const term = await createTerminal()
const { cellWidth, cellHeight } = term.size

// Create a small card image (200x60 pixels, dark blue-tinted)
const w = 300, h = 60
const pixels = new Uint8Array(w * h * 4)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    pixels[i] = 0x1e     // R
    pixels[i + 1] = 0x1e // G
    pixels[i + 2] = 0x2e // B
    pixels[i + 3] = 0xff // A
  }
}

// Approximate rounded corners
const r = 10
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    let dx = 0, dy = 0
    if (x < r && y < r) { dx = r - x; dy = r - y }
    else if (x >= w - r && y < r) { dx = x - (w - r); dy = r - y }
    else if (x < r && y >= h - r) { dx = r - x; dy = y - (h - r) }
    else if (x >= w - r && y >= h - r) { dx = x - (w - r); dy = y - (h - r) }
    if (dx * dx + dy * dy > r * r) pixels[i + 3] = 0
  }
}

// Create a second card with accent border color
const pixels2 = new Uint8Array(pixels)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (pixels2[i + 3] === 0) continue
    // Add cyan border (2px)
    if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) {
      pixels2[i] = 0x4f; pixels2[i + 1] = 0xc4; pixels2[i + 2] = 0xd4
    }
  }
}

function sendImage(data: Uint8Array, imgW: number, imgH: number, z: number) {
  const b64 = Buffer.from(data).toString("base64")
  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += 4096) {
    chunks.push(b64.slice(i, i + 4096))
  }
  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0
    const isLast = i === chunks.length - 1
    const header = isFirst ? `a=T,f=32,s=${imgW},v=${imgH},z=${z},q=2,` : ""
    term.write(`\x1b_G${header}m=${isLast ? 0 : 1};${chunks[i]}\x1b\\`)
  }
}

// Clear and draw
term.beginSync()
term.write("\x1b[2J\x1b[H")

// ── Title ──
term.write("\x1b[1;3H")
term.write("\x1b[38;2;224;230;240mZ-Index Text Selectability Test")
term.write("\x1b[2;3H")
term.write("\x1b[38;2;130;130;170m(try selecting text with mouse — press q to quit)")

// ── Card 1: z=-1 (image UNDER text) ──
term.write("\x1b[4;3H")
term.write("\x1b[38;2;130;130;170mCard 1: image at z=-1 (UNDER text)")

term.write("\x1b[5;3H")
sendImage(pixels2, w, h, -1)

// Write text ON TOP
term.write("\x1b[6;5H")
term.write("\x1b[38;2;224;230;240mThis is REAL terminal text over the image")
term.write("\x1b[7;5H")
term.write("\x1b[38;2;79;196;212mSelect me with your mouse and copy!")

// ── Card 2: z=0 (image OVER text, default) ──
term.write("\x1b[10;3H")
term.write("\x1b[38;2;130;130;170mCard 2: image at z=0 (OVER text, default)")

// Write text first
term.write("\x1b[12;5H")
term.write("\x1b[38;2;224;230;240mThis text should be HIDDEN by the image")
term.write("\x1b[13;5H")
term.write("\x1b[38;2;200;160;64mYou should NOT see this gold text")

// Then image on top
term.write("\x1b[11;3H")
sendImage(pixels, w, h, 0)

// ── Card 3: plain ANSI text (reference for visual comparison) ──
term.write("\x1b[16;3H")
term.write("\x1b[38;2;130;130;170mCard 3: plain ANSI text (no image, reference)")
term.write("\x1b[18;5H")
term.write("\x1b[38;2;224;230;240mThis is normal terminal text for comparison")
term.write("\x1b[19;5H")
term.write("\x1b[38;2;79;196;212mCompare the font rendering quality with Card 1")

// ── Instructions ──
term.write("\x1b[22;3H")
term.write("\x1b[38;2;224;230;240mQuestions:")
term.write("\x1b[23;3H")
term.write("\x1b[38;2;130;130;170m1. Can you SELECT text in Card 1?")
term.write("\x1b[24;3H")
term.write("\x1b[38;2;130;130;170m2. Is Card 2 text hidden by the image?")
term.write("\x1b[25;3H")
term.write("\x1b[38;2;130;130;170m3. Does Card 1 text look the same as Card 3?")

term.endSync()

// Wait for quit
process.stdin.on("data", (d: Buffer) => {
  if (d[0] === 113 || d[0] === 3) {
    term.destroy()
    process.exit(0)
  }
})
