/**
 * native-presentation-stats.ts
 * TypeScript mirror of the Rust `NativePresentationStats` packed struct.
 *
 * Struct layout (96 bytes, version=2, all LE):
 *   offset 0  u32 version
 *   offset 4  u32 mode
 *   offset 8  u64 rgba_bytes_read
 *   offset 16 u64 kitty_bytes_emitted
 *   offset 24 u64 readback_us
 *   offset 32 u64 encode_us
 *   offset 40 u64 write_us
 *   offset 48 u64 total_us
 *   offset 56 u32 transport
 *   offset 60 u32 flags
 *   offset 64 u64 compress_us
 *   offset 72 u64 shm_prepare_us
 *   offset 80 u64 raw_bytes
 *   offset 88 u64 payload_bytes
 *
 * Phase 2b — native presentation. See native/libvexart/src/types.rs.
 */

// ── Constants matching Rust ───────────────────────────────────────────────

/** @public */
export const NATIVE_STATS_VERSION = 2 as const

/** @public */
export const NATIVE_STATS_MODE = {
  UNKNOWN: 0,
  FINAL_FRAME: 1,
  LAYER: 2,
  REGION: 3,
  DELETE: 4,
} as const

/** @public */
export const NATIVE_STATS_TRANSPORT = {
  DIRECT: 0,
  FILE: 1,
  SHM: 2,
} as const

/** @public */
export const NATIVE_STATS_FLAG = {
  NATIVE_USED: 1,
  FALLBACK: 2,
  VALID: 4,
  COMPRESSED: 8,
} as const

/** @public Byte size of the NativePresentationStats struct. */
export const NATIVE_STATS_BYTE_SIZE = 96

// ── TypeScript mirror type ────────────────────────────────────────────────

/** @public */
export type NativePresentationStats = {
  /** Struct version — always 1 for Phase 2b. */
  version: number
  /** Presentation mode (0=unknown, 1=final-frame, 2=layer, 3=region, 4=delete). */
  mode: number
  /** Raw RGBA bytes transferred through JS fallback paths (0 = normal native path). */
  rgbaBytesRead: number
  /** Kitty escape bytes emitted to stdout. */
  kittyBytesEmitted: number
  /** GPU readback time in microseconds. */
  readbackUs: number
  /** Kitty encoding time in microseconds. */
  encodeUs: number
  /** stdout write time in microseconds. */
  writeUs: number
  /** Total end-to-end time in microseconds. */
  totalUs: number
  /** Transport mode used (0=direct, 1=file, 2=shm). */
  transport: number
  /** Flags bitfield (bit 0=native_used, bit 1=fallback, bit 2=valid). */
  flags: number
  /** Native zlib compression time in microseconds. */
  compressUs: number
  /** Native SHM prepare/copy/sync time in microseconds. */
  shmPrepareUs: number
  /** Raw input byte count before compression. */
  rawBytes: number
  /** Payload byte count written after compression policy. */
  payloadBytes: number
}

// ── Decoder ──────────────────────────────────────────────────────────────

/**
 * Decode a `NativePresentationStats` struct from a Uint8Array.
 *
 * The buffer must be at least 96 bytes. If the version field is 0 (uninitialized),
 * returns null to indicate no valid stats were written.
 *
 * BigInt u64 fields are cast to number — safe for values ≤ Number.MAX_SAFE_INTEGER
 * (microsecond timings and byte counts will not exceed 2^53 in practice).
 */
/** @public */
export function decodeNativePresentationStats(buf: Uint8Array): NativePresentationStats | null {
  if (buf.byteLength < NATIVE_STATS_BYTE_SIZE) return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const version = view.getUint32(0, true)
  if (version === 0) return null  // uninitialized — FFI call did not write stats

  const mode = view.getUint32(4, true)
  // u64 fields: read as two u32 halves (lo + hi) to avoid BigInt overhead.
  const lo = (n: number) => view.getUint32(n, true)
  const hi = (n: number) => view.getUint32(n + 4, true)
  const u64 = (offset: number) => lo(offset) + hi(offset) * 0x100000000

  return {
    version,
    mode,
    rgbaBytesRead: u64(8),
    kittyBytesEmitted: u64(16),
    readbackUs: u64(24),
    encodeUs: u64(32),
    writeUs: u64(40),
    totalUs: u64(48),
    transport: view.getUint32(56, true),
    flags: view.getUint32(60, true),
    compressUs: version >= 2 ? u64(64) : 0,
    shmPrepareUs: version >= 2 ? u64(72) : 0,
    rawBytes: version >= 2 ? u64(80) : 0,
    payloadBytes: version >= 2 ? u64(88) : 0,
  }
}

/**
 * Allocate a zeroed stats buffer for passing to FFI functions.
 *
 * Usage:
 *   const statsBuf = allocNativeStatsBuf()
 *   symbols.vexart_kitty_emit_frame_with_stats(ctx, target, imageId, ptr(statsBuf))
 *   const stats = decodeNativePresentationStats(statsBuf)
 */
/** @public */
export function allocNativeStatsBuf(): Uint8Array {
  return new Uint8Array(NATIVE_STATS_BYTE_SIZE)
}

/**
 * Check if stats indicate the native path was actually used.
 */
/** @public */
export function isNativeStatsValid(stats: NativePresentationStats | null): boolean {
  return !!(stats && (stats.flags & NATIVE_STATS_FLAG.VALID) !== 0 && stats.version >= 1)
}

/**
 * Check if stats indicate a fallback was activated.
 */
/** @public */
export function isNativeStatsFallback(stats: NativePresentationStats | null): boolean {
  return !!(stats && (stats.flags & NATIVE_STATS_FLAG.FALLBACK) !== 0)
}

/**
 * Format stats as a compact string for debug display.
 * Example: "native[shm] frame rb=0B emit=4096B total=120µs"
 */
/** @public */
export function formatNativeStats(stats: NativePresentationStats): string {
  const transport = stats.transport === NATIVE_STATS_TRANSPORT.SHM ? "shm"
    : stats.transport === NATIVE_STATS_TRANSPORT.FILE ? "file"
    : "direct"
  const mode = stats.mode === NATIVE_STATS_MODE.FINAL_FRAME ? "frame"
    : stats.mode === NATIVE_STATS_MODE.LAYER ? "layer"
    : stats.mode === NATIVE_STATS_MODE.REGION ? "region"
    : stats.mode === NATIVE_STATS_MODE.DELETE ? "delete"
    : "unknown"
  const fallback = (stats.flags & NATIVE_STATS_FLAG.FALLBACK) ? " [fallback]" : ""
  const compression = (stats.flags & NATIVE_STATS_FLAG.COMPRESSED) ? " zlib" : " raw"
  return `native[${transport}] ${mode}${fallback}${compression} rb=${stats.rgbaBytesRead}B payload=${stats.payloadBytes}B total=${stats.totalUs}µs`
}
