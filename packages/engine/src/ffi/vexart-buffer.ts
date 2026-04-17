/**
 * vexart-buffer.ts
 * Caller-owned packed ArrayBuffer for vexart_paint_dispatch and related calls.
 * Per design §8 and §8.4 TS code block.
 *
 * Zero allocations on the hot path — graphBuffer is created once at mount,
 * reused every frame. Rust parses in place via parse_header() + from_le_bytes.
 */

// ── Constants ───────────────────────────────────────────────────────────────

/** Total size of the graph buffer in bytes. 64KB fits a showcase frame comfortably. */
export const GRAPH_BUFFER_BYTES = 64 * 1024

/** Graph buffer magic: "VXAR" in little-endian u32 = 0x56584152. */
export const GRAPH_MAGIC = 0x56584152 as const

/** Graph buffer version: Phase 2.0 = 0x00020000. */
export const GRAPH_VERSION = 0x00020000 as const

// ── Shared graph buffer (reused every frame) ────────────────────────────────

/** Shared packed ArrayBuffer for vexart_paint_dispatch calls. Reused every frame. */
export const graphBuffer = new ArrayBuffer(GRAPH_BUFFER_BYTES)

/** DataView over graphBuffer for structured field writes. */
export const graphView = new DataView(graphBuffer)

// ── Header writer ───────────────────────────────────────────────────────────

/**
 * Write the 16-byte graph buffer header into graphView at offset 0.
 * MUST be called at the start of each frame before any command writes.
 *
 * Header layout (all little-endian u32):
 *   [0..4]   magic        = GRAPH_MAGIC   (0x56584152)
 *   [4..8]   version      = GRAPH_VERSION (0x00020000)
 *   [8..12]  cmdCount     = number of commands that follow
 *   [12..16] payloadBytes = total bytes of payload after this header
 *
 * Mirrors native/libvexart/src/ffi/buffer.rs: parse_header().
 */
export function writeHeader(cmdCount: number, payloadBytes: number): void {
  graphView.setUint32(0,  GRAPH_MAGIC,   true)
  graphView.setUint32(4,  GRAPH_VERSION, true)
  graphView.setUint32(8,  cmdCount,      true)
  graphView.setUint32(12, payloadBytes,  true)
}

// ── Per-command prefix writer ───────────────────────────────────────────────

/**
 * Write an 8-byte per-command prefix at the given byte offset within graphView.
 *
 * Prefix layout:
 *   [0..2] cmdKind      (u16) — 0=Rect, 1=RectCorners, 2=Circle, ..., 16=LayerEnd
 *   [2..4] flags        (u16) — bit0=hasTransform, bit1=hasScissor, bit2=layerOverride
 *   [4..8] payloadBytes (u32) — body length following this 8-byte prefix
 *
 * TODO(Slice 9): per-command body writers (Rect, Gradient, Shadow, etc.)
 *
 * @param offset      byte offset in graphView where prefix starts
 * @param cmdKind     command kind enum value
 * @param flags       bit flags
 * @param payloadBytes body length following this prefix
 */
export function writeCommandPrefix(
  offset: number,
  cmdKind: number,
  flags: number,
  payloadBytes: number,
): void {
  graphView.setUint16(offset,     cmdKind,      true)
  graphView.setUint16(offset + 2, flags,        true)
  graphView.setUint32(offset + 4, payloadBytes, true)
}

// ── Per-command body stubs (Slice 9) ────────────────────────────────────────

/**
 * Write a Rect command body at the given offset.
 * TODO(Slice 9): implement body serialization matching RectInstance layout.
 *
 * Body layout (48 bytes):
 *   [0..16]  rect         (f32×4: x, y, w, h)
 *   [16..32] cornerRadii  (f32×4: tl, tr, br, bl)
 *   [32..36] color        (u32: RGBA8888)
 *   [36..40] borderColor  (u32)
 *   [40..44] borderWidth  (f32)
 *   [44..48] scissorId    (u32)
 */
export function writeRectBody(
  _offset: number,
  _x: number, _y: number, _w: number, _h: number,
  _tl: number, _tr: number, _br: number, _bl: number,
  _color: number,
  _borderColor: number,
  _borderWidth: number,
  _scissorId: number,
): void {
  // TODO(Slice 9): serialize Rect command body into graphView at offset
}

/**
 * Write a GradientLinear command body stub.
 * TODO(Slice 9): implement.
 */
export function writeGradientBody(_offset: number, ..._args: number[]): void {
  // TODO(Slice 9)
}

/**
 * Write a Shadow command body stub.
 * TODO(Slice 9): implement.
 */
export function writeShadowBody(_offset: number, ..._args: number[]): void {
  // TODO(Slice 9)
}
