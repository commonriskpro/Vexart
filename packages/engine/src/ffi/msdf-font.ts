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

// Pre-encoded fast-path buffer for default "sans-serif" family
const _defaultFamBuf = encoder.encode("sans-serif")

// Elastic scratch buffers for text and family UTF-8 encoding
let _textScratchBuf = new Uint8Array(256)
let _famScratchBuf = new Uint8Array(256)

// Reusable single-element Float32Arrays and preallocated byte views for FFI output
const _outW = new Float32Array(1)
const _outH = new Float32Array(1)
const _outWBytes = new Uint8Array(_outW.buffer)
const _outHBytes = new Uint8Array(_outH.buffer)

let _symbols: ReturnType<typeof openMsdfFontSymbols> | null = null
let _initAttempted = false

function getSymbols() {
  if (_symbols !== null) return _symbols
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

  const encodedFamilies = encoder.encode(families.join("\0"))
  const out = new BigUint64Array(1)
  const rc = sym.vexart_font_query(
    ptr(encodedFamilies), encodedFamilies.byteLength,
    weight, italic ? 1 : 0,
    ptr(out),
  ) as number
  if (rc !== 0) return null
  return out[0] || null
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
  if (text.length === 0) return { width: 0, height: 0 }

  const sym = getSymbols()
  if (!sym) return null
  msdfFontInit()

  const maxTextBytes = text.length * 3
  if (maxTextBytes > _textScratchBuf.byteLength) {
    let newCap = _textScratchBuf.byteLength * 2
    while (newCap < maxTextBytes) newCap *= 2
    _textScratchBuf = new Uint8Array(newCap)
  }
  const textEncoded = encoder.encodeInto(text, _textScratchBuf)
  const textLen = textEncoded.written
  if (textLen === 0) return { width: 0, height: 0 }

  let famBuf: Uint8Array
  let famLen: number
  if (families.length === 0 || (families.length === 1 && families[0] === "sans-serif")) {
    famBuf = _defaultFamBuf
    famLen = _defaultFamBuf.byteLength
  } else {
    const famStr = families.length === 1 ? families[0] : families.join("\0")
    const maxFamBytes = famStr.length * 3
    if (maxFamBytes > _famScratchBuf.byteLength) {
      let newCap = _famScratchBuf.byteLength * 2
      while (newCap < maxFamBytes) newCap *= 2
      _famScratchBuf = new Uint8Array(newCap)
    }
    const famEncoded = encoder.encodeInto(famStr, _famScratchBuf)
    famBuf = _famScratchBuf
    famLen = famEncoded.written
  }

  const rc = sym.vexart_font_measure(
    ptr(_textScratchBuf), textLen,
    ptr(famBuf), famLen,
    fontSize,
    weight, italic ? 1 : 0,
    ptr(_outWBytes), ptr(_outHBytes),
  ) as number

  if (rc !== 0) return null
  return { width: _outW[0], height: _outH[0] }
}

/**
 * Check if the MSDF font system is available in the current dylib.
 */
export function isMsdfFontAvailable(): boolean {
  return getSymbols() !== null
}
