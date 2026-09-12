import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import { ensureImageExtra, type TGENode } from "./node"

const encoder = new TextEncoder()

/** @public */
export type NativeImageAssetInput = {
  key: string
  data: Uint8Array
  width: number
  height: number
  currentFrame?: bigint
  ctx?: bigint
}

/** @public */
export function nativeImageAssetRegister(input: NativeImageAssetInput, _ctx: bigint = 1n): bigint | null {
  if (input.key.length === 0 || input.width <= 0 || input.height <= 0 || input.data.byteLength === 0) return null
  try {
    const key = encoder.encode(input.key)
    const meta = new Uint8Array(8)
    const view = new DataView(meta.buffer)
    view.setUint32(0, input.width >>> 0, true)
    view.setUint32(4, input.height >>> 0, true)
    const out = new BigUint64Array(1)
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_image_asset_register(
      input.currentFrame ?? 0n,
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
export function nativeImageAssetTouch(handle: bigint, currentFrame: bigint = 0n, _ctx: bigint = 1n): boolean {
  if (handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_image_asset_touch(currentFrame, handle) as number) === 0
  } catch {
    return false
  }
}

/** @public */
export function nativeImageAssetRelease(handle: bigint, _ctx: bigint = 1n): boolean {
  if (handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_image_asset_release(handle) as number) === 0
  } catch {
    return false
  }
}

/** Each node owns one native reference, independently of the decode cache. */
export function syncNativeImageHandle(node: TGENode, handle: bigint | null) {
  const extra = ensureImageExtra(node)
  if (extra.nativeHandle === handle) return
  if (handle !== null) {
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_image_asset_retain(handle) as number
    if (code !== 0) throw new Error(`[vexart] cannot retain image asset ${handle}: ${code}`)
  }
  const previous = extra.nativeHandle
  extra.nativeHandle = handle
  if (previous !== null) nativeImageAssetRelease(previous)
}

/** Invalidate pending publications before releasing a node's current image. */
export function releaseNodeImage(node: TGENode) {
  const extra = node._imageExtra
  if (!extra) return
  extra.revision = (extra.revision ?? 0) + 1
  extra.cancel?.()
  extra.cancel = undefined
  syncNativeImageHandle(node, null)
  extra.buffer = null
  extra.source = undefined
  extra.state = "idle"
}

export function releaseSubtreeImages(node: TGENode) {
  releaseNodeImage(node)
  for (const child of node.children) releaseSubtreeImages(child)
}
