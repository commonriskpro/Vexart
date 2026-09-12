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

import { releaseNodeImage } from "./native-image-assets"
import { Node, FLEX_DIRECTION_COLUMN } from "flexily"
import { createTextFlexNode, syncAllLayoutProps } from "./flex-sync"
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
  SizingUnit,
  SizingKeyword,
  SizingPercent,
  SizingPx,
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
  SizingUnit,
  SizingKeyword,
  SizingPercent,
  SizingPx,
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
export type ClassNameResolver = (className: string) => Partial<TGEProps>

let globalClassNameResolver: ClassNameResolver | null = null
export function setClassNameResolver(resolver: ClassNameResolver | null) {
  globalClassNameResolver = resolver
}
export function getClassNameResolver(): ClassNameResolver | null {
  return globalClassNameResolver
}

let currentThemeEpoch = 0
export function bumpThemeEpoch() {
  currentThemeEpoch++
}
export function getThemeEpoch(): number {
  return currentThemeEpoch
}

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
    _canvasExtra: kind === "canvas" ? { displayListCommands: null, displayListHash: null, drawCacheKey: null } : null,
    _widthSizing: null,
    _heightSizing: null,
    _transform: null,
    _transformInverse: null,
    _accTransform: null,
    _accTransformInverse: null,
    _interactionMode: "none",
    _vp: null,
    _vpDirty: true,
    _vpEpoch: 0,
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
    _dirtyTracker: null,
  }
}

export function ensureImageExtra(node: TGENode): NodeImageExtra {
  if (!node._imageExtra) node._imageExtra = { buffer: null, state: "idle", nativeHandle: null }
  return node._imageExtra
}

export function ensureCanvasExtra(node: TGENode): NodeCanvasExtra {
  if (!node._canvasExtra) node._canvasExtra = { displayListCommands: null, displayListHash: null, drawCacheKey: null }
  return node._canvasExtra
}

function mergeInteractive(a?: InteractiveStyleProps, b?: InteractiveStyleProps): InteractiveStyleProps | undefined {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a
  return { ...a, ...b }
}

/**
 * Resolve effective props:
 *   1. Cache check: node._vp && !node._vpDirty && node._vpEpoch === currentThemeEpoch
 *   2. Merge className via globalClassNameResolver
 *   3. Merge style prop (direct props override style)
 *   4. Deep-merge hoverStyle/activeStyle/focusStyle
 *   5. Resolve aliases: borderRadius→cornerRadius, boxShadow→shadow, onClick→onPress
 *   6. Merge interactive states when active
 */
/** @public */
export function resolveProps(node: TGENode): TGEProps {
  if (node._vp && !node._vpDirty && node._vpEpoch === currentThemeEpoch) return node._vp
  let base = node.props

  if (base.className && globalClassNameResolver) {
    const classProps = globalClassNameResolver(base.className)
    base = {
      ...classProps,
      ...(base.style ?? {}),
      ...base,
      hoverStyle: mergeInteractive(mergeInteractive(classProps.hoverStyle, base.style?.hoverStyle), base.hoverStyle),
      focusStyle: mergeInteractive(mergeInteractive(classProps.focusStyle, base.style?.focusStyle), base.focusStyle),
      activeStyle: mergeInteractive(mergeInteractive(classProps.activeStyle, base.style?.activeStyle), base.activeStyle),
    }
  } else if (base.style) {
    base = {
      ...base.style,
      ...base,
      hoverStyle: mergeInteractive(base.style.hoverStyle, base.hoverStyle),
      focusStyle: mergeInteractive(base.style.focusStyle, base.focusStyle),
      activeStyle: mergeInteractive(base.style.activeStyle, base.activeStyle),
    }
  }

  // Resolve aliases
  if (base.borderRadius !== undefined && base.cornerRadius === undefined) {
    base = { ...base, cornerRadius: base.borderRadius }
  }
  if (base.boxShadow !== undefined && base.shadow === undefined) {
    base = { ...base, shadow: base.boxShadow }
  }
  if (base.onClick !== undefined && base.onPress === undefined) {
    base = { ...base, onPress: base.onClick }
  }

  // Merge interactive states
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
  if (resolved.borderRadius !== undefined && resolved.cornerRadius === undefined) {
    resolved = { ...resolved, cornerRadius: resolved.borderRadius }
  }
  if (resolved.boxShadow !== undefined && resolved.shadow === undefined) {
    resolved = { ...resolved, shadow: resolved.boxShadow }
  }

  node._vp = resolved
  node._vpDirty = false
  node._vpEpoch = currentThemeEpoch
  return resolved
}

export function createTextNode(text: string): TGENode {
  const node = createNode("text")
  node.text = text
  return node
}

/**
 * Return the latest Grid calculation error for a node, if its retained node
 * is still using the Grid profile.  Keeping this read at the TGE boundary
 * lets layout writeback reject an invalid calculation without reaching into
 * Flexily's private state or treating a stale Flex result as a Grid error.
 */
export function getGridLayoutError(node: TGENode) {
  const flex = node._flexNode
  if (!flex?.isGridMode()) return null
  return flex.getGridResult()?.error ?? null
}

/**
 * Materialize the retained Flexily subtree after a detached TGE subtree is
 * inserted again.  `removeChild` releases the native nodes recursively, but
 * the TGE nodes are intentionally reusable (Solid may move a node before it
 * is finally disposed).  Do this before linking the root into its new
 * parent, so text-node materialization cannot accidentally attach to the old
 * native parent.
 */
function ensureFlexSubtree(node: TGENode): void {
  let recreated = false
  if (!node._flexNode) {
    if (node.kind === "text") {
      // Keep the existing lazy text path for a newly-created node. A text
      // node needs recreation here only when it was previously materialized
      // and released by removeChild.
      if (node.destroyed) {
        recreated = true
        createTextFlexNode(node)
      }
    } else {
      recreated = true
      const flex = Node.create()
      flex.setFlexDirection(FLEX_DIRECTION_COLUMN)
      node._flexNode = flex
    }
  }

  const parentFlex = node._flexNode
  if (!parentFlex) return
  for (const child of node.children) {
    ensureFlexSubtree(child)
    const childFlex = child._flexNode
    if (!childFlex || childFlex.getParent() === parentFlex) continue
    parentFlex.insertChild(childFlex, child._siblingIndex)
  }

  // Re-apply the complete snapshot after recreation.  This includes Grid
  // item placement, which depends on the current TGE parent profile.
  syncAllLayoutProps(node)
  // flex-sync caches item snapshots by TGE node. A removed node gets a new
  // native Node, so restore the current item snapshot on that new instance
  // instead of allowing the cache to skip the first write.
  if (recreated) restoreGridItemStyle(node)
}

function setSubtreeDestroyed(node: TGENode, destroyed: boolean): void {
  node.destroyed = destroyed
  if (destroyed) releaseNodeImage(node)
  for (const child of node.children) setSubtreeDestroyed(child, destroyed)
}

function restoreGridItemStyle(node: TGENode): void {
  const flex = node._flexNode as (Node & { setGridItemStyle?: (style: unknown) => void }) | null
  if (!flex?.setGridItemStyle) return
  const props = node.props
  const item = {
    ...(props.gridRow === undefined ? {} : { row: props.gridRow }),
    ...(props.gridColumn === undefined ? {} : { column: props.gridColumn }),
    ...(props.gridArea === undefined ? {} : { area: props.gridArea }),
    ...(props.justifySelf === undefined ? {} : { justifySelf: props.justifySelf }),
    ...(props.alignSelf === undefined ? {} : { alignSelf: props.alignSelf }),
  }
  if (Object.keys(item).length > 0) flex.setGridItemStyle(item)
}

function detachChild(parent: TGENode, child: TGENode): boolean {
  // A remove call for a stale/wrong parent must not free a live node.  This is
  // especially important while Solid is moving Grid items between parents.
  if (child.parent !== parent) return false
  const index = parent.children.indexOf(child)
  if (index < 0) return false

  const childFlex = child._flexNode
  const nativeParent = childFlex?.getParent()
  if (nativeParent && childFlex) nativeParent.removeChild(childFlex)
  parent.children.splice(index, 1)
  updateSiblingIndices(parent, index)
  adjustFocusableAncestors(parent, -child._focusableCount)
  child.parent = null
  child._siblingIndex = 0
  return true
}

function assertCanInsert(parent: TGENode, child: TGENode): void {
  if (parent === child) throw new Error("Cannot insert a node as a child of itself")
  let ancestor: TGENode | null = parent
  while (ancestor) {
    if (ancestor === child) {
      throw new Error("Cannot insert an ancestor as a child (would create a cycle)")
    }
    ancestor = ancestor.parent
  }
}

function insertFlexChild(parent: TGENode, child: TGENode, index: number): void {
  const parentFlex = parent._flexNode
  const childFlex = child._flexNode
  if (!parentFlex || !childFlex) return
  const nativeParent = childFlex.getParent()
  if (nativeParent && nativeParent !== parentFlex) nativeParent.removeChild(childFlex)
  parentFlex.insertChild(childFlex, index)
  syncAllLayoutProps(child)
}

/** @public */
export function insertChild(parent: TGENode, child: TGENode, anchor?: TGENode) {
  assertCanInsert(parent, child)
  if (child.parent === parent && anchor === child) return

  const previousParent = child.parent
  if (previousParent) {
    // Reparenting is a move, not a destruction.  Detach the old TGE/native
    // edge first; this leaves no stale parent while the new edge is built.
    if (!detachChild(previousParent, child)) child.parent = null
  }

  // A subtree removed earlier has no retained Flexily nodes.  Recreate the
  // complete subtree before linking it to the destination parent.
  ensureFlexSubtree(child)
  child.parent = parent
  child.destroyed = false
  let insertIndex = parent.children.length
  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx >= 0) {
      parent.children.splice(idx, 0, child)
      insertIndex = idx
      insertFlexChild(parent, child, insertIndex)
      updateSiblingIndices(parent, insertIndex)
      adjustFocusableAncestors(parent, child._focusableCount)
      setSubtreeDestroyed(child, false)
      syncAllLayoutProps(parent)
      return
    }
  }
  parent.children.push(child)
  child._siblingIndex = insertIndex
  insertFlexChild(parent, child, insertIndex)
  adjustFocusableAncestors(parent, child._focusableCount)
  setSubtreeDestroyed(child, false)
  syncAllLayoutProps(parent)
}

/** @public */
export function removeChild(parent: TGENode, child: TGENode) {
  if (!detachChild(parent, child)) return
  freeFlexSubtree(child)
  setSubtreeDestroyed(child, true)
  syncAllLayoutProps(parent)
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

const MAX_COLOR_CACHE_SIZE = 512
const _colorCache = new Map<string, number>()

export function getColorCacheSize(): number {
  return _colorCache.size
}

export function clearColorCache(): void {
  _colorCache.clear()
}

/** @public */
export function parseColor(value: string | number | undefined): number {
  if (value === undefined) return 0
  if (typeof value === "number") return value >>> 0
  const cached = _colorCache.get(value)
  if (cached !== undefined) {
    _colorCache.delete(value)
    _colorCache.set(value, cached)
    return cached
  }
  // "#rgb", "#rgba", "#rrggbb", or "#rrggbbaa" (with or without #)
  const hex = value.startsWith("#") ? value.slice(1) : value
  let result = 0
  if (hex.length === 3) {
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0], 16) * 17
      const g = parseInt(hex[1], 16) * 17
      const b = parseInt(hex[2], 16) * 17
      result = ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0
    }
  } else if (hex.length === 4) {
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      const r = parseInt(hex[0], 16) * 17
      const g = parseInt(hex[1], 16) * 17
      const b = parseInt(hex[2], 16) * 17
      const a = parseInt(hex[3], 16) * 17
      result = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
    }
  } else if (hex.length === 6) {
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      result = ((parseInt(hex, 16) << 8) | 0xff) >>> 0
    }
  } else if (hex.length === 8) {
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      result = (parseInt(hex, 16)) >>> 0
    }
  }
  if (_colorCache.size >= MAX_COLOR_CACHE_SIZE) {
    const oldest = _colorCache.keys().next().value
    if (oldest !== undefined) _colorCache.delete(oldest)
  }
  _colorCache.set(value, result)
  return result
}

// ── Sizing parsing ──

/** @public */
export function parseSizing(value: number | string | undefined | null): SizingInfo | null {
  if (value === undefined || value === null) return null
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null
    return { type: SIZING.FIXED, value }
  }
  if (typeof value !== "string") return null
  if (value === "fit" || value === "auto") return { type: SIZING.FIT, value: 0 }
  if (value === "grow" || value === "fill") return { type: SIZING.GROW, value: 0 }
  if (value.endsWith("%")) {
    const pct = parseFloat(value) / 100
    if (!Number.isNaN(pct)) return { type: SIZING.PERCENT, value: pct }
    return null
  }
  if (value.endsWith("px")) {
    const px = parseFloat(value)
    if (!Number.isNaN(px)) return { type: SIZING.FIXED, value: px }
    return null
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[Vexart] Warning: Unrecognized sizing value "${value}". Expected number, "fit", "grow", "auto", "fill", percentage (e.g. "100%"), or pixel string (e.g. "200px"). Falling back to "fit".`)
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
