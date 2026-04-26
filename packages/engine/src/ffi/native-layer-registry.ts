/**
 * native-layer-registry.ts
 * TypeScript wrappers for Phase 2c native LayerRegistry FFI.
 */

import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import { disableNativeLayerRegistry, isNativeLayerRegistryEnabled } from "./native-layer-registry-flags"

const encoder = new TextEncoder()
const handlesByKey = new Map<string, bigint>()
let frame = 0n

export type NativeLayerUpsertResult = {
  handle: bigint
  imageId: number
  flags: number
  bytes: bigint
}

export type NativeLayerDescriptor = {
  target: bigint
  x: number
  y: number
  width: number
  height: number
  z: number
}

function nextFrame() {
  frame += 1n
  return frame
}

function writeDescriptor(desc: NativeLayerDescriptor, frameId: bigint) {
  const buf = new Uint8Array(40)
  const view = new DataView(buf.buffer)
  view.setBigUint64(0, desc.target, true)
  view.setFloat32(8, desc.x, true)
  view.setFloat32(12, desc.y, true)
  view.setUint32(16, Math.max(0, Math.round(desc.width)), true)
  view.setUint32(20, Math.max(0, Math.round(desc.height)), true)
  view.setInt32(24, Math.round(desc.z), true)
  view.setUint32(28, 0, true)
  view.setBigUint64(32, frameId, true)
  return buf
}

function readUpsertResult(buf: Uint8Array): NativeLayerUpsertResult {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return {
    handle: view.getBigUint64(0, true),
    imageId: view.getUint32(8, true),
    flags: view.getUint32(12, true),
    bytes: view.getBigUint64(16, true),
  }
}

function readImageId(buf: Uint32Array) {
  return buf[0]
}

export function nativeLayerUpsert(key: string, desc: NativeLayerDescriptor): NativeLayerUpsertResult | null {
  if (!isNativeLayerRegistryEnabled()) return null
  if (desc.width <= 0 || desc.height <= 0) return null

  const keyBuf = encoder.encode(key)
  const descBuf = writeDescriptor(desc, nextFrame())
  const outBuf = new Uint8Array(24)
  try {
    const { symbols } = openVexartLibrary()
    const rc = symbols.vexart_layer_upsert(1n, ptr(keyBuf), keyBuf.byteLength, ptr(descBuf), descBuf.byteLength, ptr(outBuf)) as number
    if (rc !== 0) {
      disableNativeLayerRegistry(`vexart_layer_upsert returned ${rc}`)
      return null
    }
    const result = readUpsertResult(outBuf)
    handlesByKey.set(key, result.handle)
    return result
  } catch (e) {
    disableNativeLayerRegistry(`vexart_layer_upsert threw: ${e}`)
    return null
  }
}

export function nativeLayerPresentDirty(key: string): number | null {
  if (!isNativeLayerRegistryEnabled()) return null
  const handle = handlesByKey.get(key)
  if (!handle) return null
  const out = new Uint32Array(1)
  try {
    const { symbols } = openVexartLibrary()
    const rc = symbols.vexart_layer_present_dirty(1n, handle, nextFrame(), ptr(out)) as number
    if (rc !== 0) return null
    return readImageId(out)
  } catch {
    return null
  }
}

export function nativeLayerReuse(key: string): number | null {
  if (!isNativeLayerRegistryEnabled()) return null
  const handle = handlesByKey.get(key)
  if (!handle) return null
  const out = new Uint32Array(1)
  try {
    const { symbols } = openVexartLibrary()
    const rc = symbols.vexart_layer_reuse(1n, handle, nextFrame(), ptr(out)) as number
    if (rc !== 0) return null
    return readImageId(out)
  } catch {
    return null
  }
}

export function nativeLayerRemove(key: string): number | null {
  const handle = handlesByKey.get(key)
  if (!handle) return null
  const out = new Uint32Array(1)
  try {
    const { symbols } = openVexartLibrary()
    const rc = symbols.vexart_layer_remove(1n, handle, ptr(out)) as number
    handlesByKey.delete(key)
    if (rc !== 0) return null
    return readImageId(out)
  } catch {
    handlesByKey.delete(key)
    return null
  }
}

export function clearNativeLayerRegistryMirror() {
  try {
    const { symbols } = openVexartLibrary()
    symbols.vexart_layer_clear(1n)
  } catch {
    // Best-effort cleanup — mirror still gets cleared locally.
  }
  handlesByKey.clear()
}
