/**
 * msdf-font.ts
 * TypeScript wrappers for the MSDF font system FFI.
 *
 * Lazy-loaded: if the dylib doesn't have font symbols, all functions
 * return graceful fallbacks (null/false/0). The bitmap text path
 * continues to work unchanged.
 */

import { ptr } from "bun:ffi"
import { openMsdfFontSymbols } from "./vexart-bridge"

const encoder = new TextEncoder()

let _symbols: ReturnType<typeof openMsdfFontSymbols> = undefined as any
let _initAttempted = false

function getSymbols() {
  if (_symbols !== undefined) return _symbols
  _symbols = openMsdfFontSymbols()
  return _symbols
}

// ── Font system init ────────────────────────────────────────────────────

/**
 * Initialize the MSDF font system. Returns the number of discovered
 * font faces, or -1 if the native font system is not available.
 */
export function msdfFontInit(): number {
  const sym = getSymbols()
  if (!sym) return -1
  if (_initAttempted) return 0
  _initAttempted = true
  return sym.vexart_font_init() as number
}

// ── Font query ──────────────────────────────────────────────────────────

/**
 * Query a system font by family names. Returns an opaque handle or null.
 *
 * @param families — array of CSS-like family names, e.g. ["JetBrains Mono", "monospace"]
 * @param weight — CSS font-weight (100-900, default 400)
 * @param italic — whether to prefer italic face
 */
export function msdfFontQuery(
  families: string[],
  weight = 400,
  italic = false,
): bigint | null {
  const sym = getSymbols()
  if (!sym) return null
  msdfFontInit()

  const json = encoder.encode(JSON.stringify(families))
  const out = new BigUint64Array(1)
  const rc = sym.vexart_font_query(
    ptr(json), json.byteLength,
    weight, italic ? 1 : 0,
    ptr(out),
  ) as number
  if (rc !== 0) return null
  return out[0] || null
}

// ── Text rendering ──────────────────────────────────────────────────────

export type MsdfRenderTextParams = {
  x: number
  y: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  color: number       // packed RGBA (0xRRGGBBAA)
  weight?: number
  italic?: boolean
  families?: string[]
}

/**
 * Render text using the MSDF pipeline directly into a GPU target.
 *
 * @param ctx — vexart context handle
 * @param target — composite target handle
 * @param text — UTF-8 text string
 * @param params — render parameters
 * @returns true on success
 */
export function msdfRenderText(
  ctx: bigint,
  target: bigint,
  text: string,
  params: MsdfRenderTextParams,
): boolean {
  const sym = getSymbols()
  if (!sym) return false
  msdfFontInit()

  const textBuf = encoder.encode(text)
  if (textBuf.byteLength === 0) return true // empty = no-op

  // Build the packed params buffer:
  // f32 x, y, fontSize, lineHeight, maxWidth (20 bytes)
  // u32 color_rgba (4 bytes)
  // u16 weight, u16 flags (4 bytes)
  // followed by JSON families string
  const familiesJson = encoder.encode(JSON.stringify(params.families ?? ["sans-serif"]))
  const headerSize = 28
  const paramsBuf = new Uint8Array(headerSize + familiesJson.byteLength)
  const view = new DataView(paramsBuf.buffer)

  view.setFloat32(0, params.x, true)
  view.setFloat32(4, params.y, true)
  view.setFloat32(8, params.fontSize, true)
  view.setFloat32(12, params.lineHeight, true)
  view.setFloat32(16, params.maxWidth, true)
  view.setUint32(20, params.color >>> 0, true)
  view.setUint16(24, params.weight ?? 400, true)
  view.setUint16(26, (params.italic ? 1 : 0), true)
  paramsBuf.set(familiesJson, headerSize)

  const statsOut = new Uint8Array(32) // FrameStats placeholder

  const rc = sym.vexart_font_render_text(
    ctx, target,
    ptr(textBuf), textBuf.byteLength,
    ptr(paramsBuf), paramsBuf.byteLength,
    ptr(statsOut),
  ) as number

  return rc === 0
}

// ── Text measurement ────────────────────────────────────────────────────

export type MsdfTextMeasurement = {
  width: number
  height: number
}

/**
 * Measure text dimensions using the MSDF font system metrics.
 *
 * @returns { width, height } in pixels, or null if measurement failed.
 */
export function msdfMeasureText(
  text: string,
  families: string[] = ["sans-serif"],
  fontSize = 14,
  weight = 400,
  italic = false,
): MsdfTextMeasurement | null {
  const sym = getSymbols()
  if (!sym) return null
  msdfFontInit()

  const textBuf = encoder.encode(text)
  if (textBuf.byteLength === 0) return { width: 0, height: 0 }

  const familiesJson = encoder.encode(JSON.stringify(families))
  const outW = new Float32Array(1)
  const outH = new Float32Array(1)

  const rc = sym.vexart_font_measure(
    ptr(textBuf), textBuf.byteLength,
    ptr(familiesJson), familiesJson.byteLength,
    fontSize,
    weight, italic ? 1 : 0,
    ptr(new Uint8Array(outW.buffer)), ptr(new Uint8Array(outH.buffer)),
  ) as number

  if (rc !== 0) return null
  return { width: outW[0], height: outH[0] }
}

/**
 * Check if the MSDF font system is available in the current dylib.
 */
export function isMsdfFontAvailable(): boolean {
  return getSymbols() !== null
}
