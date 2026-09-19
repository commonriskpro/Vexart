/**
 * pipeline-clip.ts — Scissor rect intersection, clip stack lifecycle, and clip state hashing.
 */

import {
  type RenderBounds,
  type RenderGraphOp,
  type EffectConfig,
  type BackdropRenderMetadata,
  setRenderOpClipStack,
} from "../ffi/render-graph"
import {
  type PipelineContext,
  type ClipEntry,
  type ClipBounds,
  pushClip,
  popClip,
  getCurrentClipBounds,
} from "./pipeline-types"
import {
  hashU32Scratch,
  createClipStateId,
  getTransformStateId,
  getBackdropFilterParams,
  getBackdropFilterKind,
  getEffectStateId,
} from "./effect-hash"
import { hasBackdropEffect } from "./predicates"

export { createClipStateId } from "./effect-hash"
export { pushClip, popClip, getCurrentClipBounds } from "./pipeline-types"
export type { ClipEntry, ClipBounds } from "./pipeline-types"

/**
 * Intersects a RenderBounds rect with another rectangle.
 * Returns null if the intersection is empty.
 */
export function intersectBounds(
  a: RenderBounds,
  b: { x: number; y: number; width: number; height: number },
): RenderBounds | null {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= left || bottom <= top) return null
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top)),
  }
}

/**
 * Intersects two scissor / clip bounds rects.
 */
export function intersectClipRects(
  a: ClipBounds | null,
  b: { x: number; y: number; width: number; height: number },
): ClipBounds | null {
  if (!a) {
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.max(0, Math.round(b.width)),
      height: Math.max(0, Math.round(b.height)),
    }
  }
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= left || bottom <= top) {
    return {
      x: Math.max(a.x, b.x),
      y: Math.max(a.y, b.y),
      width: 0,
      height: 0,
    }
  }
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top)),
  }
}

/**
 * Push a scroll container scissor clip into the pipeline context.
 * Calculates scissor bounds in screen-space using parentScrollOffset if nested.
 */
export function pushScrollClip(
  ctx: PipelineContext,
  x: number,
  y: number,
  width: number,
  height: number,
  nodeId: number,
  parentScrollOffset?: { x: number; y: number } | null,
): void {
  const shiftX = parentScrollOffset ? parentScrollOffset.x : 0
  const shiftY = parentScrollOffset ? parentScrollOffset.y : 0
  pushClip(ctx, {
    x: x + shiftX,
    y: y + shiftY,
    width,
    height,
    nodeId,
  })
}

/**
 * Pop a scroll container scissor clip from the pipeline context.
 */
export function popScrollClip(ctx: PipelineContext): void {
  popClip(ctx)
}

/**
 * Build op-ready clip entries with deterministic IDs from current clip stack.
 */
export function buildOpClipEntries(stack: ClipEntry[]): { bounds: RenderBounds; id: number; nodeId: number }[] {
  return stack.map((entry, depth) => ({
    bounds: { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
    id: hashU32Scratch(depth, entry.x, entry.y, entry.width, entry.height),
    nodeId: entry.nodeId,
  }))
}

/**
 * Attaches the current scissor clip stack from PipelineContext to a RenderGraphOp.
 */
export function attachClipStackToOp(op: RenderGraphOp, ctx: PipelineContext): void {
  const stack = ctx.clip.stack
  if (stack.length === 0) return
  setRenderOpClipStack(op, buildOpClipEntries(stack))
}

/**
 * Generates cache key for backdrop filter source matching.
 */
export function createBackdropSourceKey(
  effect: EffectConfig,
  clipStateId: number,
  transformStateId: number,
): string {
  const node = effect._node
  const parentId = node?.parent?.id ?? 0
  const layerId = node?.props.layer ? node.id : parentId
  return "backdrop-source:layer:" + layerId + ":parent:" + parentId + ":" + clipStateId + ":" + transformStateId
}

/**
 * Builds backdrop render metadata including sample bounds and scissor clip intersection.
 */
export function createBackdropMetadata(
  effect: EffectConfig,
  absX: number,
  absY: number,
  width: number,
  height: number,
  cornerRadius: number,
  clipBounds: ClipBounds | null,
  clipStack: ClipEntry[],
): BackdropRenderMetadata | null {
  if (!hasBackdropEffect(effect)) return null
  const inputBounds: RenderBounds = {
    x: Math.round(absX),
    y: Math.round(absY),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  }
  const stackClipBounds = clipBounds
  const bounds = stackClipBounds
    ? intersectBounds(inputBounds, stackClipBounds) ?? {
        x: Math.max(stackClipBounds.x, inputBounds.x),
        y: Math.max(stackClipBounds.y, inputBounds.y),
        width: 0,
        height: 0,
      }
    : inputBounds
  const outputBounds = bounds
  const blurPad = effect.backdropBlur ? Math.ceil(effect.backdropBlur) : 0
  const sampleBounds: RenderBounds = {
    x: Math.round(outputBounds.x - blurPad),
    y: Math.round(outputBounds.y - blurPad),
    width: Math.max(0, Math.round(outputBounds.width + blurPad * 2)),
    height: Math.max(0, Math.round(outputBounds.height + blurPad * 2)),
  }
  const filterParams = getBackdropFilterParams(effect)
  const transformStateId = getTransformStateId(effect)
  const clipStateId = createClipStateId(clipStack)
  const effectStateId = getEffectStateId(effect, Math.round(cornerRadius))
  return {
    backdropSourceKey: createBackdropSourceKey(effect, clipStateId, transformStateId),
    filterKind: getBackdropFilterKind(filterParams),
    filterParams,
    inputBounds,
    sampleBounds,
    outputBounds,
    clipBounds: bounds,
    transformStateId,
    clipStateId,
    effectStateId,
  }
}
