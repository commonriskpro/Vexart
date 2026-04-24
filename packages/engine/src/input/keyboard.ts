/**
 * Keyboard input parser.
 *
 * Parses ANSI/xterm escape sequences and Kitty keyboard protocol
 * sequences into KeyEvent objects.
 *
 * Supported formats:
 *   - Single bytes: printable chars, Ctrl+letter
 *   - SS3 sequences: \x1bO{A-D} (arrow keys from some terminals)
 *   - CSI sequences: \x1b[... (arrows, function keys, modifiers)
 *   - Kitty keyboard: \x1b[{keycode}[;{mods}]u
 *   - Alt+key: \x1b{char} (meta prefix)
 */

import type { KeyEvent, Modifiers } from "./types"
import { NO_MODS, decodeMods } from "./types"

// ── CSI final byte → key name ──

const CSI_KEYS: Record<string, string> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
  Z: "shift-tab",
}

// ── CSI number → key name (tilde sequences: \x1b[{n}~) ──

const TILDE_KEYS: Record<number, string> = {
  1: "home",
  2: "insert",
  3: "delete",
  4: "end",
  5: "pageup",
  6: "pagedown",
  7: "home",
  8: "end",
  11: "f1",
  12: "f2",
  13: "f3",
  14: "f4",
  15: "f5",
  17: "f6",
  18: "f7",
  19: "f8",
  20: "f9",
  21: "f10",
  23: "f11",
  24: "f12",
}

// ── Kitty keyboard codepoint → key name ──

const KITTY_KEYS: Record<number, string> = {
  9: "tab",
  13: "enter",
  27: "escape",
  127: "backspace",
  57358: "capslock",
  57359: "scrolllock",
  57360: "numlock",
  57361: "printscreen",
  57362: "pause",
  57363: "menu",
  57376: "f13",
  57377: "f14",
  57378: "f15",
  57379: "f16",
  57380: "f17",
  57381: "f18",
  57382: "f19",
  57383: "f20",
}

/** @public Try to parse a keyboard event from the data. Returns the event and consumed byte count, or null. */
export function parseKey(data: string): [KeyEvent, number] | null {
  if (data.length === 0) return null

  // ── Kitty keyboard protocol: \x1b[{code}[;{mods}]u ──
  const kittyMatch = data.match(/^\x1b\[(\d+)(?:;(\d+))?u/)
  if (kittyMatch) {
    const code = parseInt(kittyMatch[1], 10)
    const mods = kittyMatch[2] ? decodeMods(parseInt(kittyMatch[2], 10)) : NO_MODS
    const name = KITTY_KEYS[code] ?? String.fromCodePoint(code)
    const char = code >= 32 && code < 127 ? String.fromCodePoint(code) : ""
    return [{ type: "key", key: name.toLowerCase(), char, mods }, kittyMatch[0].length]
  }

  // ── CSI sequences: \x1b[...{final} ──
  const csiMatch = data.match(/^\x1b\[(\d*(?:;\d+)*)([A-Za-z~])/)
  if (csiMatch) {
    const params = csiMatch[1]
    const final = csiMatch[2]
    const consumed = csiMatch[0].length

    if (final === "~") {
      // Tilde sequence: \x1b[{n}~ or \x1b[{n};{mod}~
      const parts = params.split(";")
      const num = parseInt(parts[0], 10)
      const mods = parts[1] ? decodeMods(parseInt(parts[1], 10)) : NO_MODS
      const key = TILDE_KEYS[num] ?? `unknown-${num}`
      return [{ type: "key", key, char: "", mods }, consumed]
    }

    // Letter final: arrows, home, end
    const key = CSI_KEYS[final]
    if (key) {
      const parts = params.split(";")
      const mods = parts[1] ? decodeMods(parseInt(parts[1], 10)) : NO_MODS
      return [{ type: "key", key, char: "", mods }, consumed]
    }

    return null // unknown CSI — not a keyboard event
  }

  // ── SS3 sequences: \x1bO{char} ──
  if (data.startsWith("\x1bO") && data.length >= 3) {
    const ch = data[2]
    const key = CSI_KEYS[ch]
    if (key) {
      return [{ type: "key", key, char: "", mods: NO_MODS }, 3]
    }
    // SS3 F1-F4
    const ss3Fn: Record<string, string> = { P: "f1", Q: "f2", R: "f3", S: "f4" }
    const fn = ss3Fn[ch]
    if (fn) {
      return [{ type: "key", key: fn, char: "", mods: NO_MODS }, 3]
    }
  }

  // ── Alt+key: \x1b{char} (if not CSI/SS3/kitty) ──
  if (data[0] === "\x1b" && data.length >= 2 && data[1] !== "[" && data[1] !== "O" && data[1] !== "_") {
    const ch = data[1]
    const mods: Modifiers = { shift: false, alt: true, ctrl: false, meta: false }
    if (ch >= " " && ch <= "~") {
      return [{ type: "key", key: ch.toLowerCase(), char: ch, mods }, 2]
    }
    // Alt+Ctrl combo
    const code = ch.charCodeAt(0)
    if (code >= 1 && code <= 26) {
      const letter = String.fromCharCode(code + 96)
      return [{ type: "key", key: letter, char: "", mods: { ...mods, ctrl: true } }, 2]
    }
  }

  // ── Standalone escape ──
  if (data[0] === "\x1b" && data.length === 1) {
    return [{ type: "key", key: "escape", char: "", mods: NO_MODS }, 1]
  }

  // ── Ctrl+letter (bytes 1-26) ──
  const byte = data.charCodeAt(0)
  if (byte >= 1 && byte <= 26) {
    const letter = String.fromCharCode(byte + 96)
    const key = byte === 9 ? "tab" : byte === 13 ? "enter" : letter
    const mods: Modifiers = { shift: false, alt: false, ctrl: byte !== 9 && byte !== 13, meta: false }
    return [{ type: "key", key, char: "", mods }, 1]
  }

  // ── Backspace (127) ──
  if (byte === 127) {
    return [{ type: "key", key: "backspace", char: "", mods: NO_MODS }, 1]
  }

  // ── Printable character ──
  if (byte >= 32) {
    // Handle multi-byte UTF-8
    const cp = data.codePointAt(0)
    if (cp === undefined) return null
    const char = String.fromCodePoint(cp)
    const len = char.length // surrogate pair = 2 UTF-16 code units
    return [{ type: "key", key: char.toLowerCase(), char, mods: NO_MODS }, len]
  }

  return null
}
