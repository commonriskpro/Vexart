/**
 * PixelBuffer — the core RGBA pixel buffer for the TGE paint system.
 *
 * All paint operations write into this buffer. The backend then
 * transmits the buffer contents to the terminal.
 *
 * Layout: row-major, 4 bytes per pixel [R, G, B, A], top-left origin.
 *
 * Colors are packed as u32 RGBA: 0xRRGGBBAA.
 */

export type PixelBuffer = {
  data: Uint8Array
  width: number
  height: number
  stride: number
}

/** Create a new pixel buffer, cleared to transparent black. */
export function create(width: number, height: number): PixelBuffer {
  const stride = width * 4
  return {
    data: new Uint8Array(stride * height),
    width,
    height,
    stride,
  }
}

/** Resize a buffer (creates a new backing array, copies what fits). */
export function resize(buf: PixelBuffer, width: number, height: number): PixelBuffer {
  const next = create(width, height)
  const rows = Math.min(buf.height, height)
  const cols = Math.min(buf.width, width) * 4
  for (let y = 0; y < rows; y++) {
    const src = y * buf.stride
    const dst = y * next.stride
    next.data.set(buf.data.subarray(src, src + cols), dst)
  }
  return next
}

/** Clear the entire buffer to transparent black (or a packed u32 RGBA color). */
export function clear(buf: PixelBuffer, color = 0x00000000) {
  if (color === 0) {
    buf.data.fill(0)
    return
  }
  const r = (color >>> 24) & 0xff
  const g = (color >>> 16) & 0xff
  const b = (color >>> 8) & 0xff
  const a = color & 0xff
  const d = buf.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
    d[i + 3] = a
  }
}

/** Clear a rectangular region to a solid RGBA color (packed u32). */
export function clearRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, color = 0x00000000) {
  const r = (color >>> 24) & 0xff
  const g = (color >>> 16) & 0xff
  const b = (color >>> 8) & 0xff
  const a = color & 0xff
  const x0 = Math.max(0, x | 0)
  const y0 = Math.max(0, y | 0)
  const x1 = Math.min(buf.width, (x + w) | 0)
  const y1 = Math.min(buf.height, (y + h) | 0)
  const d = buf.data
  for (let py = y0; py < y1; py++) {
    const row = py * buf.stride
    for (let px = x0; px < x1; px++) {
      const off = row + px * 4
      d[off] = r
      d[off + 1] = g
      d[off + 2] = b
      d[off + 3] = a
    }
  }
}

/** Get the color at a pixel as packed u32 RGBA. */
export function get(buf: PixelBuffer, x: number, y: number): number {
  if (x < 0 || x >= buf.width || y < 0 || y >= buf.height) return 0
  const off = (y | 0) * buf.stride + (x | 0) * 4
  return ((buf.data[off] << 24) | (buf.data[off + 1] << 16) | (buf.data[off + 2] << 8) | buf.data[off + 3]) >>> 0
}

/** Set a single pixel to a packed u32 RGBA color (no blending). */
export function set(buf: PixelBuffer, x: number, y: number, color: number) {
  const px = x | 0
  const py = y | 0
  if (px < 0 || px >= buf.width || py < 0 || py >= buf.height) return
  const off = py * buf.stride + px * 4
  buf.data[off] = (color >>> 24) & 0xff
  buf.data[off + 1] = (color >>> 16) & 0xff
  buf.data[off + 2] = (color >>> 8) & 0xff
  buf.data[off + 3] = color & 0xff
}

/** Extract a sub-region as a new PixelBuffer (copy). */
export function sub(buf: PixelBuffer, sx: number, sy: number, sw: number, sh: number): PixelBuffer {
  const out = create(sw, sh)
  const x0 = Math.max(0, sx | 0)
  const y0 = Math.max(0, sy | 0)
  const x1 = Math.min(buf.width, (sx + sw) | 0)
  const y1 = Math.min(buf.height, (sy + sh) | 0)
  for (let py = y0; py < y1; py++) {
    const srcOff = py * buf.stride + x0 * 4
    const dstOff = (py - y0) * out.stride + (x0 - sx) * 4
    const len = (x1 - x0) * 4
    out.data.set(buf.data.subarray(srcOff, srcOff + len), dstOff)
  }
  return out
}

// ── Color helpers ──

/** Unpack a u32 RGBA into [r, g, b, a] bytes. */
export function rgba(packed: number): [number, number, number, number] {
  return [(packed >>> 24) & 0xff, (packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff]
}

/** Pack [r, g, b, a] bytes into a u32 RGBA. */
export function pack(r: number, g: number, b: number, a: number): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}

/** Create a color with modified alpha (0-255). */
export function alpha(packed: number, a: number): number {
  return ((packed & 0xffffff00) | (a & 0xff)) >>> 0
}
