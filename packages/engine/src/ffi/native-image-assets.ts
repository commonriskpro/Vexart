import { ptr } from "bun:ffi"
import { nativeSceneHandle, nativeSceneSetProp } from "./native-scene"
import { openVexartLibrary } from "./vexart-bridge"
import type { TGENode } from "./node"

const encoder = new TextEncoder()

/** @public */
export type NativeImageAssetInput = {
  key: string
  data: Uint8Array
  width: number
  height: number
}

/** @public */
export function nativeImageAssetRegister(input: NativeImageAssetInput): bigint | null {
  const scene = nativeSceneHandle()
  if (!scene || input.key.length === 0 || input.width <= 0 || input.height <= 0 || input.data.byteLength === 0) return null
  try {
    const key = encoder.encode(input.key)
    const meta = new Uint8Array(8)
    const view = new DataView(meta.buffer)
    view.setUint32(0, input.width >>> 0, true)
    view.setUint32(4, input.height >>> 0, true)
    const out = new BigUint64Array(1)
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_image_asset_register(
      1n,
      scene,
      ptr(key),
      key.byteLength,
      ptr(input.data),
      input.data.byteLength,
      ptr(meta),
      ptr(out),
    ) as number
    if (code !== 0 || out[0] === 0n) return null
    return out[0]
  } catch {
    return null
  }
}

/** @public */
export function nativeImageAssetTouch(handle: bigint): boolean {
  const scene = nativeSceneHandle()
  if (!scene || handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_image_asset_touch(1n, scene, handle) as number) === 0
  } catch {
    return false
  }
}

/** @public */
export function nativeImageAssetRelease(handle: bigint): boolean {
  const scene = nativeSceneHandle()
  if (!scene || handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_image_asset_release(1n, scene, handle) as number) === 0
  } catch {
    return false
  }
}

export function syncNativeImageHandle(node: TGENode, handle: bigint | null) {
  node._nativeImageHandle = handle
  if (handle && node._nativeId) nativeSceneSetProp(node._nativeId, "__imageHandle", handle.toString())
}
