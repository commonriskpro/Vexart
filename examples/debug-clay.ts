/**
 * Debug: verify Clay FFI produces render commands.
 */
import { clay, CMD, SIZING, DIRECTION, ALIGN_X, ALIGN_Y } from "../packages/core/src/clay"

// Init Clay
const ok = clay.init(800, 600)
console.log("Clay init:", ok ? "✅" : "❌")

// Simple layout: root (800x600, centered) → child (200x100, red)
clay.beginLayout()

// Root: fixed 800x600, center children
clay.openElement()
clay.configureSizing(SIZING.FIXED, 800, SIZING.FIXED, 600)
clay.configureLayout(DIRECTION.LEFT_TO_RIGHT, 0, 0, 0, ALIGN_X.CENTER, ALIGN_Y.CENTER)
clay.configureRectangle(0x222222ff, 0)

  // Child: fixed 200x100, red
  clay.openElement()
  clay.configureSizing(SIZING.FIXED, 200, SIZING.FIXED, 100)
  clay.configureRectangle(0xff0000ff, 8)
  clay.closeElement()

clay.closeElement()

const commands = clay.endLayout()
console.log("Commands count:", commands.length)

for (let i = 0; i < commands.length; i++) {
  const cmd = commands[i]
  console.log(`  [${i}] type=${cmd.type} pos=(${cmd.x.toFixed(1)},${cmd.y.toFixed(1)}) size=${cmd.width.toFixed(1)}x${cmd.height.toFixed(1)} color=[${cmd.color.map(c=>Math.round(c))}] radius=${cmd.cornerRadius}`)
}

clay.destroy()
