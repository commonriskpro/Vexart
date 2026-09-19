import { createKittyResponseParser } from "../terminal/kitty-responses"

export type ApcControl = Record<string, string | number | undefined>

/**
 * Format a Kitty Graphics APC sequence.
 *
 * Sequence syntax: \x1b_G<key=value,...>;<payload>\x1b\
 */
export function formatKittyApc(control: ApcControl, payload?: string | Uint8Array): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(control)) {
    if (v !== undefined) {
      parts.push(`${k}=${v}`)
    }
  }
  const prefix = `\x1b_G${parts.join(",")};`
  const suffix = "\x1b\\"
  if (!payload) return `${prefix}${suffix}`
  const payloadStr = typeof payload === "string" ? payload : Buffer.from(payload).toString("base64")
  return `${prefix}${payloadStr}${suffix}`
}

/** Format a Kitty delete image APC sequence. */
export function formatKittyDeleteApc(imageId: number): string {
  return formatKittyApc({ a: "d", d: "I", i: imageId, q: 2 })
}

/** Format a Kitty SHM upload APC sequence. */
export function formatKittyShmUploadApc(options: {
  imageId: number
  placementId?: number
  shmName: string
  cols?: number
  rows?: number
  quiet?: number
  virtualPlaceholder?: boolean
}): string {
  const { imageId, placementId, shmName, cols, rows, quiet = 1, virtualPlaceholder = true } = options
  return formatKittyApc({
    a: "T",
    t: "s",
    i: imageId,
    p: placementId,
    c: cols,
    r: rows,
    q: quiet,
    U: virtualPlaceholder ? 1 : undefined,
  }, Buffer.from(shmName).toString("base64"))
}

/** Format a Kitty SHM query APC sequence. */
export function formatKittyShmQueryApc(imageId: number, shmName: string): string {
  return formatKittyApc({
    i: imageId,
    s: 1,
    v: 1,
    a: "q",
    t: "s",
    f: 32,
  }, Buffer.from(shmName).toString("base64"))
}

/**
 * Wrap a raw APC sequence in tmux DCS passthrough.
 * Every \x1b in the payload is doubled (\x1b\x1b).
 */
export function wrapTmuxPassthroughApc(apc: string): string {
  const inner = apc.replaceAll("\x1b", "\x1b\x1b")
  return `\x1bPtmux;${inner}\x1b\\`
}

/** Write a Kitty APC sequence to a writer, optionally wrapping for tmux. */
export function writeKittyApc(
  write: (data: string) => void,
  apc: string,
  inTmux = false,
): void {
  write(inTmux ? wrapTmuxPassthroughApc(apc) : apc)
}

/** Write directly to process stdout. */
export function writeKittyApcToStdout(apc: string, inTmux = false): void {
  const data = inTmux ? wrapTmuxPassthroughApc(apc) : apc
  process.stdout.write(data)
}

export type ApcResponse = {
  imageId: number
  placementId: number | null
  status: string
}

/**
 * Subscribe to terminal input for Kitty APC response parsing.
 * Returns an unsubscription callback, or null if onData was not provided.
 */
export function subscribeApcResponses(
  onData: ((handler: (data: Buffer) => void) => () => void) | undefined,
  onResponse: (response: ApcResponse) => void,
): (() => void) | null {
  if (!onData) return null
  const parser = createKittyResponseParser(onResponse)
  const unsubscribe = onData((data) => parser.feed(data))
  return () => {
    unsubscribe()
    parser.destroy()
  }
}
