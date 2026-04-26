/**
 * @vexart/engine output — Kitty-first output transport and layer composition.
 */

// Layer compositor (multi-image, browser-style)
export { createLayerComposer } from "./layer-composer"
export type { LayerComposer } from "./layer-composer"

// Transmission mode probing (used by @vexart/engine output during init)
export { probeShm, probeFile, patchRegion, transmitRaw, transmitRawAt, getKittyTransportStats, resetKittyTransportStats } from "./kitty"
export type { TransmissionMode, CompressMode } from "./kitty"
export {
  configureKittyTransportManager,
  getKittyTransportManagerState,
  reportKittyTransportFailure,
  reportKittyTransportSuccess,
  resetKittyTransportManager,
  resolveKittyTransportMode,
  TRANSPORT_FAILURE_REASON,
  TRANSPORT_HEALTH,
} from "./transport-manager"
export type { KittyTransportFailureReason, KittyTransportHealth, KittyTransportManagerState } from "./transport-manager"
export { getNativeKittyShmHelperVersion, prepareNativeKittyShm, releaseNativeKittyShm } from "./kitty-shm-native"
export type { NativeKittyShmHandle } from "./kitty-shm-native"

// Individual Kitty transport helpers (for advanced use)
export * as kitty from "./kitty"
