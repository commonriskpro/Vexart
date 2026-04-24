import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import { nativeSceneHandle } from "./native-scene"

export const NATIVE_EVENT_KIND = {
  POINTER_MOVE: 1,
  POINTER_DOWN: 2,
  POINTER_UP: 3,
  PRESS_CANDIDATE: 4,
  MOUSE_OVER: 5,
  MOUSE_OUT: 6,
  MOUSE_DOWN: 7,
  MOUSE_UP: 8,
  MOUSE_MOVE: 9,
  ACTIVE_END: 10,
} as const

export const NATIVE_INTERACTION_FLAG = {
  POINTER_DOWN: 1,
  POINTER_DIRTY: 2,
  POINTER_PRESSED: 4,
  POINTER_RELEASED: 8,
} as const

export const NATIVE_EVENT_FLAG = {
  FOCUSABLE: 1,
  ON_PRESS: 2,
  CAPTURED: 4,
} as const

export type NativePointerEventRecord = {
  nodeId: bigint
  eventKind: number
  flags: number
  x: number
  y: number
  nodeX: number
  nodeY: number
  width: number
  height: number
}

const EVENT_RECORD_BYTES = 40

function decodeEvent(buf: Uint8Array): NativePointerEventRecord {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return {
    nodeId: view.getBigUint64(0, true),
    eventKind: view.getUint16(8, true),
    flags: view.getUint16(10, true),
    x: view.getFloat32(12, true),
    y: view.getFloat32(16, true),
    nodeX: view.getFloat32(20, true),
    nodeY: view.getFloat32(24, true),
    width: view.getFloat32(28, true),
    height: view.getFloat32(32, true),
  }
}

export function nativePointerEvent(x: number, y: number, eventKind: number) {
  const scene = nativeSceneHandle()
  if (!scene) return null

  const pointer = new Uint8Array(12)
  const pointerView = new DataView(pointer.buffer)
  pointerView.setFloat32(0, x, true)
  pointerView.setFloat32(4, y, true)
  pointerView.setUint16(8, eventKind, true)
  pointerView.setUint16(10, 0, true)

  const out = new Uint8Array(EVENT_RECORD_BYTES)
  const used = new Uint32Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_input_pointer(1n, scene, ptr(pointer), pointer.byteLength, ptr(out), out.byteLength, ptr(used)) as number
  if (rc !== 0 || used[0] === 0) return null
  return decodeEvent(out)
}

export function nativePressChain(x: number, y: number) {
  const scene = nativeSceneHandle()
  if (!scene) return []
  const out = new Uint8Array(EVENT_RECORD_BYTES * 16)
  const used = new Uint32Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_input_press_chain(1n, scene, x, y, ptr(out), out.byteLength, ptr(used)) as number
  if (rc !== 0 || used[0] === 0) return []
  const records = [] as NativePointerEventRecord[]
  for (let offset = 0; offset < used[0]; offset += EVENT_RECORD_BYTES) {
    records.push(decodeEvent(out.subarray(offset, offset + EVENT_RECORD_BYTES)))
  }
  return records
}

export interface NativeInteractionFrameInput {
  x: number
  y: number
  pointerDown: boolean
  pointerDirty: boolean
  pendingPress: boolean
  pendingRelease: boolean
}

export function nativeInteractionFrame(input: NativeInteractionFrameInput) {
  const scene = nativeSceneHandle()
  if (!scene) return []

  let flags = 0
  if (input.pointerDown) flags |= NATIVE_INTERACTION_FLAG.POINTER_DOWN
  if (input.pointerDirty) flags |= NATIVE_INTERACTION_FLAG.POINTER_DIRTY
  if (input.pendingPress) flags |= NATIVE_INTERACTION_FLAG.POINTER_PRESSED
  if (input.pendingRelease) flags |= NATIVE_INTERACTION_FLAG.POINTER_RELEASED

  const pointer = new Uint8Array(12)
  const pointerView = new DataView(pointer.buffer)
  pointerView.setFloat32(0, input.x, true)
  pointerView.setFloat32(4, input.y, true)
  pointerView.setUint16(8, flags, true)
  pointerView.setUint16(10, 0, true)

  const out = new Uint8Array(EVENT_RECORD_BYTES * 64)
  const used = new Uint32Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_input_interaction_frame(1n, scene, ptr(pointer), pointer.byteLength, ptr(out), out.byteLength, ptr(used)) as number
  if (rc !== 0 || used[0] === 0) return []
  const records = [] as NativePointerEventRecord[]
  for (let offset = 0; offset < used[0]; offset += EVENT_RECORD_BYTES) {
    records.push(decodeEvent(out.subarray(offset, offset + EVENT_RECORD_BYTES)))
  }
  return records
}

export function nativeSetPointerCapture(nodeId: bigint) {
  const scene = nativeSceneHandle()
  if (!scene || !nodeId) return false
  const { symbols } = openVexartLibrary()
  return (symbols.vexart_input_set_pointer_capture(1n, scene, nodeId) as number) === 0
}

export function nativeReleasePointerCapture(nodeId: bigint) {
  const scene = nativeSceneHandle()
  if (!scene || !nodeId) return false
  const { symbols } = openVexartLibrary()
  return (symbols.vexart_input_release_pointer_capture(1n, scene, nodeId) as number) === 0
}

export function nativeFocusNext(current?: bigint | null) {
  const scene = nativeSceneHandle()
  if (!scene) return 0n
  const out = new BigUint64Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_focus_next(1n, scene, current ?? 0n, ptr(out)) as number
  if (rc !== 0) return 0n
  return out[0]
}

export function nativeFocusPrev(current?: bigint | null) {
  const scene = nativeSceneHandle()
  if (!scene) return 0n
  const out = new BigUint64Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_focus_prev(1n, scene, current ?? 0n, ptr(out)) as number
  if (rc !== 0) return 0n
  return out[0]
}
