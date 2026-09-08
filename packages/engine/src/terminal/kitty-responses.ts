/**
 * Small, side-effect free observer for Kitty APC responses.
 *
 * The terminal input stream is shared with keyboard input, so this parser only
 * observes bytes.  It never removes or rewrites the stream; the input parser
 * remains responsible for consuming responses before dispatching user input.
 */

export type KittyResponse = {
  imageId: number
  placementId: number | null
  status: string
}

export type KittyResponseParser = {
  feed: (data: Buffer) => void
  destroy: () => void
}

const APC_START = Buffer.from("\x1b_G")
const ST = Buffer.from("\x1b\\")
const PASTE_START = Buffer.from("\x1b[200~")
const PASTE_END = Buffer.from("\x1b[201~")
const MAX_BUFFER = 16 * 1024

function suffixPrefix(data: Buffer, patterns: Buffer[]) {
  const max = Math.min(data.length, Math.max(...patterns.map((pattern) => pattern.length)) - 1)
  for (let size = max; size > 0; size--) {
    const suffix = data.subarray(data.length - size)
    if (patterns.some((pattern) => pattern.subarray(0, size).equals(suffix))) return suffix
  }
  return Buffer.alloc(0)
}

function positiveDecimal(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number <= 0xffffffff ? number : null
}

function parseResponse(body: Buffer): KittyResponse | null {
  const separator = body.indexOf(0x3b) // ';'
  if (separator <= 0 || separator === body.length - 1) return null
  for (const byte of body) {
    if (byte < 0x20 || byte > 0x7e) return null
  }
  const header = body.subarray(0, separator).toString("ascii")
  const status = body.subarray(separator + 1).toString("ascii")
  if (!/^[\x20-\x7e]+$/.test(status)) return null

  const fields = header.split(",")
  if (fields.length < 1 || fields.length > 2) return null
  let imageId: number | null = null
  let placementId: number | null = null
  const seen = new Set<string>()
  for (const field of fields) {
    const separator = field.indexOf("=")
    if (separator <= 0 || separator === field.length - 1) return null
    const key = field.slice(0, separator)
    if (key !== "i" && key !== "p") return null
    if (seen.has(key)) return null
    seen.add(key)
    const value = positiveDecimal(field.slice(separator + 1))
    if (value === null) return null
    if (key === "i") imageId = value
    else placementId = value
  }
  if (imageId === null) return null

  return { imageId, placementId, status }
}

/**
 * Create a fragmented Kitty response observer.
 *
 * Only complete `ESC_G...ESC\\` sequences are considered.  A bracketed paste
 * is treated as opaque, including APC-looking text within its contents.
 */
export function createKittyResponseParser(onResponse: (response: KittyResponse) => void): KittyResponseParser {
  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let pasting = false
  let destroyed = false

  const process = () => {
    while (!destroyed && pending.length > 0) {
      if (pasting) {
        const end = pending.indexOf(PASTE_END)
        if (end < 0) {
          pending = suffixPrefix(pending, [PASTE_END])
          return
        }
        pending = pending.subarray(end + PASTE_END.length)
        pasting = false
        continue
      }

      const paste = pending.indexOf(PASTE_START)
      const apc = pending.indexOf(APC_START)
      if (paste < 0 && apc < 0) {
        pending = suffixPrefix(pending, [PASTE_START, APC_START])
        return
      }

      if (paste >= 0 && (apc < 0 || paste < apc)) {
        pending = pending.subarray(paste + PASTE_START.length)
        pasting = true
        continue
      }

      const end = pending.indexOf(ST, apc + APC_START.length)
      if (end < 0) {
        if (pending.length > MAX_BUFFER) {
          pending = pending.subarray(pending.length - MAX_BUFFER)
        }
        return
      }

      const body = pending.subarray(apc + APC_START.length, end)
      pending = pending.subarray(end + ST.length)
      const response = parseResponse(body)
      if (response) onResponse(response)
    }
  }

  return {
    feed(data) {
      if (destroyed || data.length === 0) return
      pending = pending.length === 0 ? Buffer.from(data) : Buffer.concat([pending, data])
      if (pending.length > MAX_BUFFER * 2) pending = pending.subarray(-MAX_BUFFER)
      process()
    },
    destroy() {
      destroyed = true
      pending = Buffer.alloc(0)
    },
  }
}
