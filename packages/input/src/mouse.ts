/**
 * Mouse input parser — SGR extended mode (1006).
 *
 * SGR mouse format: \x1b[<{button};{x};{y}{M|m}
 *   M = press/move, m = release
 *   button encoding:
 *     0 = left press
 *     1 = middle press
 *     2 = right press
 *     32+n = motion with button n held
 *     64 = scroll up
 *     65 = scroll down
 *     +4 = shift
 *     +8 = alt
 *     +16 = ctrl
 *
 * x, y are 1-based column/row.
 *
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Extended-coordinates
 */

import type { MouseEvent, Modifiers, MouseAction } from "./types"

/** Try to parse a mouse event from the data. Returns [event, consumed] or null. */
export function parseMouse(data: string): [MouseEvent, number] | null {
  // SGR format: \x1b[<{button};{x};{y}{M|m}
  const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/)
  if (!match) return null

  const raw = parseInt(match[1], 10)
  const x = parseInt(match[2], 10) - 1  // convert to 0-based
  const y = parseInt(match[3], 10) - 1
  const release = match[4] === "m"
  const consumed = match[0].length

  // Decode modifiers from button value
  const mods: Modifiers = {
    shift: !!(raw & 4),
    alt: !!(raw & 8),
    ctrl: !!(raw & 16),
    meta: false,
  }

  // Strip modifier bits to get base button
  const base = raw & ~(4 | 8 | 16)

  let action: MouseAction
  let button: number

  if (base >= 64) {
    // Scroll events
    action = "scroll"
    button = base // 64=up, 65=down
  } else if (base >= 32) {
    // Motion with button held
    action = "move"
    button = base - 32
  } else if (release) {
    action = "release"
    button = base
  } else {
    action = "press"
    button = base
  }

  return [{ type: "mouse", action, button, x, y, mods }, consumed]
}
