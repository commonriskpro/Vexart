/**
 * vexart-buffer.ts
 * Shared constants for the packed ArrayBuffer command graph format.
 * Per design §8 and §8.4.
 *
 * Rust parses the packed buffer via parse_header() + from_le_bytes.
 */

// ── Constants ───────────────────────────────────────────────────────────────

/** Total size of the graph buffer in bytes. 64KB fits a showcase frame comfortably. */
export const GRAPH_BUFFER_BYTES = 64 * 1024

/** Graph buffer magic: "VXAR" in little-endian u32 = 0x56584152. */
export const GRAPH_MAGIC = 0x56584152 as const

/** Graph buffer version. */
export const GRAPH_VERSION = 0x00020000 as const

