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

import type { InputEvent, FocusEvent, PasteEvent } from "./types"
import { parseKey } from "./keyboard"
import { parseMouse } from "./mouse"

export type InputHandler = (event: InputEvent) => void

export type InputParser = {
  /** Feed raw data from stdin. Emits events via the handler. */
  feed: (data: Buffer) => void
  /** Destroy the parser, clear state. */
  destroy: () => void
}

/**
 * Create an input parser that emits typed events.
 *
 * Call `feed()` with each Buffer from stdin.on("data").
 * The handler receives parsed InputEvent objects.
 */
export function createParser(handler: InputHandler): InputParser {
  let buffer = ""
  let pasting = false
  let pasteContent = ""

  function process() {
    while (buffer.length > 0) {
      // ── Bracketed paste mode ──
      if (pasting) {
        const end = buffer.indexOf("\x1b[201~")
        if (end === -1) {
          // End marker not yet received — accumulate
          pasteContent += buffer
          buffer = ""
          return
        }
        pasteContent += buffer.slice(0, end)
        buffer = buffer.slice(end + 6)
        pasting = false
        const event: PasteEvent = { type: "paste", text: pasteContent }
        pasteContent = ""
        handler(event)
        continue
      }

      // ── Bracketed paste start ──
      if (buffer.startsWith("\x1b[200~")) {
        pasting = true
        pasteContent = ""
        buffer = buffer.slice(6)
        continue
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
        // Could be standalone Escape or start of a sequence.
        // Use a timeout approach: emit Escape if nothing follows.
        // For simplicity in Phase 1, emit immediately as Escape.
        const keyResult = parseKey(buffer)
        if (keyResult) {
          handler(keyResult[0])
          buffer = buffer.slice(keyResult[1])
        } else {
          buffer = buffer.slice(1) // discard unknown
        }
        continue
      }

      if (buffer[0] === "\x1b" && buffer.length >= 2) {
        // Have at least 2 bytes starting with escape — try parsing
        const keyResult = parseKey(buffer)
        if (keyResult) {
          handler(keyResult[0])
          buffer = buffer.slice(keyResult[1])
          continue
        }

        // Could be an incomplete sequence — check if it looks like a known prefix
        if (buffer.length < 6 && (buffer[1] === "[" || buffer[1] === "O")) {
          // Might be an incomplete CSI/SS3 — wait for more data
          return
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
      buffer += data.toString("utf-8")
      process()
    },

    destroy() {
      buffer = ""
      pasting = false
      pasteContent = ""
    },
  }
}
