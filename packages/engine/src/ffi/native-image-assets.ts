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
export function nativeImageAssetRegister(input: NativeImageAssetInput, ctx: bigint = 1n): bigint | null {
  if (input.key.length === 0 || input.width <= 0 || input.height <= 0 || input.data.byteLength === 0) return null
  const vctx = input.ctx ?? ctx
  try {
    const key = encoder.encode(input.key)
    const meta = new Uint8Array(8)
    const view = new DataView(meta.buffer)
    view.setUint32(0, input.width >>> 0, true)
    view.setUint32(4, input.height >>> 0, true)
    const out = new BigUint64Array(1)
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_image_asset_register(
      vctx,
      0n,
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
export function nativeImageAssetTouch(handle: bigint, currentFrame: bigint = 0n, ctx: bigint = 1n): boolean {
  if (handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_image_asset_touch(ctx, 0n, currentFrame, handle) as number) === 0
  } catch {
    return false
  }
}

/** @public */
export function nativeImageAssetRelease(handle: bigint, ctx: bigint = 1n): boolean {
  if (handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_image_asset_release(ctx, 0n, handle) as number) === 0
  } catch {
    return false
  }
}

export function syncNativeImageHandle(node: TGENode, handle: bigint | null) {
  ensureImageExtra(node).nativeHandle = handle
}
