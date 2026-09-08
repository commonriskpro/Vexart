/**
 * TGENode — the bridge between SolidJS reconciler and Vexart layout.
 *
 * SolidJS creates/manipulates TGENodes via createRenderer methods.
 * Each frame, we walk the TGENode tree and emit commands into the
 * TypeScript layout adapter per design §8.
 *
 * TGENode is a TypeScript-owned tree. Flexily layout nodes are retained on
 * TGENode instances and updated reactively from reconciler mutations.
 *
 * Layout constants are re-exported from this module for compatibility with
 * callers that read them.
 */

import { Node, FLEX_DIRECTION_COLUMN } from "flexily"
import { syncAllLayoutProps } from "./flex-sync"
import {
  ALIGN_X,
  ALIGN_Y,
  DIRECTION,
  INTERACTION_MODE,
  SIZING,
  TGE_NODE_KIND,
} from "./node-types"
import type {
  CornerRadii,
  FilterConfig,
  GlowConfig,
  GradientConfig,
  InteractionMode,
  InteractiveStyleProps,
  LayoutRect,
  NodeCanvasExtra,
  NodeImageExtra,
  NodeMouseEvent,
  PressEvent,
  ShadowConfig,
  SizingInfo,
  TGEProps,
  TGENode,
  TGENodeKind,
  TransformConfig,
  ViewportConfig,
} from "./node-types"
export {
  ALIGN_X,
  ALIGN_Y,
  DIRECTION,
  INTERACTION_MODE,
  SIZING,
  TGE_NODE_KIND,
} from "./node-types"
export type {
  CornerRadii,
  FilterConfig,
  GlowConfig,
  GradientConfig,
  InteractionMode,
  InteractiveStyleProps,
  LayoutRect,
  NodeCanvasExtra,
  NodeImageExtra,
  NodeMouseEvent,
  PressEvent,
  ShadowConfig,
  SizingInfo,
  TGEProps,
  TGENode,
  TGENodeKind,
  TransformConfig,
  ViewportConfig,
} from "./node-types"

/** @public Create a PressEvent instance. */
export function createPressEvent(): PressEvent {
  let stopped = false
  return {
    stopPropagation() { stopped = true },
    get propagationStopped() { return stopped },
  }
}

let nextNodeId = 1

/** @public */
export function createNode(kind: TGENodeKind): TGENode {
  const flex = kind === "text" ? null : Node.create()
  flex?.setFlexDirection(FLEX_DIRECTION_COLUMN)
  return {
    kind,
    props: {},
    text: "",
    children: [],
    parent: null,
    id: nextNodeId++,
    destroyed: false,
    layout: { x: 0, y: 0, width: 0, height: 0 },
    _flexNode: flex,
    _hovered: false,
    _active: false,
    _focused: false,
    _imageExtra: kind === "img" ? { buffer: null, state: "idle", nativeHandle: null } : null,
    _canvasExtra: kind === "canvas" ? { displayListCommands: null, displayListHash: null, drawCacheKey: null, nativeHandle: null } : null,
    _widthSizing: null,
    _heightSizing: null,
    _transform: null,
    _transformInverse: null,
    _accTransform: null,
    _accTransformInverse: null,
    _interactionMode: "none",
    _vp: null,
    _vpDirty: true,
    _siblingIndex: 0,
    _focusableCount: 0,
    _dfsIndex: 0,
    _depth: 0,
    _scrollContainerId: 0,
    _stableFrameCount: 0,
    _unstableFrameCount: 0,
    _autoLayer: false,
    _layerKey: null,
    _lastMeasuredText: null,
    _lastMeasuredFontId: -1,
    _lastMeasuredFontSize: -1,
    _lastMeasurement: null,
  }
}

export function ensureImageExtra(node: TGENode): NodeImageExtra {
  if (!node._imageExtra) node._imageExtra = { buffer: null, state: "idle", nativeHandle: null }
  return node._imageExtra
}

export function ensureCanvasExtra(node: TGENode): NodeCanvasExtra {
  if (!node._canvasExtra) node._canvasExtra = { displayListCommands: null, displayListHash: null, drawCacheKey: null, nativeHandle: null }
  return node._canvasExtra
}

/**
 * Resolve effective props:
 *   1. Merge `style` prop under direct props (direct wins)
 *   2. Resolve aliases: borderRadius→cornerRadius, boxShadow→shadow
 *   3. Resolve padding shorthand: [Y,X] or [T,R,B,L]
 *   4. Merge hoverStyle/activeStyle/focusStyle when active
 */
/** @public */
export function resolveProps(node: TGENode): TGEProps {
  if (node._vp && !node._vpDirty) return node._vp
  let base = node.props

  // 1. Merge style prop (direct props override style)
  if (base.style) {
    base = { ...base.style, ...base }
  }

  // 2. Resolve aliases
  if (base.borderRadius !== undefined && base.cornerRadius === undefined) {
    base = { ...base, cornerRadius: base.borderRadius }
  }
  if (base.boxShadow !== undefined && base.shadow === undefined) {
    base = { ...base, shadow: base.boxShadow }
  }

  // 3. Merge interactive states
  const needsInteractive = node._hovered || node._active || node._focused
  if (!needsInteractive || (!base.hoverStyle && !base.activeStyle && !base.focusStyle)) {
    node._vp = base
    node._vpDirty = false
    return base
  }

  let resolved = base
  if (node._hovered && base.hoverStyle) {
    resolved = { ...resolved, ...base.hoverStyle }
  }
  if (node._focused && base.focusStyle) {
    resolved = { ...resolved, ...base.focusStyle }
  }
  if (node._active && base.activeStyle) {
    resolved = { ...resolved, ...base.activeStyle }
  }
  node._vp = resolved
  node._vpDirty = false
  return resolved
}

export function createTextNode(text: string): TGENode {
  const node = createNode("text")
  node.text = text
  return node
}

/** @public */
export function insertChild(parent: TGENode, child: TGENode, anchor?: TGENode) {
  if (child.parent === parent && anchor === child) return

  const previousParent = child.parent
  if (previousParent) {
    const previousIndex = previousParent.children.indexOf(child)
    if (previousIndex >= 0) {
      if (previousParent._flexNode && child._flexNode) {
        previousParent._flexNode.removeChild(child._flexNode)
      }
      previousParent.children.splice(previousIndex, 1)
      updateSiblingIndices(previousParent, previousIndex)
      adjustFocusableAncestors(previousParent, -child._focusableCount)
    }
  }

  child.parent = parent
  child.destroyed = false
  let insertIndex = parent.children.length
  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx >= 0) {
      parent.children.splice(idx, 0, child)
      insertIndex = idx
      if (parent._flexNode && child._flexNode) {
        parent._flexNode.insertChild(child._flexNode, insertIndex)
        syncAllLayoutProps(child)
      }
      updateSiblingIndices(parent, insertIndex)
      adjustFocusableAncestors(parent, child._focusableCount)
      return
    }
  }
  parent.children.push(child)
  child._siblingIndex = insertIndex
  if (parent._flexNode && child._flexNode) {
    parent._flexNode.insertChild(child._flexNode, insertIndex)
    syncAllLayoutProps(child)
  }
  adjustFocusableAncestors(parent, child._focusableCount)
}

/** @public */
export function removeChild(parent: TGENode, child: TGENode) {
  const idx = parent.children.indexOf(child)
  if (idx >= 0) {
    if (parent._flexNode && child._flexNode) {
      parent._flexNode.removeChild(child._flexNode)
    }
    parent.children.splice(idx, 1)
    updateSiblingIndices(parent, idx)
    adjustFocusableAncestors(parent, -child._focusableCount)
  }
  freeFlexSubtree(child)
  child.parent = null
  child.destroyed = true
}

function freeFlexSubtree(node: TGENode) {
  if (node._flexNode) {
    node._flexNode.free()
    node._flexNode = null
  }
  for (const child of node.children) freeFlexSubtree(child)
}

function updateSiblingIndices(parent: TGENode, start: number) {
  for (let i = start; i < parent.children.length; i++) {
    parent.children[i]._siblingIndex = i
  }
}

export function adjustFocusableAncestors(node: TGENode | null, delta: number) {
  if (delta === 0) return
  let current = node
  while (current) {
    current._focusableCount = Math.max(0, current._focusableCount + delta)
    current = current.parent
  }
}

// ── Color parsing ──

const _colorCache = new Map<string, number>()

/** @public */
export function parseColor(value: string | number | undefined): number {
  if (value === undefined) return 0
  if (typeof value === "number") return value >>> 0
  const cached = _colorCache.get(value)
  if (cached !== undefined) return cached
  // "#rrggbb" or "#rrggbbaa"
  const hex = value.startsWith("#") ? value.slice(1) : value
  const result = hex.length === 6
    ? (parseInt(hex, 16) << 8 | 0xff) >>> 0
    : hex.length === 8
      ? parseInt(hex, 16) >>> 0
      : 0
  _colorCache.set(value, result)
  return result
}

// ── Sizing parsing ──

/** @public */
export function parseSizing(value: number | string | undefined): SizingInfo | null {
  if (value === undefined) return null
  if (typeof value === "number") return { type: SIZING.FIXED, value }
  if (value === "fit") return { type: SIZING.FIT, value: 0 }
  if (value === "grow") return { type: SIZING.GROW, value: 0 }
  if (value.endsWith("%")) {
    const pct = parseFloat(value) / 100
    return { type: SIZING.PERCENT, value: pct }
  }
  return { type: SIZING.FIT, value: 0 }
}

/** @public */
export function parseDirection(value: string | undefined): number {
  if (value === "row") return DIRECTION.LEFT_TO_RIGHT
  return DIRECTION.TOP_TO_BOTTOM
}

/** @public */
export function parseAlignX(value: string | undefined): number {
  if (value === "right" || value === "flex-end") return ALIGN_X.RIGHT
  if (value === "center") return ALIGN_X.CENTER
  if (value === "space-between") return ALIGN_X.SPACE_BETWEEN
  return ALIGN_X.LEFT // "left", "flex-start", or default
}

/** @public */
export function parseAlignY(value: string | undefined): number {
  if (value === "bottom" || value === "flex-end") return ALIGN_Y.BOTTOM
  if (value === "center") return ALIGN_Y.CENTER
  if (value === "space-between") return ALIGN_Y.SPACE_BETWEEN
  return ALIGN_Y.TOP // "top", "flex-start", or default
}
