/**
 * Terminal capability detection.
 *
 * Two strategies:
 *   1. Static inference — from terminal kind + env vars (instant, no I/O)
 *   2. Active probe — send escape sequences and parse responses (async)
 *
 * Static is used for things we can know from env (truecolor, kitty keyboard).
 * Active probe is used for kitty graphics (send a test image, check response).
 *
 * The capabilities object is the single source of truth for what
 * this terminal can do. Every module downstream checks caps, never env vars.
 */

import type { TerminalKind } from "./detect"
import { inTmux, passthroughSupported, createWriter } from "./tmux"

export type Capabilities = {
  /** Terminal emulator name */
  kind: TerminalKind
  /** Kitty graphics protocol (pixel images) */
  kittyGraphics: boolean
  /** Kitty Unicode placeholders (pixel images in tmux) */
  kittyPlaceholder: boolean
  /** Kitty keyboard protocol (enhanced key events) */
  kittyKeyboard: boolean
  /** Sixel graphics support */
  sixel: boolean
  /** 24-bit true color (16M colors) */
  truecolor: boolean
  /** SGR mouse protocol (1006) */
  mouse: boolean
  /** Focus in/out events (1004) */
  focus: boolean
  /** Bracketed paste mode (2004) */
  bracketedPaste: boolean
  /** Synchronized output (mode 2026) */
  syncOutput: boolean
  /** Running inside tmux */
  tmux: boolean
  /** Parent terminal behind tmux (if applicable) */
  parentKind: TerminalKind | null
}

/** Infer capabilities from terminal kind without any I/O. */
export function inferCaps(kind: TerminalKind): Capabilities {
  const tmux = inTmux()

  const caps: Capabilities = {
    kind,
    kittyGraphics: false,
    kittyPlaceholder: false,
    kittyKeyboard: false,
    sixel: false,
    truecolor: false,
    mouse: true,
    focus: true,
    bracketedPaste: true,
    syncOutput: true,
    tmux,
    parentKind: null,
  }

  // Truecolor: most modern terminals support it
  const colorterm = process.env["COLORTERM"]
  if (colorterm === "truecolor" || colorterm === "24bit") {
    caps.truecolor = true
  }

  switch (kind) {
    case "ghostty":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyPlaceholder = tmux && passthroughSupported()
      caps.kittyKeyboard = true
      caps.syncOutput = true
      break

    case "kitty":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyPlaceholder = tmux && passthroughSupported()
      caps.kittyKeyboard = true
      caps.syncOutput = true
      break

    case "wezterm":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyPlaceholder = tmux && passthroughSupported()
      caps.kittyKeyboard = true
      caps.sixel = true
      caps.syncOutput = true
      break

    case "iterm2":
      caps.truecolor = true
      caps.sixel = true
      // iTerm2 doesn't support Kitty graphics
      caps.kittyGraphics = false
      caps.kittyPlaceholder = false
      caps.kittyKeyboard = false
      break

    case "foot":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyKeyboard = true
      caps.sixel = true
      break

    case "contour":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyKeyboard = true
      caps.sixel = true
      break

    case "alacritty":
      caps.truecolor = true
      // Alacritty has no image protocol
      caps.kittyGraphics = false
      caps.kittyKeyboard = false
      break

    case "xterm":
      // Assume truecolor if COLORTERM says so (already checked above)
      caps.sixel = false // most xterm builds don't have sixel
      break

    case "unknown":
      break
  }

  return caps
}

/**
 * Probe for Kitty graphics protocol support.
 *
 * Sends a 1x1 transparent PNG probe image and checks if the
 * terminal responds with OK. Handles tmux passthrough.
 *
 * Returns true if kitty graphics are supported.
 */
export function probeKittyGraphics(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      if (str.includes("_Gi=31;OK")) {
        cleanup()
        resolve(true)
      } else if (str.includes("_Gi=31;")) {
        cleanup()
        resolve(false)
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeout)

    onData(handler)

    // Send probe: 1x1 RGBA pixel, query action, suppress display
    const wrapped = createWriter(write)
    wrapped("\x1b_Gi=31,s=1,v=1,a=q,t=d,f=32;AAAAAA==\x1b\\")
  })
}

/**
 * Query terminal colors (background, foreground) via OSC 10/11.
 *
 * Returns parsed colors or null if the terminal doesn't respond.
 * Uses OSC 11 for background, OSC 10 for foreground.
 */
export function queryColors(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 1000,
): Promise<{ bg: [number, number, number] | null; fg: [number, number, number] | null }> {
  return new Promise((resolve) => {
    let bg: [number, number, number] | null = null
    let fg: [number, number, number] | null = null
    let done = false

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()

      // OSC 11 response: \x1b]11;rgb:RRRR/GGGG/BBBB
      const bgMatch = str.match(/\x1b]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i)
      if (bgMatch) {
        bg = [
          parseInt(bgMatch[1], 16) >> 8,
          parseInt(bgMatch[2], 16) >> 8,
          parseInt(bgMatch[3], 16) >> 8,
        ]
      }

      // OSC 10 response: \x1b]10;rgb:RRRR/GGGG/BBBB
      const fgMatch = str.match(/\x1b]10;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i)
      if (fgMatch) {
        fg = [
          parseInt(fgMatch[1], 16) >> 8,
          parseInt(fgMatch[2], 16) >> 8,
          parseInt(fgMatch[3], 16) >> 8,
        ]
      }

      if (bg && fg) {
        cleanup()
        resolve({ bg, fg })
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve({ bg, fg })
    }, timeout)

    onData(handler)

    // Query background (OSC 11) and foreground (OSC 10)
    write("\x1b]11;?\x07")
    write("\x1b]10;?\x07")
  })
}
