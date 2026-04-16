import type { TransmissionMode } from "./kitty"

const TRANSPORT_HEALTH = {
  UNKNOWN: "unknown",
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNSUPPORTED: "unsupported",
} as const

const TRANSPORT_FAILURE_REASON = {
  PROBE_FAILED: "probe_failed",
  SHM_OPEN_FAILED: "shm_open_failed",
  FTRUNCATE_FAILED: "ftruncate_failed",
  MMAP_FAILED: "mmap_failed",
  FILE_WRITE_FAILED: "file_write_failed",
  RUNTIME_TRANSPORT_ERROR: "runtime_transport_error",
} as const

export type KittyTransportHealth = (typeof TRANSPORT_HEALTH)[keyof typeof TRANSPORT_HEALTH]
export type KittyTransportFailureReason = (typeof TRANSPORT_FAILURE_REASON)[keyof typeof TRANSPORT_FAILURE_REASON]

export interface KittyTransportTelemetryBucket {
  success: number
  failure: number
  fallback: number
}

export interface KittyTransportManagerState {
  preferredMode: TransmissionMode
  activeMode: TransmissionMode
  probe: Record<Exclude<TransmissionMode, "direct">, boolean>
  health: Record<TransmissionMode, KittyTransportHealth>
  lastFailureReason: KittyTransportFailureReason | null
  telemetry: Record<TransmissionMode, KittyTransportTelemetryBucket>
}

export interface ConfigureKittyTransportManagerOptions {
  preferredMode: TransmissionMode
  probe: Record<Exclude<TransmissionMode, "direct">, boolean>
}

const state: KittyTransportManagerState = {
  preferredMode: "direct",
  activeMode: "direct",
  probe: { shm: false, file: false },
  health: {
    shm: TRANSPORT_HEALTH.UNKNOWN,
    file: TRANSPORT_HEALTH.UNKNOWN,
    direct: TRANSPORT_HEALTH.HEALTHY,
  },
  lastFailureReason: null,
  telemetry: {
    shm: { success: 0, failure: 0, fallback: 0 },
    file: { success: 0, failure: 0, fallback: 0 },
    direct: { success: 0, failure: 0, fallback: 0 },
  },
}

function nextMode(mode: TransmissionMode) {
  if (mode === "shm") return state.probe.file ? "file" : "direct"
  if (mode === "file") return "direct"
  return "direct"
}

function canUseMode(mode: TransmissionMode) {
  if (mode === "direct") return true
  if (!state.probe[mode]) return false
  return state.health[mode] !== TRANSPORT_HEALTH.UNSUPPORTED && state.health[mode] !== TRANSPORT_HEALTH.DEGRADED
}

export function resetKittyTransportManager() {
  state.preferredMode = "direct"
  state.activeMode = "direct"
  state.probe.shm = false
  state.probe.file = false
  state.health.shm = TRANSPORT_HEALTH.UNKNOWN
  state.health.file = TRANSPORT_HEALTH.UNKNOWN
  state.health.direct = TRANSPORT_HEALTH.HEALTHY
  state.lastFailureReason = null
  for (const mode of ["shm", "file", "direct"] as const) {
    state.telemetry[mode].success = 0
    state.telemetry[mode].failure = 0
    state.telemetry[mode].fallback = 0
  }
}

export function configureKittyTransportManager(options: ConfigureKittyTransportManagerOptions) {
  state.preferredMode = options.preferredMode
  state.probe.shm = options.probe.shm
  state.probe.file = options.probe.file
  state.health.shm = options.probe.shm ? TRANSPORT_HEALTH.HEALTHY : TRANSPORT_HEALTH.UNSUPPORTED
  state.health.file = options.probe.file ? TRANSPORT_HEALTH.HEALTHY : TRANSPORT_HEALTH.UNSUPPORTED
  state.health.direct = TRANSPORT_HEALTH.HEALTHY
  state.activeMode = resolveKittyTransportMode(options.preferredMode)
  state.lastFailureReason = null
}

export function resolveKittyTransportMode(requestedMode: TransmissionMode) {
  if (requestedMode === "direct") return "direct"
  if (canUseMode(requestedMode)) return requestedMode
  const fallback = nextMode(requestedMode)
  if (fallback !== requestedMode) {
    state.telemetry[requestedMode].fallback += 1
  }
  if (fallback === "direct") {
    state.activeMode = "direct"
    return "direct"
  }
  if (canUseMode(fallback)) {
    state.activeMode = fallback
    return fallback
  }
  state.activeMode = "direct"
  return "direct"
}

export function reportKittyTransportSuccess(mode: TransmissionMode) {
  state.telemetry[mode].success += 1
  if (mode !== "direct") state.health[mode] = TRANSPORT_HEALTH.HEALTHY
  state.activeMode = mode
}

export function reportKittyTransportFailure(mode: TransmissionMode, reason: KittyTransportFailureReason) {
  state.telemetry[mode].failure += 1
  state.lastFailureReason = reason
  if (mode !== "direct") state.health[mode] = TRANSPORT_HEALTH.DEGRADED
  state.activeMode = resolveKittyTransportMode(nextMode(mode))
}

export function getKittyTransportManagerState(): KittyTransportManagerState {
  return {
    preferredMode: state.preferredMode,
    activeMode: state.activeMode,
    probe: { ...state.probe },
    health: { ...state.health },
    lastFailureReason: state.lastFailureReason,
    telemetry: {
      shm: { ...state.telemetry.shm },
      file: { ...state.telemetry.file },
      direct: { ...state.telemetry.direct },
    },
  }
}

export { TRANSPORT_FAILURE_REASON, TRANSPORT_HEALTH }
