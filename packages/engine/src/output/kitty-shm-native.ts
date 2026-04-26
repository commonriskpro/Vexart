/**
 * kitty-shm-native.ts — native Kitty shared-memory path
 *
 * Rewired from libkitty-shm-helper to libvexart's vexart_kitty_shm_* exports.
 * Per design §11, §5.6 (Translation 4), REQ-NB-006.
 *
 * Signature uses explicit name/data lengths plus an out handle for ARM64-safe FFI.
 *
 * Returns i32 (0=OK, negative=error); handle via out_handle pointer.
 */

import { ptr } from "bun:ffi"
import { openVexartLibrary, VexartNativeError } from "../ffi/vexart-bridge"

/** @public */
export interface NativeKittyShmHandle {
  /** SHM handle — stored as number for API compatibility with kitty.ts consumers.
   *  Internally: the u64 handle from vexart_kitty_shm_prepare is stored in _bigintHandle.
   *  Values that exceed Number.MAX_SAFE_INTEGER will be truncated — acceptable since
   *  SHM handles are typically small fd values on macOS. */
  handle: number
  name: string
  /** BigInt handle for passing to vexart_kitty_shm_release. */
  _bigintHandle: bigint
}

// Internal registry mapping numeric handles to bigint handles for release.
const _handleRegistry = new Map<number, bigint>()

function readLastError(): string {
  const { symbols } = openVexartLibrary()
  const len = symbols.vexart_get_last_error_length() as number
  if (len === 0) return "unknown vexart kitty shm error"
  const buf = new Uint8Array(len)
  symbols.vexart_copy_last_error(ptr(buf), len)
  return new TextDecoder().decode(buf)
}

/** @public */
export function prepareNativeKittyShm(name: string, data: Uint8Array, mode = 0o666): NativeKittyShmHandle {
  const { symbols } = openVexartLibrary()
  const nameBytes = new TextEncoder().encode(name)
  const handleBuf = new BigUint64Array(1)
  const result = symbols.vexart_kitty_shm_prepare(
    ptr(nameBytes),
    nameBytes.byteLength,
    ptr(data),
    data.byteLength,
    mode,
    ptr(handleBuf),
  ) as number
  if (result !== 0) {
    throw new VexartNativeError(result, `vexart_kitty_shm_prepare failed: ${readLastError()}`)
  }
  const bigintHandle = handleBuf[0]
  const numHandle = Number(bigintHandle)
  _handleRegistry.set(numHandle, bigintHandle)
  return { handle: numHandle, name, _bigintHandle: bigintHandle }
}

/** @public */
export function releaseNativeKittyShm(handle: number, unlinkName: boolean) {
  if (!handle) return
  const { symbols } = openVexartLibrary()
  // Retrieve bigint handle from registry, fall back to BigInt(handle)
  const bigintHandle = _handleRegistry.get(handle) ?? BigInt(handle)
  _handleRegistry.delete(handle)
  const result = symbols.vexart_kitty_shm_release(bigintHandle, unlinkName ? 1 : 0) as number
  if (result !== 0) {
    throw new VexartNativeError(result, `vexart_kitty_shm_release failed: ${readLastError()}`)
  }
}

/** Returns vexart version as proxy for kitty shm helper version. */
/** @public */
export function getNativeKittyShmHelperVersion(): number {
  const { symbols } = openVexartLibrary()
  return symbols.vexart_version() as number
}
