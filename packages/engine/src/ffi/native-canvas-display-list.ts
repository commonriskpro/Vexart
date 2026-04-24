import { ptr } from "bun:ffi"
import type { TGENode } from "./node"
import { nativeSceneHandle, nativeSceneSetProp } from "./native-scene"
import { openVexartLibrary } from "./vexart-bridge"

const encoder = new TextEncoder()

/** @public */
export type NativeCanvasDisplayListInput = {
  key: string
  bytes: Uint8Array
}

/** @public */
export function nativeCanvasDisplayListUpdate(input: NativeCanvasDisplayListInput): bigint | null {
  const scene = nativeSceneHandle()
  if (!scene || input.key.length === 0 || input.bytes.byteLength === 0) return null
  try {
    const key = encoder.encode(input.key)
    const out = new BigUint64Array(1)
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_canvas_display_list_update(
      1n,
      scene,
      ptr(key),
      key.byteLength,
      ptr(input.bytes),
      input.bytes.byteLength,
      ptr(out),
    ) as number
    if (code !== 0 || out[0] === 0n) return null
    return out[0]
  } catch {
    return null
  }
}

/** @public */
export function nativeCanvasDisplayListTouch(handle: bigint): boolean {
  const scene = nativeSceneHandle()
  if (!scene || handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_canvas_display_list_touch(1n, scene, handle) as number) === 0
  } catch {
    return false
  }
}

/** @public */
export function nativeCanvasDisplayListRelease(handle: bigint): boolean {
  const scene = nativeSceneHandle()
  if (!scene || handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_canvas_display_list_release(1n, scene, handle) as number) === 0
  } catch {
    return false
  }
}

export function syncNativeCanvasDisplayListHandle(node: TGENode, handle: bigint | null, hash: string | null) {
  node._nativeCanvasDisplayListHandle = handle
  node._canvasDisplayListHash = hash
  if (handle && node._nativeId) nativeSceneSetProp(node._nativeId, "__canvasDisplayListHandle", handle.toString())
}
