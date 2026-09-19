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

// Reusable static scratch buffer for metrics (6 x 32-bit values = 24 bytes)
const _metricsBuf = new ArrayBuffer(24)
const _metricsF32 = new Float32Array(_metricsBuf)
const _metricsU32 = new Uint32Array(_metricsBuf)
const _metricsBytes = new Uint8Array(_metricsBuf)

// Reusable static scratch buffer for line records (16 bytes per line: start_byte, end_byte, width, glyph_count)
const INITIAL_LINES_CAP = 256
const LINE_RECORD_BYTES = 16
let _linesCap = INITIAL_LINES_CAP
let _linesBuf = new ArrayBuffer(_linesCap * LINE_RECORD_BYTES)
let _linesF32 = new Float32Array(_linesBuf)
let _linesU32 = new Uint32Array(_linesBuf)
let _linesBytes = new Uint8Array(_linesBuf)

function ensureLinesCap(required: number) {
  if (required <= _linesCap) return
  while (_linesCap < required) _linesCap *= 2
  _linesBuf = new ArrayBuffer(_linesCap * LINE_RECORD_BYTES)
  _linesF32 = new Float32Array(_linesBuf)
  _linesU32 = new Uint32Array(_linesBuf)
  _linesBytes = new Uint8Array(_linesBuf)
}

let _lastTextLen = 0
const decoder = new TextDecoder()

export function msdfDecodeTextSlice(startByte: number, endByte: number, source: string): string {
  if (source.length === _lastTextLen) {
    return source.slice(startByte, endByte)
  }
  return decoder.decode(_textScratchBuf.subarray(startByte, endByte))
}

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

/**
 * Check if the MSDF font layout measurement symbol is available.
 */
export function isMsdfLayoutAvailable(): boolean {
  const sym = getSymbols()
  return sym !== null && typeof sym.vexart_font_layout_measure === "function"
}

export type MsdfLayoutLine = {
  startByte: number
  endByte: number
  width: number
  glyphCount: number
}

export type MsdfLayoutResult = {
  totalWidth: number
  totalHeight: number
  maxContentWidth: number
  minContentWidth: number
  lineCount: number
  glyphCount: number
  lines?: MsdfLayoutLine[]
}

/**
 * Measure and layout text using the unified native C-ABI font layout engine.
 *
 * Zero allocations per frame when wantLines is false (for intrinsic measurement
 * and height calculation). Reuses static preallocated buffers.
 */
export function msdfLayoutMeasure(
  text: string,
  families: string[] = ["sans-serif"],
  fontSize = 14,
  lineHeight = 17,
  maxWidth = 0,
  weight = 400,
  italic = false,
  whiteSpace: "normal" | "pre-wrap" | "nowrap" = "normal",
  wordBreak: "normal" | "keep-all" = "normal",
  wantLines = false,
): MsdfLayoutResult | null {
  const sym = getSymbols()
  if (!sym || typeof sym.vexart_font_layout_measure !== "function") return null
  msdfFontInit()

  if (text.length === 0) {
    const effLineHeight = lineHeight > 0 ? lineHeight : Math.ceil(fontSize * 1.2)
    return {
      totalWidth: 0,
      totalHeight: effLineHeight,
      maxContentWidth: 0,
      minContentWidth: 0,
      lineCount: 1,
      glyphCount: 0,
      lines: wantLines ? [{ startByte: 0, endByte: 0, width: 0, glyphCount: 0 }] : undefined,
    }
  }

  const maxTextBytes = text.length * 3
  if (maxTextBytes > _textScratchBuf.byteLength) {
    let newCap = _textScratchBuf.byteLength * 2
    while (newCap < maxTextBytes) newCap *= 2
    _textScratchBuf = new Uint8Array(newCap)
  }
  const textEncoded = encoder.encodeInto(text, _textScratchBuf)
  const textLen = textEncoded.written
  _lastTextLen = textLen

  let famBuf: Uint8Array
  let famLen: number
  if (families.length === 0 || (families.length === 1 && families[0] === "sans-serif")) {
    famBuf = _defaultFamBuf
    famLen = _defaultFamBuf.byteLength
  } else {
    const famStr = families.length === 1 ? families[0] : families.join(" ")
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

  let flags = 0
  if (italic) flags |= 1
  if (whiteSpace === "pre-wrap") flags |= (1 << 1)
  else if (whiteSpace === "nowrap") flags |= (2 << 1)
  if (wordBreak === "keep-all") flags |= (1 << 3)

  const linesPtr = ptr(_linesBytes)
  let linesCap = wantLines ? _linesCap : 0

  let rc = sym.vexart_font_layout_measure(
    ptr(_textScratchBuf), textLen,
    ptr(famBuf), famLen,
    fontSize, lineHeight, maxWidth,
    weight, flags,
    ptr(_metricsBytes),
    linesPtr, linesCap,
  ) as number

  if (rc !== 0) return null

  const totalWidth = _metricsF32[0]
  const totalHeight = _metricsF32[1]
  const maxContentWidth = _metricsF32[2]
  const minContentWidth = _metricsF32[3]
  const lineCount = _metricsU32[4]
  const glyphCount = _metricsU32[5]

  if (wantLines && lineCount > _linesCap) {
    ensureLinesCap(lineCount)
    linesCap = _linesCap
    rc = sym.vexart_font_layout_measure(
      ptr(_textScratchBuf), textLen,
      ptr(famBuf), famLen,
      fontSize, lineHeight, maxWidth,
      weight, flags,
      ptr(_metricsBytes),
      ptr(_linesBytes), linesCap,
    ) as number
    if (rc !== 0) return null
  }

  let lines: MsdfLayoutLine[] | undefined
  if (wantLines) {
    const count = Math.min(lineCount, _linesCap)
    lines = new Array(count)
    for (let i = 0; i < count; i++) {
      lines[i] = {
        startByte: _linesU32[i * 4 + 0],
        endByte: _linesU32[i * 4 + 1],
        width: _linesF32[i * 4 + 2],
        glyphCount: _linesU32[i * 4 + 3],
      }
    }
  }

  return {
    totalWidth,
    totalHeight,
    maxContentWidth,
    minContentWidth,
    lineCount,
    glyphCount,
    lines,
  }
}
