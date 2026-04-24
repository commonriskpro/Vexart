import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import { isNativeSceneGraphEnabled } from "./native-scene-graph-flags"
import { parseLayoutOutput, type PositionedCommand } from "./layout-writeback"

const NATIVE_NODE_KIND = {
  root: 0,
  box: 1,
  text: 2,
  img: 3,
  canvas: 4,
} as const

const PROP_KIND = {
  BOOL: 1,
  I32: 2,
  U32: 3,
  F32: 4,
  STRING: 5,
  CAPABILITY: 6,
} as const

const NATIVE_PROP_ID = {
  width: 1,
  height: 2,
  backgroundColor: 3,
  borderColor: 4,
  borderWidth: 5,
  cornerRadius: 6,
  color: 7,
  fontSize: 8,
  focusable: 9,
  onPress: 10,
  onMouseDown: 11,
  onMouseUp: 12,
  onMouseMove: 13,
  onMouseOver: 14,
  onMouseOut: 15,
  scrollX: 16,
  scrollY: 17,
  layer: 18,
  zIndex: 19,
  debugName: 20,
  opacity: 21,
  pointerPassthrough: 22,
} as const

type NativePropId = (typeof NATIVE_PROP_ID)[keyof typeof NATIVE_PROP_ID]

let sceneHandle: bigint | null = null

export function nativeSceneHandle() {
  return ensureScene()
}

function hashPropName(name: string) {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 60000) + 1000
}

function propIdFor(name: string): NativePropId | number {
  return NATIVE_PROP_ID[name as keyof typeof NATIVE_PROP_ID] ?? hashPropName(name)
}

function safeStringifyValue(value: unknown) {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (_key, entry) => {
      if (typeof entry === "function") return "[function]"
      if (typeof entry === "bigint") return entry.toString()
      if (!entry || typeof entry !== "object") return entry
      if (seen.has(entry)) return "[circular]"
      seen.add(entry)
      return entry
    })
  } catch {
    return '"[unserializable]"'
  }
}

function ensureScene() {
  if (!isNativeSceneGraphEnabled()) return 0n
  if (sceneHandle !== null) return sceneHandle
  const out = new BigUint64Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_create(1n, ptr(out)) as number
  if (rc !== 0) return 0n
  sceneHandle = out[0]
  return sceneHandle
}

function encodeProp(name: string, value: unknown) {
  const propId = propIdFor(name)
  let kind = 0
  let payload = new Uint8Array(0)

  if (typeof value === "boolean") {
    kind = PROP_KIND.BOOL
    payload = Uint8Array.from([value ? 1 : 0])
  } else if (typeof value === "number") {
    if (Number.isInteger(value)) {
      kind = value >= 0 ? PROP_KIND.U32 : PROP_KIND.I32
      payload = new Uint8Array(4)
      const view = new DataView(payload.buffer)
      if (value >= 0) view.setUint32(0, value >>> 0, true)
      else view.setInt32(0, value | 0, true)
    } else {
      kind = PROP_KIND.F32
      payload = new Uint8Array(4)
      new DataView(payload.buffer).setFloat32(0, value, true)
    }
  } else if (typeof value === "function") {
    kind = PROP_KIND.CAPABILITY
    payload = Uint8Array.from([1])
  } else if (typeof value === "string") {
    kind = PROP_KIND.STRING
    payload = new TextEncoder().encode(value)
  } else if (value !== undefined && value !== null) {
    kind = PROP_KIND.STRING
    payload = new TextEncoder().encode(safeStringifyValue(value))
  } else {
    kind = PROP_KIND.STRING
    payload = new Uint8Array(0)
  }

  const buf = new Uint8Array(2 + 2 + 1 + 1 + 4 + payload.byteLength)
  const view = new DataView(buf.buffer)
  view.setUint16(0, 1, true)
  view.setUint16(2, propId, true)
  view.setUint8(4, kind)
  view.setUint8(5, 0)
  view.setUint32(6, payload.byteLength, true)
  buf.set(payload, 10)
  return buf
}

export function nativeSceneCreateNode(kind: keyof typeof NATIVE_NODE_KIND) {
  const scene = ensureScene()
  if (!scene) return null
  const out = new BigUint64Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_node_create(1n, scene, NATIVE_NODE_KIND[kind], ptr(out)) as number
  if (rc !== 0) return null
  return out[0]
}

export function nativeSceneInsert(parent: bigint | null, child: bigint | null, anchor?: bigint | null) {
  if (!parent || !child) return
  const scene = ensureScene()
  if (!scene) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_node_insert(1n, scene, parent, child, anchor ?? 0n)
}

export function nativeSceneRemove(parent: bigint | null, child: bigint | null) {
  if (!parent || !child) return
  const scene = ensureScene()
  if (!scene) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_node_remove(1n, scene, parent, child)
}

export function nativeSceneDestroyNode(node: bigint | null) {
  if (!node) return
  const scene = ensureScene()
  if (!scene) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_node_destroy(1n, scene, node)
}

export function nativeSceneSetProp(node: bigint | null, name: string, value: unknown) {
  if (!node) return
  const scene = ensureScene()
  if (!scene) return
  const payload = encodeProp(name, value)
  const { symbols } = openVexartLibrary()
  symbols.vexart_node_set_props(1n, scene, node, payload.byteLength > 0 ? ptr(payload) : null, payload.byteLength)
}

export function nativeSceneSetText(node: bigint | null, text: string) {
  if (!node) return
  const scene = ensureScene()
  if (!scene) return
  const payload = new TextEncoder().encode(text)
  const { symbols } = openVexartLibrary()
  symbols.vexart_text_set_content(1n, scene, node, payload.byteLength > 0 ? ptr(payload) : null, payload.byteLength)
}

export function nativeSceneSetLayout(node: bigint | null, x: number, y: number, width: number, height: number) {
  if (!node) return
  const scene = ensureScene()
  if (!scene) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_node_set_layout(1n, scene, node, x, y, width, height)
}

export function nativeSceneSetCellSize(width: number, height: number) {
  const scene = ensureScene()
  if (!scene) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_scene_set_cell_size(1n, scene, width, height)
}

export function nativeSceneSnapshot() {
  const scene = ensureScene()
  if (!scene) return null
  const out = new Uint8Array(16 * 1024)
  const used = new Uint32Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_snapshot(1n, scene, ptr(out), out.byteLength, ptr(used)) as number
  if (rc !== 0) return null
  return new TextDecoder().decode(out.slice(0, used[0]))
}

export function nativeSceneComputeLayout(): Map<bigint, PositionedCommand> {
  const scene = ensureScene()
  if (!scene) return new Map<bigint, PositionedCommand>()
  const out = new Uint8Array(256 * 1024)
  const used = new Uint32Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_layout_compute(1n, scene, ptr(out), out.byteLength, ptr(used)) as number
  if (rc !== 0) return new Map<bigint, PositionedCommand>()
  return parseLayoutOutput(out.buffer, used[0])
}

export function nativeSceneHitTest(x: number, y: number) {
  const scene = ensureScene()
  if (!scene) return 0n
  const out = new BigUint64Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_hit_test(1n, scene, x, y, ptr(out)) as number
  if (rc !== 0) return 0n
  return out[0]
}

export function destroyNativeScene() {
  if (sceneHandle === null) return
  try {
    const { symbols } = openVexartLibrary()
    symbols.vexart_scene_destroy(1n, sceneHandle)
  } finally {
    sceneHandle = null
  }
}
