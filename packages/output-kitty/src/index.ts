/**
 * Temporary bridge package for Kitty-first output APIs.
 */

export { createLayerComposer } from "../../output/src/layer-composer"
export type { LayerComposer } from "../../output/src/layer-composer"

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
} from "../../output/src/kitty"

export type { TransmissionMode, CompressMode } from "../../output/src/kitty"

export {
  configureKittyTransportManager,
  getKittyTransportManagerState,
  reportKittyTransportFailure,
  reportKittyTransportSuccess,
  resetKittyTransportManager,
  resolveKittyTransportMode,
  TRANSPORT_FAILURE_REASON,
  TRANSPORT_HEALTH,
} from "../../output/src/transport-manager"

export type {
  KittyTransportFailureReason,
  KittyTransportHealth,
  KittyTransportManagerState,
} from "../../output/src/transport-manager"

export {
  getNativeKittyShmHelperVersion,
  prepareNativeKittyShm,
  releaseNativeKittyShm,
} from "../../output/src/kitty-shm-native"

export type { NativeKittyShmHandle } from "../../output/src/kitty-shm-native"
