/**
 * Temporary bridge stub — all symbols available from ./index
 * output-kitty module folded into engine/src/output
 */

export { createLayerComposer } from "./layer-composer"
export type { LayerComposer } from "./layer-composer"

export {
  probeShm,
  probeFile,
  transmit,
  transmitAt,
  patchRegion,
  transmitRaw,
  transmitRawAt,
  getKittyTransportStats,
  resetKittyTransportStats,
} from "./kitty"

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

export type {
  KittyTransportFailureReason,
  KittyTransportHealth,
  KittyTransportManagerState,
} from "./transport-manager"

export {
  getNativeKittyShmHelperVersion,
  prepareNativeKittyShm,
  releaseNativeKittyShm,
} from "./kitty-shm-native"

export type { NativeKittyShmHandle } from "./kitty-shm-native"
