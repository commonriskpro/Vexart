/**
 * Unified input parser — dispatches raw stdin bytes to sub-parsers.
 *
 * Handles the full input pipeline:
 *   1. Buffer incoming data (stdin can split multi-byte sequences)
 *   2. Try each parser in priority order:
 *      a. Mouse (SGR \x1b[<...)
 *      b. Focus (\x1b[I / \x1b[O)
 *      c. Bracketed paste (\x1b[200~ ... \x1b[201~)
 *      d. Kitty keyboard (\x1b[...u)
 *      e. Keyboard (CSI, SS3, single bytes)
 *   3. Emit typed events via callback
 *
 * The parser is a simple state machine that processes the buffer
 * until no more complete sequences are found.
 */

import type { InputEvent, FocusEvent, PasteEvent, KeyEvent } from "./types"
import { parseKey } from "./keyboard"
import { parseMouse } from "./mouse"

/** @public */
export type InputHandler = (event: InputEvent) => void

/** @public */
export type InputParser = {
  /** Feed raw data from stdin. Emits events via the handler. */
  feed: (data: Buffer) => void
  /** Destroy the parser, clear state. */
  destroy: () => void
}

const PASTE_START = "\x1b[200~"
const PASTE_END = "\x1b[201~"
const KITTY_RESPONSE_START = "\x1b_G"
const KITTY_RESPONSE_ST = "\x1b\\"
const KITTY_RESPONSE_BEL = "\x07"
const MAX_KITTY_RESPONSE = 4096

/**
 * Find the earliest ECMA-48 / Kitty graphics response terminator (ST or BEL).
 */
export function findKittyResponseEnd(
  buffer: string,
  fromIndex: number,
): { index: number; length: number } | null {
  const stIndex = buffer.indexOf(KITTY_RESPONSE_ST, fromIndex)
  const belIndex = buffer.indexOf(KITTY_RESPONSE_BEL, fromIndex)

  if (stIndex === -1 && belIndex === -1) {
    return null
  }
  if (stIndex === -1) {
    return { index: belIndex, length: KITTY_RESPONSE_BEL.length }
  }
  if (belIndex === -1) {
    return { index: stIndex, length: KITTY_RESPONSE_ST.length }
  }
  return stIndex < belIndex
    ? { index: stIndex, length: KITTY_RESPONSE_ST.length }
    : { index: belIndex, length: KITTY_RESPONSE_BEL.length }
}

/**
 * Return whether a CSI/SS3 sequence is a known sequence that may still be
 * completed by a later stdin chunk. Keeping this check narrow is important:
 * an invalid escape sequence should not cause following ordinary input to be
 * buffered indefinitely.
 */
function isIncompleteEscape(data: string): boolean {
  if (data.startsWith("\x1bO")) return data.length < 3

  if (!data.startsWith("\x1b[")) return false

  // SGR mouse: ESC[<button;x;yM/m. parseMouse handles complete sequences;
  // retain valid-looking prefixes until the final byte arrives.
  if (/^\x1b\[<\d*(?:;\d*){0,2}$/.test(data)) return true

  // Keyboard/focus/Kitty CSI sequences use numeric parameters (possibly a
  // modifier separator). A final byte makes the sequence complete, so this
  // only matches the parameter portion of a CSI sequence.
  return /^\x1b\[\d*(?:;\d*){0,2}$/.test(data)
}

function malformedModifyOtherKeysLength(data: string): number {
  const match = data.match(/^\x1b\[27;[^\x1b~]*~/)
  return match ? match[0].length : 0
}

function parseAltUnderscore(data: string): [KeyEvent, number] | null {
  const parsed = parseKey(data)
  if (parsed) return parsed
  if (!data.startsWith("\x1b_")) return null
  return [{
    type: "key",
    key: "_",
    char: "_",
    mods: { shift: false, alt: true, ctrl: false, meta: false },
  }, 2]
}

/**
 * Create an input parser that emits typed events.
 *
 * Call `feed()` with each Buffer from stdin.on("data").
 * The handler receives parsed InputEvent objects.
 */
/** @public */
export function createParser(handler: InputHandler): InputParser {
  let buffer = ""
  let pasting = false
  let pasteContent = ""
  const decoder = new TextDecoder("utf-8", { fatal: false })
  let escapeTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleEscapeTimer() {
    if (escapeTimer) return
    escapeTimer = setTimeout(() => {
      escapeTimer = null
      if (buffer.length === 1 && buffer[0] === "\x1b") {
        const keyResult = parseKey(buffer)
        if (keyResult) {
          handler(keyResult[0])
          buffer = buffer.slice(keyResult[1])
        }
      } else if (buffer === "\x1b_") {
        // ESC_ may be either the beginning of a Kitty APC response or an
        // Alt+underscore key. Do not leave the latter buffered forever.
        const keyResult = parseAltUnderscore(buffer)
        if (keyResult) {
          handler(keyResult[0])
          buffer = buffer.slice(keyResult[1])
        }
      }
      process()
    }, 20)
  }

  function process() {
    while (buffer.length > 0) {
      // ── Bracketed paste mode ──
      if (pasting) {
        const end = buffer.indexOf(PASTE_END)
        if (end === -1) {
          // End marker not yet received. Preserve a suffix that could be the
          // beginning of the marker; tmux/PTY reads can split it anywhere.
          let keep = 0
          for (let size = Math.min(PASTE_END.length - 1, buffer.length); size > 0; size--) {
            if (buffer.endsWith(PASTE_END.slice(0, size))) {
              keep = size
              break
            }
          }
          pasteContent += buffer.slice(0, buffer.length - keep)
          buffer = buffer.slice(buffer.length - keep)
          return
        }
        pasteContent += buffer.slice(0, end)
        buffer = buffer.slice(end + PASTE_END.length)
        pasting = false
        const event: PasteEvent = { type: "paste", text: pasteContent }
        pasteContent = ""
        handler(event)
        continue
      }

      // ── Bracketed paste start ──
      if (buffer.startsWith(PASTE_START)) {
        pasting = true
        pasteContent = ""
        buffer = buffer.slice(PASTE_START.length)
        continue
      }

      // ── Kitty graphics response (APC) ──
      // Kitty's graphics/SHM acknowledgements arrive on stdin as APC
      // responses. They are not keyboard input and must be consumed before
      // parseKey can reinterpret their payload as ordinary characters.
      if (buffer.startsWith(KITTY_RESPONSE_START)) {
        if (escapeTimer) { clearTimeout(escapeTimer); escapeTimer = null }
        const end = findKittyResponseEnd(buffer, KITTY_RESPONSE_START.length)
        if (end) {
          buffer = buffer.slice(end.index + end.length)
          continue
        }
        if (buffer.length > MAX_KITTY_RESPONSE) {
          // An unterminated APC cannot be framed safely. Truncate only the malformed
          // sequence up to the next escape sequence to preserve following input events.
          const nextEscape = buffer.indexOf("\x1b", KITTY_RESPONSE_START.length)
          if (nextEscape !== -1) {
            buffer = buffer.slice(nextEscape)
            continue
          }
          buffer = ""
          return
        }
        return
      }

      // A split ESC/_/G prefix needs a short grace period before treating
      // ESC_ as Alt+underscore. Once G arrives, the APC branch above takes
      // ownership and clears this timer.
      if (buffer === "\x1b_") {
        scheduleEscapeTimer()
        return
      }

      if (buffer.startsWith("\x1b_") && buffer[2] !== "G") {
        const keyResult = parseAltUnderscore(buffer)
        if (keyResult) {
          handler(keyResult[0])
          buffer = buffer.slice(keyResult[1])
          continue
        }
      }

      // ── Focus events ──
      if (buffer.startsWith("\x1b[I")) {
        const event: FocusEvent = { type: "focus", focused: true }
        buffer = buffer.slice(3)
        handler(event)
        continue
      }
      if (buffer.startsWith("\x1b[O")) {
        // Check it's not an SS3 sequence (\x1bO without [)
        const event: FocusEvent = { type: "focus", focused: false }
        buffer = buffer.slice(3)
        handler(event)
        continue
      }

      // ── Mouse (SGR) ──
      const mouseResult = parseMouse(buffer)
      if (mouseResult) {
        handler(mouseResult[0])
        buffer = buffer.slice(mouseResult[1])
        continue
      }

      // ── Keyboard ──
      // If we have an escape but the sequence might be incomplete, wait for more data
      if (buffer[0] === "\x1b" && buffer.length === 1) {
        scheduleEscapeTimer()
        return
      }

      if (escapeTimer) { clearTimeout(escapeTimer); escapeTimer = null }

      if (buffer[0] === "\x1b" && buffer.length >= 2) {
        // Have at least 2 bytes starting with escape — try parsing
        const keyResult = parseKey(buffer)
        if (keyResult) {
          handler(keyResult[0])
          buffer = buffer.slice(keyResult[1])
          continue
        }

        // Could be an incomplete sequence. Only hold known-looking prefixes;
        // malformed escapes should not swallow ordinary keys after them.
        if (isIncompleteEscape(buffer)) {
          return
        }

        // parseKey rejects out-of-range modifyOtherKeys codepoints. Consume
        // the complete malformed sequence so its payload is not reinterpreted
        // as a series of ordinary keys, while retaining following input.
        const malformedLength = malformedModifyOtherKeysLength(buffer)
        if (malformedLength > 0) {
          buffer = buffer.slice(malformedLength)
          continue
        }

        // Unknown escape sequence — skip the escape byte
        buffer = buffer.slice(1)
        continue
      }

      // ── Regular key ──
      const keyResult = parseKey(buffer)
      if (keyResult) {
        handler(keyResult[0])
        buffer = buffer.slice(keyResult[1])
        continue
      }

      // Unknown byte — skip
      buffer = buffer.slice(1)
    }
  }

  return {
    feed(data: Buffer) {
      buffer += decoder.decode(data, { stream: true })
      process()
    },

    destroy() {
      if (escapeTimer) { clearTimeout(escapeTimer); escapeTimer = null }
      buffer = ""
      pasting = false
      pasteContent = ""
    },
  }
}
