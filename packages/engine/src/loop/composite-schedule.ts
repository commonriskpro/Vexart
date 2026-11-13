/**
 * composite-schedule.ts — Frame profiling, walk accumulator management, visual prop synchronization, and compositor fast path.
 *
 * Extracted from composite.ts as part of loop decomposition.
 * Handles:
 *   - Frame profile instantiation and scalar walk counters
 *   - WalkTreeState construction and accumulator resets
 *   - Synchronizing visual properties to commands and ops
 *   - Compositor-only retained frame fast path execution
 *   - Layer slot assignment from traversal buckets
 *   - Frame debug statistics reporting
 */

import {
  CMD,
  BACKDROP_FIELDS,
  getRenderOpClipStack,
  type RenderCommand,
  type ImageRenderOp,
  type EffectRenderOp,
  type EffectConfig,
  type BorderRenderOp,
  type TextRenderOp,
  type ShadowDef,
} from "../ffi/render-graph"
import {
  resolveProps,
  parseColor,
  ensureTransformExtra,
  type TGENode,
  type TGEProps,
  type ShadowConfig,
  type CornerRadii,
} from "../ffi/node"
import { debugUpdateStats, isDebugEnabled } from "./debug"
import type { FrameProfile, LayerBoundary, LayerSlot, DirtyTrackingHandle, CompositeFrameState, WalkCounters, WalkTreeState } from "./types"
export type { WalkCounters } from "./types"
import { summarizeRendererResourceStats } from "./resource-stats"
import { hasCompositorAnimations, isCompositorOnlyFrame, resetFrameTracking } from "../animation/compositor-path"
import type { LayerOpBucket, ClipEntry } from "./pipeline-types"
import { buildRetainedCompositorLayers } from "./composite-retained"
import { markLayerDirtyByKey } from "./composite-damage"
import { createClipStateId, getTransformStateId, getEffectStateId } from "./effect-hash"
import { createBackdropMetadata } from "./pipeline-clip"
import { composeLocalTransform } from "./pipeline-transform"
import { hasBackdropEffect, isInteractiveNode } from "./predicates"
import { shouldPromoteToLayer } from "./layer-boundary"
import { isolatesSubtree } from "./pipeline-damage"
import { DIRTY_KIND } from "../reconciler/dirty"
import type { Matrix3 } from "../ffi/matrix"
import type { PaintResult } from "./types"
import type { RendererBackendFrameContext } from "../ffi/renderer-backend"

/** Create a zero-initialized FrameProfile. Use to avoid 2000-char inline literals. */
export function createFrameProfile(overrides?: Partial<FrameProfile>): FrameProfile {
  return {
    scheduledIntervalMs: 0, scheduledDelayMs: 0, timerDelayMs: 0, sincePrevFrameMs: 0,
    scrollMs: 0, walkTreeMs: 0, layoutComputeMs: 0, layoutWritebackMs: 0,
    interactionMs: 0, relayoutMs: 0, layoutMs: 0, layerAssignMs: 0, prepMs: 0,
    paintNativeSnapshotMs: 0, paintLayerPrepMs: 0, paintFrameContextMs: 0,
    paintBackendBeginMs: 0, paintReuseMs: 0, paintRenderGraphMs: 0,
    paintBackendPaintMs: 0, paintBackendCompositeMs: 0, paintBackendReadbackMs: 0,
    paintBackendNativeEmitMs: 0, paintBackendNativeReadbackMs: 0,
    paintBackendNativeCompressMs: 0, paintBackendNativeShmPrepareMs: 0,
    paintBackendNativeWriteMs: 0, paintBackendNativeRawBytes: 0,
    paintBackendNativePayloadBytes: 0, paintBackendUniformMs: 0,
    paintLayerCleanupMs: 0, paintBackendEndMs: 0, paintPresentationMs: 0,
    paintInteractionStatsMs: 0, paintMs: 0, beginSyncMs: 0, ioMs: 0, endSyncMs: 0,
    totalMs: 0, commands: 0, repainted: 0, dirtyBefore: 0,
    ...overrides,
  }
}

export function syncVisualPropsToCommands(commands: RenderCommand[], nodeRefById: Map<number, TGENode>): void {
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (cmd.nodeId === undefined) continue
    const node = nodeRefById.get(cmd.nodeId)
    if (!node) continue
    const resolved = resolveProps(node)
    if (cmd.type === CMD.RECTANGLE) {
      if (typeof resolved.backgroundColor === "number") cmd.color = resolved.backgroundColor >>> 0
      if (typeof resolved.cornerRadius === "number") cmd.cornerRadius = resolved.cornerRadius
    } else if (cmd.type === CMD.BORDER) {
      if (typeof resolved.borderColor === "number") cmd.color = resolved.borderColor >>> 0
      if (typeof resolved.cornerRadius === "number") cmd.cornerRadius = resolved.cornerRadius
      if (typeof resolved.borderWidth === "number") {
        const bw = resolved.borderWidth
        cmd.extra1 = bw
        cmd.borderWidths = {
          left: resolved.borderLeft ?? bw,
          right: resolved.borderRight ?? bw,
          top: resolved.borderTop ?? bw,
          bottom: resolved.borderBottom ?? bw,
        }
      } else if (cmd.extra1 > 0 && (node.props.hoverStyle?.borderWidth !== undefined || node.props.activeStyle?.borderWidth !== undefined || node.props.focusStyle?.borderWidth !== undefined)) {
        cmd.extra1 = 0
        if (typeof node.props.borderColor !== "number") cmd.color = 0
      }
    } else if (cmd.type === CMD.TEXT) {
      if (typeof resolved.color === "number") cmd.color = resolved.color >>> 0
    }
  }
}

type ColorTransition = {
  from: number
  to: number
  startTime: number
  durationMs: number
}

type NumberTransition = {
  from: number
  to: number
  startTime: number
  durationMs: number
}

type NodeTransitionState = {
  currentBg: number
  targetBg: number
  bgAnim: ColorTransition | null
  currentBorder: number
  targetBorder: number
  borderAnim: ColorTransition | null
  lastBorderWidth: number
  currentText: number
  targetText: number
  textAnim: ColorTransition | null
  currentOpacity: number
  targetOpacity: number
  opacityAnim: NumberTransition | null
}

type NodeVisualFrame = {
  bgColor: number
  borderColor: number
  hasVisualBorder: boolean
  borderLeft: number
  borderRight: number
  borderTop: number
  borderBottom: number
  borderMaxSide: number
  borderFadeWidth: number
  textColor: number
  effectiveOpacityProp: number | undefined
  hasActiveOpacityTransition: boolean
  hasActiveBgTransition: boolean
  active: boolean
}

const DEFAULT_DECLARATIVE_TRANSITION_MS = 150
const nodeTransitions = new WeakMap<TGENode, NodeTransitionState>()

function getTransitionDurationMs(resolved: TGEProps): number {
  if (resolved.transition === true) return DEFAULT_DECLARATIVE_TRANSITION_MS
  if (typeof resolved.transition === "number" && Number.isFinite(resolved.transition) && resolved.transition > 0) {
    return resolved.transition
  }
  return 0
}

function easeOutQuad(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t
  return 1 - (1 - clamped) * (1 - clamped)
}

function lerpColor(c1: number, c2: number, t: number): number {
  const u1 = c1 >>> 0
  const u2 = c2 >>> 0
  if (u1 === u2) return u2
  const a1 = u1 & 0xff
  const a2 = u2 & 0xff
  let r1 = (u1 >>> 24) & 0xff
  let g1 = (u1 >>> 16) & 0xff
  let b1 = (u1 >>> 8) & 0xff
  let r2 = (u2 >>> 24) & 0xff
  let g2 = (u2 >>> 16) & 0xff
  let b2 = (u2 >>> 8) & 0xff
  if (a1 <= 1 && a2 > 1) {
    r1 = r2
    g1 = g2
    b1 = b2
  } else if (a2 <= 1 && a1 > 1) {
    r2 = r1
    g2 = g1
    b2 = b1
  }
  const r = Math.round(r1 + (r2 - r1) * t) & 0xff
  const g = Math.round(g1 + (g2 - g1) * t) & 0xff
  const b = Math.round(b1 + (b2 - b1) * t) & 0xff
  const a = Math.round(a1 + (a2 - a1) * t) & 0xff
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}

function toU32Color(value: string | number | undefined, fallback = 0): number {
  if (value === undefined) return fallback
  if (typeof value === "number") return value >>> 0
  return parseColor(value) >>> 0
}

function markBucketLayerDirty(key: string): void {
  markLayerDirtyByKey(key)
  if (key === "root") markLayerDirtyByKey("bg")
  else if (key === "bg") markLayerDirtyByKey("root")
}

function maxInteractiveBorder(props: TGEProps): number {
  return Math.max(
    props.focusStyle?.borderWidth ?? 0,
    props.hoverStyle?.borderWidth ?? 0,
    props.activeStyle?.borderWidth ?? 0,
  )
}

function hasIsolatingAncestor(node: TGENode): boolean {
  let parent = node.parent
  while (parent) {
    if (parent.kind !== "root") {
      const props = resolveProps(parent)
      if (isolatesSubtree(parent, props)) return true
    }
    parent = parent.parent
  }
  return false
}

function hasChildInDifferentLayer(node: TGENode, layerKey: string): boolean {
  for (const child of node.children) {
    if (child._layerKey && child._layerKey !== layerKey) return true
    if (child.children.length > 0 && hasChildInDifferentLayer(child, layerKey)) return true
  }
  return false
}

function normalizeShadowDef(shadow: ShadowConfig | ShadowConfig[]): ShadowDef | ShadowDef[] {
  if (Array.isArray(shadow)) {
    return shadow.map((entry) => ({
      x: entry.x,
      y: entry.y,
      blur: entry.blur,
      color: toU32Color(entry.color),
    }))
  }
  return {
    x: shadow.x,
    y: shadow.y,
    blur: shadow.blur,
    color: toU32Color(shadow.color),
  }
}

function matricesEqual(a: Matrix3 | Float64Array | null, b: Matrix3 | Float64Array | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  for (let i = 0; i < 9; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) return false
  }
  return true
}

function cornerRadiiEqual(a: CornerRadii | null, b: CornerRadii | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.tl === b.tl && a.tr === b.tr && a.br === b.br && a.bl === b.bl
}

function borderWidthsEqual(
  a: BorderRenderOp["borderWidths"] | null | undefined,
  b: BorderRenderOp["borderWidths"] | null | undefined,
): boolean {
  if ((a ?? null) === (b ?? null)) return true
  if (!a || !b) return false
  return a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom
}

function computeNodeVisualFrame(node: TGENode, resolved: TGEProps, now: number): NodeVisualFrame {
  const isScroll = !!(resolved.scrollX || resolved.scrollY)
  const targetBg = node.kind === "root"
    ? (resolved.backgroundColor !== undefined ? toU32Color(resolved.backgroundColor) : 0)
    : (resolved.backgroundColor !== undefined ? toU32Color(resolved.backgroundColor) : (isScroll ? 0 : 0x00000001))

  const paintBorderWidth = resolved.borderWidth ?? 0
  const borderLeft = resolved.borderLeft ?? paintBorderWidth
  const borderRight = resolved.borderRight ?? paintBorderWidth
  const borderTop = resolved.borderTop ?? paintBorderWidth
  const borderBottom = resolved.borderBottom ?? paintBorderWidth
  const borderMaxSide = Math.max(borderLeft, borderRight, borderTop, borderBottom)
  const parsedBorderColor = resolved.borderColor !== undefined ? toU32Color(resolved.borderColor) : 0
  const hasVisualBorder = (parsedBorderColor & 0xff) > 0 && borderMaxSide > 0
  const targetBorder = hasVisualBorder ? parsedBorderColor : 0

  let targetText = 0
  if (node.kind === "text") {
    const parentProps = node.parent ? resolveProps(node.parent) : undefined
    const rawColor = resolved.color ?? parentProps?.color
    targetText = (rawColor !== undefined ? toU32Color(rawColor) : 0xe0e0e0ff) >>> 0
  }

  const targetOpacity = typeof resolved.opacity === "number"
    ? Math.max(0, Math.min(1, resolved.opacity))
    : 1

  const durationMs = getTransitionDurationMs(resolved)
  if (durationMs <= 0) {
    nodeTransitions.delete(node)
    return {
      bgColor: targetBg,
      borderColor: targetBorder,
      hasVisualBorder,
      borderLeft,
      borderRight,
      borderTop,
      borderBottom,
      borderMaxSide,
      borderFadeWidth: 0,
      textColor: targetText,
      effectiveOpacityProp: resolved.opacity,
      hasActiveOpacityTransition: false,
      hasActiveBgTransition: false,
      active: false,
    }
  }

  let state = nodeTransitions.get(node)
  if (!state) {
    state = {
      currentBg: targetBg,
      targetBg,
      bgAnim: null,
      currentBorder: targetBorder,
      targetBorder,
      borderAnim: null,
      lastBorderWidth: hasVisualBorder ? borderMaxSide : 0,
      currentText: targetText,
      targetText,
      textAnim: null,
      currentOpacity: targetOpacity,
      targetOpacity,
      opacityAnim: null,
    }
    nodeTransitions.set(node, state)
    return {
      bgColor: targetBg,
      borderColor: targetBorder,
      hasVisualBorder,
      borderLeft,
      borderRight,
      borderTop,
      borderBottom,
      borderMaxSide,
      borderFadeWidth: 0,
      textColor: targetText,
      effectiveOpacityProp: resolved.opacity,
      hasActiveOpacityTransition: false,
      hasActiveBgTransition: false,
      active: false,
    }
  }

  if (targetBg !== state.targetBg) {
    if (state.currentBg === targetBg) {
      state.bgAnim = null
    } else {
      state.bgAnim = { from: state.currentBg, to: targetBg, startTime: now, durationMs }
    }
    state.targetBg = targetBg
  }
  if (state.bgAnim) {
    const elapsed = now - state.bgAnim.startTime
    if (elapsed >= state.bgAnim.durationMs) {
      state.currentBg = state.bgAnim.to
      state.bgAnim = null
    } else {
      const eased = easeOutQuad(elapsed / state.bgAnim.durationMs)
      state.currentBg = lerpColor(state.bgAnim.from, state.bgAnim.to, eased)
    }
  }

  if (hasVisualBorder) {
    state.lastBorderWidth = borderMaxSide
  }
  if (targetBorder !== state.targetBorder) {
    if (state.currentBorder === targetBorder) {
      state.borderAnim = null
    } else {
      state.borderAnim = { from: state.currentBorder, to: targetBorder, startTime: now, durationMs }
    }
    state.targetBorder = targetBorder
  }
  if (state.borderAnim) {
    const elapsed = now - state.borderAnim.startTime
    if (elapsed >= state.borderAnim.durationMs) {
      state.currentBorder = state.borderAnim.to
      state.borderAnim = null
      if (!hasVisualBorder) state.lastBorderWidth = 0
    } else {
      const eased = easeOutQuad(elapsed / state.borderAnim.durationMs)
      state.currentBorder = lerpColor(state.borderAnim.from, state.borderAnim.to, eased)
    }
  } else if (!hasVisualBorder) {
    state.lastBorderWidth = 0
  }

  if (node.kind === "text") {
    if (targetText !== state.targetText) {
      if (state.currentText === targetText) {
        state.textAnim = null
      } else {
        state.textAnim = { from: state.currentText, to: targetText, startTime: now, durationMs }
      }
      state.targetText = targetText
    }
    if (state.textAnim) {
      const elapsed = now - state.textAnim.startTime
      if (elapsed >= state.textAnim.durationMs) {
        state.currentText = state.textAnim.to
        state.textAnim = null
      } else {
        const eased = easeOutQuad(elapsed / state.textAnim.durationMs)
        state.currentText = lerpColor(state.textAnim.from, state.textAnim.to, eased)
      }
    }
  }

  if (targetOpacity !== state.targetOpacity) {
    if (Math.abs(state.currentOpacity - targetOpacity) < 1e-4) {
      state.currentOpacity = targetOpacity
      state.opacityAnim = null
    } else {
      state.opacityAnim = { from: state.currentOpacity, to: targetOpacity, startTime: now, durationMs }
    }
    state.targetOpacity = targetOpacity
  }
  if (state.opacityAnim) {
    const elapsed = now - state.opacityAnim.startTime
    if (elapsed >= state.opacityAnim.durationMs) {
      state.currentOpacity = state.opacityAnim.to
      state.opacityAnim = null
    } else {
      const eased = easeOutQuad(elapsed / state.opacityAnim.durationMs)
      state.currentOpacity = state.opacityAnim.from + (state.opacityAnim.to - state.opacityAnim.from) * eased
    }
  }

  const hasActiveOpacityTransition = state.opacityAnim !== null
  const hasActiveBgTransition = state.bgAnim !== null
  const effectiveOpacityProp = hasActiveOpacityTransition
    ? state.currentOpacity
    : (resolved.opacity !== undefined ? state.currentOpacity : undefined)
  const active = !!(state.bgAnim || state.borderAnim || state.textAnim || state.opacityAnim)

  return {
    bgColor: state.currentBg,
    borderColor: state.currentBorder,
    hasVisualBorder,
    borderLeft,
    borderRight,
    borderTop,
    borderBottom,
    borderMaxSide,
    borderFadeWidth: !hasVisualBorder && state.borderAnim ? state.lastBorderWidth : 0,
    textColor: state.currentText,
    effectiveOpacityProp,
    hasActiveOpacityTransition,
    hasActiveBgTransition,
    active,
  }
}

function needsEffectForNode(resolved: TGEProps, frame: NodeVisualFrame): boolean {
  const hasBackdrop = hasBackdropEffect(resolved)
  const hasTransform = resolved.transform !== undefined && resolved.transform !== null
  return !!(
    resolved.shadow
    || resolved.boxShadow
    || resolved.glow
    || resolved.gradient
    || hasBackdrop
    || resolved.cornerRadii
    || frame.effectiveOpacityProp !== undefined
    || frame.hasActiveOpacityTransition
    || hasTransform
    || resolved.filter
  )
}

function applyEffectProps(
  effect: EffectConfig,
  node: TGENode,
  resolved: TGEProps,
  bgColor: number,
  effectiveOpacity: number | undefined,
): void {
  effect.renderObjectId = node.id
  effect.color = bgColor
  effect._node = node
  effect._stateHash = undefined

  const rawShadow = resolved.shadow ?? resolved.boxShadow
  effect.shadow = rawShadow ? normalizeShadowDef(rawShadow) : undefined

  if (resolved.glow) {
    effect.glow = {
      radius: resolved.glow.radius,
      color: toU32Color(resolved.glow.color),
      intensity: resolved.glow.intensity ?? 80,
    }
  } else {
    effect.glow = undefined
  }

  if (resolved.gradient) {
    const g = resolved.gradient
    if (g.type === "linear") {
      effect.gradient = {
        type: "linear",
        from: toU32Color(g.from),
        to: toU32Color(g.to),
        angle: g.angle ?? 90,
      }
    } else {
      effect.gradient = {
        type: "radial",
        from: toU32Color(g.from),
        to: toU32Color(g.to),
      }
    }
  } else {
    effect.gradient = undefined
  }

  for (const field of BACKDROP_FIELDS) {
    effect[field] = resolved[field]
  }
  effect.opacity = effectiveOpacity
  effect.cornerRadii = resolved.cornerRadii
  effect.filter = resolved.filter
}

function syncEffectTransform(
  effect: EffectConfig,
  node: TGENode,
  resolved: TGEProps,
  width: number,
  height: number,
): boolean {
  if (node.kind === "text") return false
  const hasTransform = resolved.transform !== undefined && resolved.transform !== null
  const hadLocalTransform = node._transforms?.local != null

  if (node.children.length > 0 && (hasTransform || hadLocalTransform)) {
    if (hasTransform !== hadLocalTransform) return true
    if (hasTransform && resolved.transform) {
      const composed = composeLocalTransform(resolved.transform, resolved.transformOrigin, width, height)
      if (!matricesEqual(composed?.local ?? null, node._transforms?.local ?? null)) return true
    }
    return false
  }

  if (node.parent?._transforms && (hasTransform || hadLocalTransform)) {
    const composed = hasTransform ? composeLocalTransform(resolved.transform, resolved.transformOrigin, width, height) : null
    if (!matricesEqual(composed?.local ?? null, node._transforms?.local ?? null)) return true
    return false
  }

  if (hasTransform && resolved.transform) {
    const composed = composeLocalTransform(resolved.transform, resolved.transformOrigin, width, height)
    if (composed) {
      const t = ensureTransformExtra(node)
      t.local = composed.local
      t.localInverse = composed.localInverse
      t.acc = composed.local
      t.accInverse = composed.localInverse
      effect.transform = composed.local
      effect.transformInverse = composed.localInverse
      return false
    }
  }

  if (node._transforms) node._transforms = null
  effect.transform = undefined
  effect.transformInverse = undefined
  return false
}

export function syncVisualPropsToOps(
  buckets: LayerOpBucket[],
  nodeRefById: Map<number, TGENode>,
  boxNodes?: TGENode[],
  dirty?: DirtyTrackingHandle,
): boolean {
  const now = performance.now()
  let needsGraphRebuild = false
  const fillNodeIds = new Set<number>()
  const borderNodeIds = new Set<number>()
  const frameByNode = new Map<number, NodeVisualFrame>()

  const getVisualFrame = (node: TGENode, resolved: TGEProps): NodeVisualFrame => {
    let frame = frameByNode.get(node.id)
    if (!frame) {
      frame = computeNodeVisualFrame(node, resolved, now)
      frameByNode.set(node.id, frame)
    }
    return frame
  }

  for (const bucket of buckets) {
    let bucketDirty = false
    for (const op of bucket.ops) {
      if (op.nodeId === undefined) continue
      const node = nodeRefById.get(op.nodeId)
      if (!node) continue
      const resolved = resolveProps(node)
      const frame = getVisualFrame(node, resolved)

      if (op.kind === "rectangle") {
        fillNodeIds.add(node.id)
        if (node.kind === "canvas") {
          if (resolved.onDraw) {
            needsGraphRebuild = true
            bucketDirty = true
          }
          continue
        }
        if (node.kind === "box" && needsEffectForNode(resolved, frame)) {
          needsGraphRebuild = true
          bucketDirty = true
        }
        const prevColor = op.color
        const prevRadius = op.cornerRadius
        const radius = resolved.cornerRadius ?? resolved.borderRadius ?? 0
        op.color = frame.bgColor
        op.cornerRadius = radius
        op.radius = radius
        if (prevColor !== op.color || prevRadius !== op.cornerRadius) {
          bucketDirty = true
        }
      } else if (op.kind === "effect") {
        fillNodeIds.add(node.id)
        const effectOp = op as EffectRenderOp
        if (!needsEffectForNode(resolved, frame)) {
          needsGraphRebuild = true
          bucketDirty = true
          continue
        }
        const prevColor = effectOp.color
        const prevRadius = effectOp.cornerRadius
        const prevEffectStateId = effectOp.effectStateId
        const prevTransformStateId = effectOp.transformStateId
        const prevClipStateId = effectOp.clipStateId
        const prevHadBackdrop = effectOp.backdrop !== null
        const radius = resolved.cornerRadius ?? resolved.borderRadius ?? 0

        effectOp.color = frame.bgColor
        effectOp.cornerRadius = radius
        effectOp.rect.color = frame.bgColor
        effectOp.rect.cornerRadius = radius
        effectOp.rect.radius = radius

        applyEffectProps(effectOp.effect, node, resolved, frame.bgColor, frame.effectiveOpacityProp)
        if (syncEffectTransform(effectOp.effect, node, resolved, effectOp.width, effectOp.height)) {
          needsGraphRebuild = true
          bucketDirty = true
        }

        const clipStack = getRenderOpClipStack(effectOp)
        const backdrop = createBackdropMetadata(
          effectOp.effect,
          effectOp.x,
          effectOp.y,
          effectOp.width,
          effectOp.height,
          radius,
          effectOp.clipBounds ?? null,
          clipStack as unknown as ClipEntry[],
        )
        effectOp.backdrop = backdrop
        effectOp.transformStateId = backdrop?.transformStateId ?? getTransformStateId(effectOp.effect)
        effectOp.clipStateId = backdrop?.clipStateId ?? createClipStateId(clipStack)
        effectOp.effectStateId = backdrop?.effectStateId ?? getEffectStateId(effectOp.effect, radius)

        if (
          prevColor !== effectOp.color
          || prevRadius !== effectOp.cornerRadius
          || prevEffectStateId !== effectOp.effectStateId
          || prevTransformStateId !== effectOp.transformStateId
          || prevClipStateId !== effectOp.clipStateId
          || prevHadBackdrop !== (effectOp.backdrop !== null)
        ) {
          bucketDirty = true
        }
      } else if (op.kind === "border") {
        borderNodeIds.add(node.id)
        const borderOp = op as BorderRenderOp
        const prevColor = borderOp.color
        const prevRadius = borderOp.cornerRadius
        const prevExtra1 = borderOp.extra1
        const prevBorderWidth = borderOp.borderWidth
        const prevCornerRadii = borderOp.cornerRadii
        const prevBorderWidths = borderOp.borderWidths ?? null

        const radius = resolved.cornerRadius ?? resolved.borderRadius ?? 0
        const nextCornerRadii = resolved.cornerRadii ?? null
        let nextColor = 0
        let nextBorderWidth = 0
        let nextBorderWidths: BorderRenderOp["borderWidths"] = null

        if (frame.hasVisualBorder) {
          const uniform =
            frame.borderLeft === frame.borderRight
            && frame.borderRight === frame.borderTop
            && frame.borderTop === frame.borderBottom
          nextColor = frame.borderColor
          nextBorderWidth = frame.borderMaxSide
          nextBorderWidths = uniform
            ? null
            : {
                left: frame.borderLeft,
                right: frame.borderRight,
                top: frame.borderTop,
                bottom: frame.borderBottom,
              }
        } else if (frame.borderFadeWidth > 0 && (frame.borderColor & 0xff) > 1) {
          nextColor = frame.borderColor
          nextBorderWidth = frame.borderFadeWidth
          nextBorderWidths = null
        }

        borderOp.color = nextColor
        borderOp.cornerRadius = radius
        borderOp.radius = radius
        borderOp.extra1 = nextBorderWidth
        borderOp.borderWidth = nextBorderWidth
        borderOp.cornerRadii = nextCornerRadii
        borderOp.borderWidths = nextBorderWidths

        if (
          prevColor !== borderOp.color
          || prevRadius !== borderOp.cornerRadius
          || prevExtra1 !== borderOp.extra1
          || prevBorderWidth !== borderOp.borderWidth
          || !cornerRadiiEqual(prevCornerRadii, borderOp.cornerRadii)
          || !borderWidthsEqual(prevBorderWidths, borderOp.borderWidths)
        ) {
          bucketDirty = true
        }
      } else if (op.kind === "text") {
        const textOp = op as TextRenderOp
        const prevColor = textOp.color
        textOp.color = frame.textColor
        if (prevColor !== textOp.color) {
          bucketDirty = true
        }
      } else if (op.kind === "canvas") {
        fillNodeIds.add(node.id)
        if (!resolved.onDraw) {
          needsGraphRebuild = true
          bucketDirty = true
        }
      } else if (op.kind === "image" || (op as { type?: unknown }).type === "image") {
        fillNodeIds.add(node.id)
        const imageOp = op as ImageRenderOp
        const extra = node._imageExtra
        let textureChanged = false
        if (extra) {
          const newHandle = extra.nativeHandle ?? 0
          if (imageOp.textureId !== newHandle) {
            imageOp.textureId = newHandle
            textureChanged = true
          }
          if (imageOp.image) {
            if (imageOp.image.nativeImageHandle !== extra.nativeHandle) {
              imageOp.image.nativeImageHandle = extra.nativeHandle
              textureChanged = true
            }
            if (extra.buffer && imageOp.image.imageBuffer !== extra.buffer) {
              imageOp.image.imageBuffer = extra.buffer
              textureChanged = true
            }
          }
        }
        if (textureChanged) {
          bucketDirty = true
        }
        const needsEffect = needsEffectForNode(resolved, frame)
        if ((imageOp.rect.effect === null) !== !needsEffect) {
          needsGraphRebuild = true
          bucketDirty = true
        }
        const prevColor = imageOp.color
        const prevRadius = imageOp.cornerRadius
        const prevObjectFit = imageOp.image?.objectFit
        const radius = resolved.cornerRadius ?? resolved.borderRadius ?? 0

        imageOp.color = frame.bgColor
        imageOp.cornerRadius = radius
        if (imageOp.image) {
          imageOp.image.color = frame.bgColor
          imageOp.image.cornerRadius = radius
          imageOp.image.objectFit = resolved.objectFit ?? "contain"
        }
        if (imageOp.rect) {
          imageOp.rect.color = frame.bgColor
          imageOp.rect.cornerRadius = radius
          imageOp.rect.radius = radius
          if (imageOp.rect.effect && needsEffect) {
            imageOp.rect.effect._stateHash = undefined
            const prevEffectHash = getEffectStateId(imageOp.rect.effect, prevRadius)
            const prevTransformStateId = getTransformStateId(imageOp.rect.effect)
            applyEffectProps(imageOp.rect.effect, node, resolved, frame.bgColor, frame.effectiveOpacityProp)
            if (syncEffectTransform(imageOp.rect.effect, node, resolved, imageOp.width, imageOp.height)) {
              needsGraphRebuild = true
              bucketDirty = true
            }
            imageOp.rect.effect._stateHash = undefined
            const nextEffectHash = getEffectStateId(imageOp.rect.effect, radius)
            const nextTransformStateId = getTransformStateId(imageOp.rect.effect)
            if (prevEffectHash !== nextEffectHash || prevTransformStateId !== nextTransformStateId) {
              bucketDirty = true
            }
          }
        }
        if (prevColor !== imageOp.color || prevRadius !== imageOp.cornerRadius || prevObjectFit !== imageOp.image?.objectFit) {
          bucketDirty = true
        }
      }
    }
    if (bucketDirty) {
      markBucketLayerDirty(bucket.key)
    }
  }

  if (boxNodes) {
    for (const node of boxNodes) {
      const resolved = resolveProps(node)
      const frame = getVisualFrame(node, resolved)
      if (node.kind === "root") {
        const radius = resolved.cornerRadius ?? resolved.borderRadius ?? 0
        if (!fillNodeIds.has(node.id) && (frame.bgColor !== 0 || radius !== 0 || frame.hasActiveBgTransition)) {
          needsGraphRebuild = true
          markBucketLayerDirty(node._layerKey ?? "root")
        }
        continue
      }
      if (node.kind === "canvas") {
        if (!fillNodeIds.has(node.id) && resolved.onDraw) {
          needsGraphRebuild = true
          markBucketLayerDirty(node._layerKey ?? "root")
        }
        continue
      }
      if (node.kind !== "box") continue

      const isScroll = !!(resolved.scrollX || resolved.scrollY)
      const hasBackdrop = hasBackdropEffect(resolved)
      const hasTransform = resolved.transform !== undefined && resolved.transform !== null
      const hasSelfFilter = resolved.filter !== undefined
      const hasVisualBorderWidth = frame.borderMaxSide > 0
      const needsBorderGeometry = hasVisualBorderWidth && (resolved.cornerRadius !== undefined || resolved.cornerRadii !== undefined)
      const radius = resolved.cornerRadius ?? resolved.borderRadius ?? 0
      const needsRect =
        resolved.backgroundColor !== undefined
        || resolved.gradient !== undefined
        || hasBackdrop
        || frame.effectiveOpacityProp !== undefined
        || frame.hasActiveOpacityTransition
        || frame.hasActiveBgTransition
        || isInteractiveNode(resolved)
        || hasTransform
        || hasSelfFilter
        || needsBorderGeometry
        || isScroll
      const emitsFillOp = needsRect && (
        needsEffectForNode(resolved, frame)
        || frame.bgColor !== 0
        || radius !== 0
        || isScroll
        || frame.hasActiveBgTransition
      )

      if (!fillNodeIds.has(node.id) && emitsFillOp) {
        needsGraphRebuild = true
        markBucketLayerDirty(node._layerKey ?? "root")
      }

      const hasBorder = frame.hasVisualBorder || maxInteractiveBorder(resolved) > 0
      if (!borderNodeIds.has(node.id) && hasBorder) {
        needsGraphRebuild = true
        markBucketLayerDirty(node._layerKey ?? "root")
      }

      if (
        node._scrollContainerId === 0
        && !hasIsolatingAncestor(node)
        && shouldPromoteToLayer(node)
        && node._layerKey !== "layer:" + node.id
      ) {
        needsGraphRebuild = true
        markBucketLayerDirty(node._layerKey ?? "root")
      }

      if (node.children.length > 0 && isolatesSubtree(node, resolved)) {
        const layerKey = node._layerKey ?? "root"
        if (hasChildInDifferentLayer(node, layerKey)) {
          needsGraphRebuild = true
          markBucketLayerDirty(layerKey)
        }
      }
    }
  }

  if (!needsGraphRebuild && dirty) {
    for (const [nodeId, frame] of frameByNode) {
      if (frame.active) {
        dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId })
      }
    }
  }

  return needsGraphRebuild
}

export function buildWalkState(s: CompositeFrameState): WalkTreeState {
  return {
    scrollSpeedCap: { value: s.walkCounters.scrollSpeedCap },
    nodeCount: s.nodeCountValue,
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
    layerBoundaries: s.layerBoundaries,
    scrollContainers: s.scrollContainers,
    nodeRefById: s.nodeRefById,
    rectNodeById: s.rectNodeById,
    layout: s.layoutAdapter,
    cullingEnabled: true,
    viewportWidth: (s as any).width ?? s.viewportWidth,
    viewportHeight: (s as any).height ?? s.viewportHeight,
    ...((s.scrollOffsets ? { scrollOffsets: s.scrollOffsets } : {}) as any),
  }
}

export function resetWalkAccumulators(s: CompositeFrameState): void {
  s.walkCounters.scrollSpeedCap = 0
  s.rectNodes.length = 0
  s.rectNodeById.clear()
  s.textNodes.length = 0
  s.boxNodes.length = 0
  s.layerBoundaries.length = 0
  s.scrollContainers.length = 0
  s.nodeCountValue.value = 0
  s.nodeRefById.clear()
}

export function tryCompositorOnlyFrame(
  s: CompositeFrameState,
  profile: FrameProfile | undefined,
  dirtyVersionAtFrameStart: number,
  dirtyBeforeFrame: number,
): boolean {
  const backend = s.backendOverride!
  const compositorOnlyFrame = hasCompositorAnimations()
    && isCompositorOnlyFrame()
    && s.scroll.x === 0
    && s.scroll.y === 0
    && !s.pointer.pendingPress
    && !s.pointer.pendingRelease
    && !s.pointer.down
    && !s.pointer.dirty
    && !!backend.compositeRetainedFrame
    && s.layerCache.size > 0

  if (!compositorOnlyFrame) return false

  const retainedPrepStart = profile ? performance.now() : 0
  const retainedLayers = buildRetainedCompositorLayers(s.layerCache, s.nodeRefById)
  if (profile) profile.paintLayerPrepMs = performance.now() - retainedPrepStart
  const dirtyLayerCount = retainedLayers.filter((layer) => layer.opacity < 0.999 || !!layer.subtreeTransform).length
  const dirtyPixelArea = retainedLayers.reduce((sum, layer) => sum + layer.bounds.width * layer.bounds.height, 0)
  const totalPixelArea = Math.max(1, s.viewportWidth * s.viewportHeight)
  const frameCtx = {
    viewportWidth: s.viewportWidth,
    viewportHeight: s.viewportHeight,
    dirtyLayerCount,
    layerCount: retainedLayers.length,
    dirtyPixelArea,
    totalPixelArea,
    overlapPixelArea: 0,
    overlapRatio: 0,
    fullRepaint: false,
    useLayerCompositing: s.useLayerCompositing,
    hasSubtreeTransforms: retainedLayers.some((layer) => !!layer.subtreeTransform),
    hasActiveInteraction: false,
    transmissionMode: s.transmissionMode,
    estimatedLayeredBytes: dirtyPixelArea * 4,
    estimatedFinalBytes: totalPixelArea * 4,
  } satisfies RendererBackendFrameContext
  const beginSyncStart = profile ? performance.now() : 0
  s.term.beginSync()
  if (profile) profile.beginSyncMs = performance.now() - beginSyncStart
  const retainedPaintStart = profile ? performance.now() : 0
  const frameResult = backend.compositeRetainedFrame?.({ frame: frameCtx, layers: retainedLayers }) ?? null
  if (profile) {
    profile.paintBackendPaintMs = performance.now() - retainedPaintStart
    const backendProfile = backend.drainProfile?.()
    if (backendProfile) {
      profile.paintBackendCompositeMs += backendProfile.compositeMs
      profile.paintBackendReadbackMs += backendProfile.readbackMs
      profile.paintBackendNativeEmitMs += backendProfile.nativeEmitMs
      profile.paintBackendNativeReadbackMs += backendProfile.nativeReadbackMs
      profile.paintBackendNativeCompressMs += backendProfile.nativeCompressMs
      profile.paintBackendNativeShmPrepareMs += backendProfile.nativeShmPrepareMs
      profile.paintBackendNativeWriteMs += backendProfile.nativeWriteMs
      profile.paintBackendNativeRawBytes += backendProfile.nativeRawBytes
      profile.paintBackendNativePayloadBytes += backendProfile.nativePayloadBytes
      profile.paintBackendUniformMs += backendProfile.uniformUpdateMs
    }
    profile.paintMs = profile.paintBackendPaintMs
    profile.commands = 0
    profile.dirtyBefore = dirtyBeforeFrame
    profile.repainted = 0
  }
  const endSyncStart = profile ? performance.now() : 0
  s.term.endSync()
  if (profile) profile.endSyncMs = performance.now() - endSyncStart
  if (isDebugEnabled()) {
    const resourceSummary = summarizeRendererResourceStats()
    debugUpdateStats({
      commandCount: 0,
      dirtyBeforeCount: dirtyBeforeFrame,
      layerCount: s.layerStore.layerCount(),
      moveOnlyCount: 0,
      moveFallbackCount: 0,
      stableReuseCount: retainedLayers.length,
      nodeCount: s.nodeCountValue.value,
      repaintedCount: 0,
      rendererStrategy: frameResult?.strategy ?? "final-frame",
      rendererOutput: frameResult?.output ?? "none",
      dirtyPixelArea: frameCtx.dirtyPixelArea,
      totalPixelArea: frameCtx.totalPixelArea,
      overlapPixelArea: frameCtx.overlapPixelArea,
      overlapRatio: frameCtx.overlapRatio,
      fullRepaint: frameCtx.fullRepaint,
      transmissionMode: frameCtx.transmissionMode,
      estimatedLayeredBytes: frameCtx.estimatedLayeredBytes,
      estimatedFinalBytes: frameCtx.estimatedFinalBytes,
      interactionLatencyMs: s.interaction.lastPresentedInteractionLatencyMs.value,
      interactionType: s.interaction.lastPresentedInteractionType.value,
      presentedInteractionSeq: s.interaction.lastPresentedInteractionSeq.value,
      resourceBytes: resourceSummary.totalBytes,
      gpuResourceBytes: resourceSummary.gpuBytes,
      resourceEntries: resourceSummary.cacheEntries,
      nativeStats: frameResult?.output === "native-presented" ? (frameResult.stats ?? null) : null,
      nativeFrameReasonFlags: null,
    })
  }
  resetFrameTracking()
  s.dirty.clearDirty(dirtyVersionAtFrameStart)
  return true
}

export function assignSlotsFromBuckets(
  layerBuckets: LayerOpBucket[],
  layerBoundaries: LayerBoundary[],
  nodeRefById: Map<number, TGENode>,
  forceLayerRepaint: boolean,
): {
  boundaries: LayerBoundary[]
  bgSlot: LayerSlot
  contentSlots: LayerSlot[]
  slotBoundaryByKey: Map<string, LayerBoundary>
  flatCommands: RenderCommand[]
} {
  const boundaries = forceLayerRepaint
    ? layerBoundaries.filter((boundary) => nodeRefById.get(boundary.nodeId)?._autoLayer !== true)
    : layerBoundaries

  const bgBucket = layerBuckets[0]
  const bgSlot: LayerSlot = { key: bgBucket?.key ?? "root", z: -1, cmdIndices: [] }
  const contentSlots: LayerSlot[] = []
  const slotBoundaryByKey = new Map<string, LayerBoundary>()

  for (let i = 1; i < layerBuckets.length; i++) {
    const bucket = layerBuckets[i]
    const boundary = boundaries.find((b) => b.nodeId === bucket.nodeId)
    if (boundary) {
      slotBoundaryByKey.set(bucket.key, boundary)
    }
    contentSlots.push({
      key: bucket.key,
      z: boundary ? boundary.z : i,
      cmdIndices: [],
    })
  }

  const flatCommands: RenderCommand[] = []
  for (const b of layerBuckets) {
    for (const op of b.ops) {
      flatCommands.push(op as unknown as RenderCommand)
    }
  }

  return {
    boundaries,
    bgSlot,
    contentSlots,
    slotBoundaryByKey,
    flatCommands,
  }
}

export function reportCompositeDebugStats(
  s: CompositeFrameState,
  paintResult: PaintResult & {
    repaintedThisFrame: number
    ioMs: number
    rendererOutput: string | null
    moveOnlyCount: number
    moveFallbackCount: number
    stableReuseCount: number
    commandCount: number
    frameCtx: RendererBackendFrameContext
    framePlan: any
    frameResult: any
  },
  dirtyBeforeFrame: number,
): void {
  if (!isDebugEnabled()) return
  const resourceSummary = summarizeRendererResourceStats()
  debugUpdateStats({
    commandCount: paintResult.commandCount,
    dirtyBeforeCount: dirtyBeforeFrame,
    layerCount: s.layerStore.layerCount(),
    moveOnlyCount: paintResult.moveOnlyCount,
    moveFallbackCount: paintResult.moveFallbackCount,
    stableReuseCount: paintResult.stableReuseCount,
    nodeCount: s.nodeCountValue.value,
    repaintedCount: paintResult.repaintedThisFrame,
    rendererStrategy: paintResult.frameResult?.strategy ?? null,
    rendererOutput: paintResult.rendererOutput,
    dirtyPixelArea: paintResult.frameCtx.dirtyPixelArea,
    totalPixelArea: paintResult.frameCtx.totalPixelArea,
    overlapPixelArea: paintResult.frameCtx.overlapPixelArea,
    overlapRatio: paintResult.frameCtx.overlapRatio,
    fullRepaint: paintResult.frameCtx.fullRepaint,
    transmissionMode: paintResult.frameCtx.transmissionMode,
    estimatedLayeredBytes: paintResult.frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: paintResult.frameCtx.estimatedFinalBytes,
    interactionLatencyMs: s.interaction.lastPresentedInteractionLatencyMs.value,
    interactionType: s.interaction.lastPresentedInteractionType.value,
    presentedInteractionSeq: s.interaction.lastPresentedInteractionSeq.value,
    resourceBytes: resourceSummary.totalBytes,
    gpuResourceBytes: resourceSummary.gpuBytes,
    resourceEntries: resourceSummary.cacheEntries,
    nativeFrameReasonFlags: paintResult.framePlan?.nativePlan?.reasonFlags ?? null,
  })
}
