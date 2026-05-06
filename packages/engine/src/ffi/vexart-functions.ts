/**
 * vexart-functions.ts
 * Typed high-level wrappers around the raw bun:ffi symbols in vexart-bridge.ts.
 * Per design §8.4, §12, REQ-NB-003.
 *
 * Only the version handshake and last-error helpers are fully implemented here.
 * All other wrappers are stubbed with TODO markers for Slice 5+ work.
 */

import { openVexartLibrary, VexartNativeError, EXPECTED_BRIDGE_VERSION } from "./vexart-bridge"

// ── Re-exports ──────────────────────────────────────────────────────────────

export { EXPECTED_BRIDGE_VERSION, VexartNativeError } from "./vexart-bridge"

/** @public */
export const GRAPH_MAGIC   = 0x56584152 as const
/** @public */
export const GRAPH_VERSION = 0x00020000 as const

// ── Last-error helpers ──────────────────────────────────────────────────────

/**
 * Retrieve the current thread's last vexart error string.
 * Calls vexart_get_last_error_length + vexart_copy_last_error into a temporary buffer.
 * Returns empty string if no error is set.
 */
/** @public */
export function vexartGetLastError(): string {
  const { symbols } = openVexartLibrary()
  const len = symbols.vexart_get_last_error_length() as number
  if (len === 0) return ""
  const buf = new Uint8Array(len)
  symbols.vexart_copy_last_error(buf, len)
  return new TextDecoder().decode(buf)
}

// ── Version handshake ───────────────────────────────────────────────────────

/**
 * Returns the bridge version reported by the native library.
 * Use assertBridgeVersion to validate it matches EXPECTED_BRIDGE_VERSION.
 */
/** @public */
export function vexartVersion(): number {
  const { symbols } = openVexartLibrary()
  return symbols.vexart_version() as number
}

/**
 * Assert that actual matches expected.
 * Throws VexartNativeError on mismatch — does NOT call the native library.
 * Used by the TS mount path and by tests to validate the version contract.
 *
 * @param actual - version number returned by vexartVersion() or a test override
 * @param expected - expected version (default: EXPECTED_BRIDGE_VERSION)
 */
/** @public */
export function assertBridgeVersion(
  actual: number,
  expected: number = EXPECTED_BRIDGE_VERSION,
): void {
  if (actual !== expected) {
    throw new VexartNativeError(
      -1,
      `bridge version mismatch: expected 0x${expected.toString(16)}, got 0x${actual.toString(16)}`,
    )
  }
}

// ── Packed buffer writeHeader ───────────────────────────────────────────────

/**
 * Write the 16-byte graph buffer header into a graph buffer.
 *
 * @public
 * @param view - DataView over the graph buffer.
 * @param cmdCount - Number of commands that follow.
 * @param payloadBytes - Total payload bytes after the header.
 */
export function writeHeader(view: DataView, cmdCount: number, payloadBytes: number): void {
  view.setUint32(0,  GRAPH_MAGIC,   true)
  view.setUint32(4,  GRAPH_VERSION, true)
  view.setUint32(8,  cmdCount,      true)
  view.setUint32(12, payloadBytes,  true)
}

// ── Stubs for Slice 5+ wrappers ─────────────────────────────────────────────
// TODO(Slice 5): vexartContextCreate, vexartContextDestroy, vexartContextResize
// TODO(Slice 6): vexartLayoutCompute, vexartLayoutWriteback
// TODO(Slice 5): vexartPaintDispatch, vexartPaintUploadImage, vexartPaintRemoveImage
// TODO(Slice 5): vexartCompositeMerge, vexartCompositeReadbackRgba
// TODO(Slice 7): vexartKittyShmPrepare, vexartKittyShmRelease
// TODO(Slice 8): vexartTextLoadAtlas, vexartTextDispatch, vexartTextMeasure
