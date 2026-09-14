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

import { openVexartLibrary } from "./vexart-bridge"
import type { TransmissionMode } from "../output/transport-manager"
import { enableNativePresentation } from "./native-presentation-flags"

let currentTransportMode: number | null = null
let consecutiveFailures = 0
let disabledUntilFrame = 0
let currentFrameCounter = 0

/** Call once per frame to allow recovery from transient native presentation failures. */
export function tickNativePresentationRecovery() {
  currentFrameCounter++
  if (disabledUntilFrame > 0 && currentFrameCounter >= disabledUntilFrame) {
    disabledUntilFrame = 0
    consecutiveFailures = 0
    enableNativePresentation("auto-retry after cooldown")
  }
}

function toNativeTransportMode(mode: TransmissionMode | number) {
  if (typeof mode === "number") return mode
  return mode === "shm" ? 2 : 0
}

export function ensureNativeKittyTransport(mode: TransmissionMode | number) {
  const nextMode = toNativeTransportMode(mode)
  if (currentTransportMode === nextMode) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_kitty_set_transport(1n, nextMode)
  currentTransportMode = nextMode
}
