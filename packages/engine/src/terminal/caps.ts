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
import { inTmux, parentTerminal, parentSupportsKittyPlaceholder, passthroughSupported, createWriter } from "./tmux"

/** @public */
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
  /**
   * Best available Kitty graphics transmission mode.
   *   - "shm":    POSIX shared memory (fastest, ~0.01ms per frame)
   *   - "file":   temp file (fast, ~1-2ms per frame)
   *   - "direct": base64 escape codes (universal, ~5-10ms per frame)
   *
   * Auto-detected during createTerminal(). SSH/remote → always "direct".
   */
  transmissionMode: "shm" | "file" | "direct"
}

/** @public */
export function inferCaps(kind: TerminalKind): Capabilities {
  const tmux = inTmux()
  const parent = tmux ? parentTerminal() : null
  // In tmux the pane's TERM describes tmux, not the outer emulator. The
  // native tmux path currently uses Kitty/Ghostty's U=1 virtual placement;
  // regular absolute graphics are intentionally not inferred in a pane.
  const capabilityKind = tmux ? parent : kind

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
    parentKind: parent,
    transmissionMode: "direct",
  }

  // Truecolor: most modern terminals support it
  const colorterm = process.env["COLORTERM"]
  if (colorterm === "truecolor" || colorterm === "24bit") {
    caps.truecolor = true
  }

  switch (capabilityKind) {
    case "ghostty":
    case "kitty":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyPlaceholder = tmux && parentSupportsKittyPlaceholder(parent) && passthroughSupported()
      // tmux translates its own keyboard modes and does not transparently
      // forward Kitty keyboard negotiation, so do not infer this in a pane.
      caps.kittyKeyboard = !tmux
      caps.syncOutput = true
      break

    case "wezterm":
      caps.truecolor = true
      // WezTerm passthrough can carry Kitty graphics, but it has no proven
      // U=1 placeholder route in this engine. Do not claim either path in a
      // tmux pane until a native backend and probe exist.
      caps.kittyGraphics = !tmux
      caps.kittyPlaceholder = false
      caps.kittyKeyboard = !tmux
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
      caps.kittyKeyboard = !tmux
      caps.sixel = true
      break

    case "contour":
      caps.truecolor = true
      caps.kittyGraphics = !tmux
      caps.kittyKeyboard = !tmux
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

/** Parse a complete Kitty response status; incomplete replies return null. */
export function parseKittyProbeResponse(data: string, responseId = 31): boolean | null {
  // A status is not complete until Kitty's string terminator arrives. This
  // matters through tmux, where a PTY can split `_Gi=31;OK\x1b\\` into
  // multiple reads; resolving on a partial status would turn a valid probe
  // into a false negative.
  const match = data.match(new RegExp(`_Gi=${responseId};([^\\x1b\\r\\n]*)\\x1b\\\\`))
  if (!match) return null
  return match[1].trim() === "OK"
}

/**
 * Probe for Kitty graphics protocol support.
 *
 * @public
 */
export function probeKittyGraphics(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    let received = ""

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      // Kitty replies are ASCII, but the PTY may split a response at any byte
      // boundary. Keep the incomplete sequence until a complete status arrives.
      received += data.toString()
      if (received.length > 16 * 1024) received = received.slice(-16 * 1024)
      const supported = parseKittyProbeResponse(received)
      if (supported === null) return
      cleanup()
      resolve(supported)
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeout)

    onData(handler)

    // Send probe: 1x1 RGBA pixel, query action, suppress display. This is a
    // Kitty graphics protocol probe only; the native U=1 placeholder path is
    // gated separately by the known Kitty/Ghostty parent capability. Graphics
    // is the only payload wrapped for tmux; mode-control remains raw.
    const wrapped = createWriter(write)
    wrapped("\x1b_Gi=31,s=1,v=1,a=q,t=d,f=32;AAAAAA==\x1b\\")
  })
}

/**
 * Query terminal background and foreground colors.
 *
 * @public
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
    let received = ""

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const component = (value: string) => {
      const max = 16 ** value.length - 1
      return Math.round(parseInt(value, 16) * 255 / max)
    }

    const handler = (data: Buffer) => {
      received += data.toString()
      if (received.length > 16 * 1024) received = received.slice(-16 * 1024)

      // OSC 11 response: \x1b]11;rgb:RRRR/GGGG/BBBB
      const bgMatch = received.match(/\x1b]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)(?:\x07|\x1b\\)/i)
      if (bgMatch) bg = [component(bgMatch[1]), component(bgMatch[2]), component(bgMatch[3])]

      // OSC 10 response: \x1b]10;rgb:RRRR/GGGG/BBBB
      const fgMatch = received.match(/\x1b]10;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)(?:\x07|\x1b\\)/i)
      if (fgMatch) fg = [component(fgMatch[1]), component(fgMatch[2]), component(fgMatch[3])]

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

    const wrapped = createWriter(write)

    // Query background (OSC 11) and foreground (OSC 10)
    wrapped("\x1b]11;?\x07")
    wrapped("\x1b]10;?\x07")
  })
}
