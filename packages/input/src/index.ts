/**
 * @tge/input — Parse raw terminal bytes into semantic events.
 *
 * Transforms stdin bytes into typed events:
 *   - KeyEvent (key name, printable char, modifiers)
 *   - MouseEvent (press, release, move, scroll + position)
 *   - FocusEvent (focus in/out)
 *   - PasteEvent (bracketed paste content)
 *
 * Supports:
 *   - Standard ANSI/xterm key sequences
 *   - Kitty keyboard protocol (enhanced key detection)
 *   - SGR extended mouse protocol (1006)
 *   - Focus tracking (1004)
 *   - Bracketed paste mode (2004)
 *
 * Usage:
 *   import { createParser } from "@tge/input"
 *
 *   const parser = createParser((event) => {
 *     if (event.type === "key" && event.key === "q") process.exit(0)
 *     if (event.type === "mouse") console.log(event.x, event.y)
 *   })
 *
 *   terminal.onData((data) => parser.feed(data))
 */

export { createParser } from "./parser"
export type { InputParser, InputHandler } from "./parser"

export { parseKey } from "./keyboard"
export { parseMouse } from "./mouse"

export type {
  InputEvent,
  KeyEvent,
  MouseEvent,
  FocusEvent,
  PasteEvent,
  ResizeEvent,
  MouseAction,
  Modifiers,
} from "./types"

export { NO_MODS, decodeMods } from "./types"
