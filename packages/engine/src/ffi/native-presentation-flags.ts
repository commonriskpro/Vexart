/**
 * native-presentation-flags.ts
 * Feature flag and env override for Phase 2b native presentation.
 *
 * Decision: nativePresentation feature flag + VEXART_NATIVE_PRESENTATION=0 override.
 * See openspec/changes/phase-2b-native-presentation/design.md
 *
 * Usage:
 *   import { isNativePresentationEnabled } from "./native-presentation-flags"
 *   if (isNativePresentationEnabled()) { ... }
 *
 * Emergency disable:
 *   VEXART_NATIVE_PRESENTATION=0 bun run showcase
 */

// ── Runtime flag ──────────────────────────────────────────────────────────

/** Whether native presentation is enabled for this process. */
let _nativePresentationEnabled = false

/** Reason string for fallback logging (set when native presentation is disabled). */
let _fallbackReason: string | null = null

// Apply env override at module load time. This ensures the flag is resolved
// before any render loop starts and cannot be changed mid-session.
const _envOverride = process.env.VEXART_NATIVE_PRESENTATION

if (_envOverride === "0") {
  _nativePresentationEnabled = false
  _fallbackReason = "VEXART_NATIVE_PRESENTATION=0 (env override)"
} else if (_envOverride === "1") {
  _nativePresentationEnabled = true
  _fallbackReason = null
}
// No env override: mount/capability probing enables native presentation when
// supported; explicit compatibility fallback remains behind env/runtime flags.

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Check if native presentation is currently enabled.
 *
 * Returns false when:
 *   - VEXART_NATIVE_PRESENTATION=0 env override is set
 *   - enableNativePresentation() was never called
 *   - Native presentation was explicitly disabled for this process
 */
export function isNativePresentationEnabled(): boolean {
  return _nativePresentationEnabled
}

/** True when the emergency env override forbids enabling native presentation. */
export function isNativePresentationForcedOff(): boolean {
  return _envOverride === "0"
}

/**
 * Enable native presentation mode programmatically.
 *
 * Call from the render loop setup after terminal capability probing confirms
 * SHM transport is available. Does nothing if the env override is "0".
 *
 * @param reason Optional description for debug logging.
 */
export function enableNativePresentation(reason?: string): void {
  if (isNativePresentationForcedOff()) {
    _nativePresentationEnabled = false
    _fallbackReason = nativePresentationForcedOffReason()
    // Env override cannot be bypassed programmatically — this is the emergency disable.
    return
  }
  _nativePresentationEnabled = true
  _fallbackReason = null
  if (reason) {
    logNativePresentation(`enabled: ${reason}`)
  }
}

/**
 * Disable native presentation mode and record the fallback reason.
 *
 * Called when native presentation fails (e.g. SHM not available, FFI error).
 */
export function disableNativePresentation(reason: string): void {
  _nativePresentationEnabled = false
  _fallbackReason = reason
  logNativePresentation(`disabled (fallback): ${reason}`)
}

/**
 * Get the current fallback reason (if native presentation is disabled).
 * Returns null if native presentation is enabled or was never tried.
 */
export function getNativePresentationFallbackReason(): string | null {
  return _fallbackReason
}

export function nativePresentationForcedOffReason(): string | null {
  if (_envOverride === "0") return "VEXART_NATIVE_PRESENTATION=0 (env override)"
  return null
}

/**
 * Check if native presentation can use the current Kitty transport.
 *
 * All transport modes (direct/file/shm) are now handled natively by Rust
 * via vexart_kitty_set_transport + vexart_kitty_emit_*. The TS readback
 * fallback has been removed — Rust owns the full readback+encode+emit path.
 */
export function isNativePresentationCapable(transmissionMode: "direct" | "file" | "shm"): boolean {
  return _nativePresentationEnabled
}

// ── Debug logging ─────────────────────────────────────────────────────────

const _debug = process.env.VEXART_DEBUG_NATIVE_PRESENTATION === "1"

function logNativePresentation(msg: string): void {
  if (!_debug) return
  process.stderr.write(`[vexart/native-presentation] ${msg}\n`)
}

export function logNativePresentationFallback(reason: string): void {
  if (!_debug) return
  logNativePresentation(`fallback activated: ${reason}`)
}
