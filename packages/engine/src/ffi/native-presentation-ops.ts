/**
 * native-presentation-ops.ts
 * Low-level native presentation operation wrappers.
 *
 * These functions call the Phase 2b native Kitty FFI exports directly.
 * Used by paint.ts and gpu-renderer-backend.ts for native layer/region/delete.
 *
 * All operations silently fall back if native presentation is disabled or
 * the FFI call fails — the caller must handle fallback separately.
 *
 * Phase 2b — see openspec/changes/phase-2b-native-presentation/design.md
 */

import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import type { TransmissionMode } from "../output/transport-manager"
import {
  allocNativeStatsBuf,
  decodeNativePresentationStats,
  type NativePresentationStats,
} from "./native-presentation-stats"
import { disableNativePresentation, logNativePresentationFallback } from "./native-presentation-flags"

let currentTransportMode: number | null = null
let consecutiveFailures = 0
const MAX_CONSECUTIVE_FAILURES = 3

function recordNativePresentationSuccess() {
  consecutiveFailures = 0
}

function recordNativePresentationFailure(reason: string) {
  consecutiveFailures++
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    disableNativePresentation(`${consecutiveFailures} consecutive failures: ${reason}`)
  }
}

function toNativeTransportMode(mode: TransmissionMode | number) {
  if (typeof mode === "number") return mode
  if (mode === "file") return 1
  if (mode === "shm") return 2
  return 0
}

export function ensureNativeKittyTransport(mode: TransmissionMode | number) {
  const nextMode = toNativeTransportMode(mode)
  if (currentTransportMode === nextMode) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_kitty_set_transport(1n, nextMode)
  currentTransportMode = nextMode
}

// ── Native layer emission ─────────────────────────────────────────────────

/**
 * Emit a pre-encoded RGBA layer natively via vexart_kitty_emit_layer.
 *
 * @param imageId — Kitty image ID for this layer
 * @param rgba    — raw RGBA pixel data (width × height × 4 bytes)
 * @param width   — layer width in pixels
 * @param height  — layer height in pixels
 * @param col     — terminal column where the image is placed
 * @param row     — terminal row where the image is placed
 * @param z       — Kitty z-index
 * @returns decoded stats, or null if the call failed
 */
export function nativeEmitLayer(
  imageId: number,
  rgba: Uint8Array,
  width: number,
  height: number,
  col: number,
  row: number,
  z: number,
  transmissionMode: TransmissionMode = "direct",
): NativePresentationStats | null {
  const statsBuf = allocNativeStatsBuf()
  const layerBuf = new Uint8Array(20)
  const layerView = new DataView(layerBuf.buffer)
  layerView.setUint32(0, width, true)
  layerView.setUint32(4, height, true)
  layerView.setInt32(8, col, true)
  layerView.setInt32(12, row, true)
  layerView.setInt32(16, z, true)
  try {
    const { symbols } = openVexartLibrary()
    ensureNativeKittyTransport(transmissionMode)
    const rc = symbols.vexart_kitty_emit_layer(
      1n, // ctx (dummy — single context model)
      imageId,
      ptr(rgba),
      rgba.byteLength,
      ptr(layerBuf),
      layerBuf.byteLength,
      ptr(statsBuf),
    ) as number
    if (rc === 0) {
      recordNativePresentationSuccess()
      return decodeNativePresentationStats(statsBuf)
    }
    recordNativePresentationFailure(`vexart_kitty_emit_layer returned ${rc}`)
    logNativePresentationFallback(`layer emit failed (imageId=${imageId})`)
    return null
  } catch (e) {
    recordNativePresentationFailure(`vexart_kitty_emit_layer threw: ${e}`)
    logNativePresentationFallback(`layer emit threw (imageId=${imageId})`)
    return null
  }
}

// ── Native target-backed layer emission ─────────────────────────────────────

/**
 * Emit an already-painted Rust GPU target as a Kitty layer without RGBA crossing JS.
 */
export function nativeEmitLayerTarget(
  target: bigint,
  imageId: number,
  col: number,
  row: number,
  z: number,
  transmissionMode: TransmissionMode,
): NativePresentationStats | null {
  const statsBuf = allocNativeStatsBuf()
  const layerBuf = new Uint8Array(12)
  const layerView = new DataView(layerBuf.buffer)
  layerView.setInt32(0, col, true)
  layerView.setInt32(4, row, true)
  layerView.setInt32(8, z, true)
  try {
    const { symbols } = openVexartLibrary()
    ensureNativeKittyTransport(transmissionMode)
    const rc = symbols.vexart_kitty_emit_layer_target(
      1n,
      target,
      imageId,
      ptr(layerBuf),
      layerBuf.byteLength,
      ptr(statsBuf),
    ) as number
    if (rc === 0) {
      recordNativePresentationSuccess()
      return decodeNativePresentationStats(statsBuf)
    }
    recordNativePresentationFailure(`vexart_kitty_emit_layer_target returned ${rc}`)
    logNativePresentationFallback(`target layer emit failed (imageId=${imageId})`)
    return null
  } catch (e) {
    recordNativePresentationFailure(`vexart_kitty_emit_layer_target threw: ${e}`)
    logNativePresentationFallback(`target layer emit threw (imageId=${imageId})`)
    return null
  }
}

/**
 * Emit a dirty region from an already-painted Rust GPU target without RGBA crossing JS.
 */
export function nativeEmitRegionTarget(
  target: bigint,
  imageId: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  transmissionMode: TransmissionMode,
): NativePresentationStats | null {
  const statsBuf = allocNativeStatsBuf()
  const regionBuf = new Uint8Array(16)
  const regionView = new DataView(regionBuf.buffer)
  regionView.setUint32(0, rx, true)
  regionView.setUint32(4, ry, true)
  regionView.setUint32(8, rw, true)
  regionView.setUint32(12, rh, true)
  try {
    const { symbols } = openVexartLibrary()
    ensureNativeKittyTransport(transmissionMode)
    const rc = symbols.vexart_kitty_emit_region_target(
      1n,
      target,
      imageId,
      ptr(regionBuf),
      regionBuf.byteLength,
      ptr(statsBuf),
    ) as number
    if (rc === 0) {
      recordNativePresentationSuccess()
      return decodeNativePresentationStats(statsBuf)
    }
    recordNativePresentationFailure(`vexart_kitty_emit_region_target returned ${rc}`)
    logNativePresentationFallback(`target region emit failed (imageId=${imageId})`)
    return null
  } catch (e) {
    recordNativePresentationFailure(`vexart_kitty_emit_region_target threw: ${e}`)
    logNativePresentationFallback(`target region emit threw (imageId=${imageId})`)
    return null
  }
}

// ── Native layer deletion ─────────────────────────────────────────────────

/**
 * Delete a Kitty image natively via vexart_kitty_delete_layer.
 *
 * Falls back silently — does NOT disable native presentation on failure
 * since delete failures are non-critical (stale images are harmless).
 *
 * @param imageId — Kitty image ID to delete
 */
export function nativeDeleteLayer(imageId: number): void {
  const statsBuf = allocNativeStatsBuf()
  try {
    const { symbols } = openVexartLibrary()
    symbols.vexart_kitty_delete_layer(1n, imageId, ptr(statsBuf))
    // Ignoring return code for delete — stale images are benign.
  } catch {
    // Delete failure is non-critical — log only in debug mode.
    logNativePresentationFallback(`delete layer threw (imageId=${imageId}), using TS fallback`)
  }
}
