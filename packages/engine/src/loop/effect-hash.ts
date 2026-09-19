/**
 * effect-hash.ts — Shared FNV-1a effect hashing, transform and backdrop metadata extraction,
 * and clip/effect state identification for pipeline traversal and render graph ops.
 */

import type { Matrix3 } from "../ffi/matrix"
import type { EffectConfig } from "../ffi/render-graph"
import type { ClipEntry } from "./pipeline-types"
import { BACKDROP_FIELDS, type BackdropFieldName } from "./predicates"

export { BACKDROP_FIELDS, type BackdropFieldName }

/** The corresponding BackdropFilterParams keys (without "backdrop" prefix, lowercased). */
export const BACKDROP_PARAM_KEYS = [
  "blur", "brightness", "contrast", "saturate",
  "grayscale", "invert", "sepia", "hueRotate",
] as const

/** @public */
export const BACKDROP_FILTER_KIND = {
  BLUR: "blur",
  COLOR: "color",
  BLUR_COLOR: "blur-color",
} as const

/** @public */
export type BackdropFilterKind = (typeof BACKDROP_FILTER_KIND)[keyof typeof BACKDROP_FILTER_KIND]

/** @public */
export interface BackdropFilterParams {
  blur: number | null
  brightness: number | null
  contrast: number | null
  saturate: number | null
  grayscale: number | null
  invert: number | null
  sepia: number | null
  hueRotate: number | null
}

// ── Scratch Buffers ─────────────────────────────────────────────────────────

export const transformHashF64 = new Float64Array(9)
export const transformHashU8 = new Uint8Array(transformHashF64.buffer)
export const effectHashBuf = new ArrayBuffer(512)
export const effectHashView = new DataView(effectHashBuf)
export const effectHashU8 = new Uint8Array(effectHashBuf)

// ── Hashing Utilities ───────────────────────────────────────────────────────

export function fnv1a(data: ArrayLike<number>): number {
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function hashU32Scratch(a: number, b: number, c: number, d: number, e: number): number {
  let h = 0x811c9dc5
  const mix = (input: number) => {
    let value = input >>> 0
    for (let i = 0; i < 4; i++) {
      h ^= value & 0xff
      h = Math.imul(h, 0x01000193)
      value >>>= 8
    }
  }
  mix(a); mix(b); mix(c); mix(d); mix(e)
  return h >>> 0
}

export type ClipLikeEntry = ClipEntry | { id: number }

export function createClipStateId(stack: readonly (ClipEntry | { id: number })[]): number {
  if (stack.length === 0) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < stack.length; i++) {
    const entry = stack[i]
    let value: number
    if ("id" in entry && typeof entry.id === "number") {
      value = entry.id >>> 0
    } else {
      const e = entry as ClipEntry
      value = hashU32Scratch(i, e.x, e.y, e.width, e.height)
    }
    for (let b = 0; b < 4; b++) {
      h ^= value & 0xff
      h = Math.imul(h, 0x01000193)
      value >>>= 8
    }
  }
  return h >>> 0
}

export function getTransformMatrix(effect: EffectConfig): Matrix3 | Float64Array | null {
  const node = effect._node
  if (node?._transforms) {
    if (node._transforms.acc) return node._transforms.acc
    if (node._transforms.local) return node._transforms.local
  }
  if (effect.transform) return effect.transform
  return null
}

export function getTransformStateId(effect: EffectConfig): number {
  const matrix = getTransformMatrix(effect)
  if (!matrix) return 0
  for (let i = 0; i < 9; i++) {
    transformHashF64[i] = Number.isFinite(matrix[i]) ? matrix[i] : 0
  }
  return fnv1a(transformHashU8)
}

export function getBackdropFilterParams(effect: EffectConfig): BackdropFilterParams {
  const params = {} as BackdropFilterParams
  for (let i = 0; i < BACKDROP_FIELDS.length; i++) {
    params[BACKDROP_PARAM_KEYS[i]] = effect[BACKDROP_FIELDS[i]] ?? null
  }
  return params
}

export function getBackdropFilterKind(params: BackdropFilterParams): BackdropFilterKind {
  const hasBlur = params.blur !== null && params.blur > 0
  const hasColor =
    params.brightness !== null ||
    params.contrast !== null ||
    params.saturate !== null ||
    params.grayscale !== null ||
    params.invert !== null ||
    params.sepia !== null ||
    params.hueRotate !== null
  if (hasBlur && hasColor) return BACKDROP_FILTER_KIND.BLUR_COLOR
  if (hasBlur) return BACKDROP_FILTER_KIND.BLUR
  return BACKDROP_FILTER_KIND.COLOR
}

export function getEffectStateId(effect: EffectConfig, radius = 0): number {
  if (effect._stateHash !== undefined && effect._node?._vpDirty === false) return effect._stateHash
  let offset = 0
  const writeU32 = (value: number) => { effectHashView.setUint32(offset, value >>> 0, true); offset += 4 }
  const writeF64 = (value: number) => { effectHashView.setFloat64(offset, Number.isFinite(value) ? value : 0, true); offset += 8 }
  writeU32(effect.color)
  writeF64(radius)
  if (Array.isArray(effect.shadow)) {
    for (let i = 0; i < effect.shadow.length; i++) {
      const entry = effect.shadow[i]
      writeF64(entry.x)
      writeF64(entry.y)
      writeF64(entry.blur)
      writeU32(entry.color)
    }
  } else if (effect.shadow) {
    writeF64(effect.shadow.x)
    writeF64(effect.shadow.y)
    writeF64(effect.shadow.blur)
    writeU32(effect.shadow.color)
  }
  if (effect.glow) {
    writeF64(effect.glow.radius)
    writeU32(effect.glow.color)
    writeF64(effect.glow.intensity)
  }
  if (effect.gradient) {
    writeU32(effect.gradient.type === "linear" ? 1 : 2)
    writeU32(effect.gradient.from)
    writeU32(effect.gradient.to)
    writeF64(effect.gradient.type === "linear" ? effect.gradient.angle : 0)
  }
  const params = getBackdropFilterParams(effect)
  writeF64(params.blur ?? -1)
  writeF64(params.brightness ?? -1)
  writeF64(params.contrast ?? -1)
  writeF64(params.saturate ?? -1)
  writeF64(params.grayscale ?? -1)
  writeF64(params.invert ?? -1)
  writeF64(params.sepia ?? -1)
  writeF64(params.hueRotate ?? -1)
  // Self-filter fields participate in the effect identity as well. This is
  // consumed by transformed-sprite caches, so toggling a reactive filter (or
  // changing one of the individual channels) cannot reuse stale pixels.
  const selfFilter = effect.filter
  writeF64(selfFilter?.blur ?? -1)
  writeF64(selfFilter?.brightness ?? -1)
  writeF64(selfFilter?.contrast ?? -1)
  writeF64(selfFilter?.saturate ?? -1)
  writeF64(selfFilter?.grayscale ?? -1)
  writeF64(selfFilter?.invert ?? -1)
  writeF64(selfFilter?.sepia ?? -1)
  writeF64(selfFilter?.hueRotate ?? -1)
  writeF64(effect.opacity ?? -1)
  if (effect.cornerRadii) {
    writeF64(effect.cornerRadii.tl)
    writeF64(effect.cornerRadii.tr)
    writeF64(effect.cornerRadii.br)
    writeF64(effect.cornerRadii.bl)
  }
  const hash = fnv1a(effectHashU8.subarray(0, offset))
  effect._stateHash = hash
  return hash
}
