import { ptr } from "bun:ffi"
import { ensureCanvasExtra, type TGENode } from "./node"
import { openVexartLibrary } from "./vexart-bridge"

const encoder = new TextEncoder()

/** @public */
export type NativeCanvasDisplayListInput = {
  key: string
  bytes: Uint8Array
  currentFrame?: bigint
}

/** @public */
export function nativeCanvasDisplayListUpdate(input: NativeCanvasDisplayListInput): bigint | null {
  if (input.key.length === 0 || input.bytes.byteLength === 0) return null
  try {
    const key = encoder.encode(input.key)
    const out = new BigUint64Array(1)
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_canvas_display_list_update(
      1n,
      0n,
      input.currentFrame ?? 0n,
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
export function nativeCanvasDisplayListTouch(handle: bigint, currentFrame: bigint = 0n): boolean {
  if (handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_canvas_display_list_touch(1n, 0n, currentFrame, handle) as number) === 0
  } catch {
    return false
  }
}

/** @public */
export function nativeCanvasDisplayListRelease(handle: bigint): boolean {
  if (handle === 0n) return false
  try {
    const { symbols } = openVexartLibrary()
    return (symbols.vexart_canvas_display_list_release(1n, 0n, handle) as number) === 0
  } catch {
    return false
  }
}

export function syncNativeCanvasDisplayListHandle(node: TGENode, handle: bigint | null, hash: string | null) {
  const extra = ensureCanvasExtra(node)
  extra.nativeHandle = handle
  extra.displayListHash = hash
}
