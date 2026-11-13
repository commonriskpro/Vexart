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
import { Node, FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN, GUTTER_COLUMN, GUTTER_ROW, EDGE_ALL } from "flexily"
import { createTextFlexNode, isLayoutProp, isTextLayoutProp, syncAllLayoutProps } from "./flex-sync"
import { syncDirection, syncPadding, syncMargin, syncGap, syncAlign } from "./flex-sync-style"
import { useEngineContext, type EngineContext } from "../context"
import {
  acquireFlexNode,
  clearFlexNodePool,
  getFlexNodePoolSize,
  releaseFlexNode,
} from "./flex-pool"
import {
  ALIGN_X,
  ALIGN_Y,
  DIRECTION,
  INTERACTION_MODE,
  SIZING,
  TGE_NODE_KIND,
  clearColorCache,
  getClassNameResolver,
  getColorCacheSize,
  parseColor,
  resolveProps,
} from "./node-types"
import type {
  ClassNameResolver,
  CornerRadii,
  FilterConfig,
  GlowConfig,
  GradientConfig,
  InteractionMode,
  InteractiveStyleProps,
  LayoutRect,
  NodeCanvasExtra,
  NodeCompositorExtra,
  NodeImageExtra,
  NodeMouseEvent,
  NodeTransformExtra,
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
  bumpThemeEpoch,
  getClassNameResolver,
  getThemeEpoch,
  resolveProps,
  setClassNameResolver,
} from "./node-types"
export {
  acquireFlexNode,
  clearFlexNodePool,
  getFlexNodePoolSize,
  releaseFlexNode,
} from "./flex-pool"
export type {
  ClassNameResolver,
  CornerRadii,
  FilterConfig,
  GlowConfig,
  GradientConfig,
  InteractionMode,
  InteractiveStyleProps,
  LayoutRect,
  NodeCanvasExtra,
  NodeCompositorExtra,
  NodeImageExtra,
  NodeMouseEvent,
  NodeTransformExtra,
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

/** Retained scene graph node implementation with prototype accessors for lazy extras. */
export class TGENodeImpl implements TGENode {
  kind: TGENodeKind
  props: TGEProps = {}
  text: string = ""
  children: TGENode[] = []
  parent: TGENode | null = null
  id: number
  destroyed: boolean = false
  layout: LayoutRect = { x: 0, y: 0, width: 0, height: 0 }
  _flexNode: Node | null
  _hovered: boolean = false
  _active: boolean = false
  _focused: boolean = false
  _widthSizing: SizingInfo | null = null
  _heightSizing: SizingInfo | null = null
  _vp: TGEProps | null = null
  _vpDirty: boolean = true
  _vpEpoch: number = 0
  _siblingIndex: number = 0
  _focusableCount: number = 0
  _dfsIndex: number = 0
  _depth: number = 0
  _scrollContainerId: number = 0
  _layerKey: string | null = null

  declare _transforms?: NodeTransformExtra | null
  declare _compositor?: NodeCompositorExtra | null
  declare _imageExtra?: NodeImageExtra | null
  declare _canvasExtra?: NodeCanvasExtra | null
  declare _styleKeys?: Set<string>
  declare _classLayoutKeys?: Set<string>
  declare _defaultLayoutKeys?: Set<string>
  declare _prevLayoutKeys?: Set<string>
  declare _syncedClassName?: string
  declare _syncedDefaultStyle?: Partial<TGEProps>
  declare _dirtyTracker?: import("../reconciler/dirty").DirtyTracker | null
  declare _engineContext?: EngineContext | null
  declare _rawInteractionMode?: InteractionMode

  constructor(kind: TGENodeKind, flex: Node | null) {
    this.kind = kind
    this.id = nextNodeId++
    this._flexNode = flex
    const ctx = useEngineContext()
    if (ctx) this._engineContext = ctx
    if (kind === "img") {
      this._imageExtra = { buffer: null, state: "idle", nativeHandle: null }
    } else if (kind === "canvas") {
      this._canvasExtra = { displayListCommands: null, displayListHash: null, drawCacheKey: null }
    }
  }

  get _transform(): Float64Array | null {
    return this._transforms?.local ?? null
  }
  set _transform(val: Float64Array | null) {
    if (!this._transforms && val === null) return
    ensureTransformExtra(this).local = val
  }

  get _transformInverse(): Float64Array | null {
    return this._transforms?.localInverse ?? null
  }
  set _transformInverse(val: Float64Array | null) {
    if (!this._transforms && val === null) return
    ensureTransformExtra(this).localInverse = val
  }

  get _accTransform(): Float64Array | null {
    return this._transforms?.acc ?? null
  }
  set _accTransform(val: Float64Array | null) {
    if (!this._transforms && val === null) return
    ensureTransformExtra(this).acc = val
  }

  get _accTransformInverse(): Float64Array | null {
    return this._transforms?.accInverse ?? null
  }
  set _accTransformInverse(val: Float64Array | null) {
    if (!this._transforms && val === null) return
    ensureTransformExtra(this).accInverse = val
  }

  get _stableFrameCount(): number {
    return this._compositor?.stableFrames ?? 0
  }
  set _stableFrameCount(val: number) {
    if (!this._compositor && val === 0) return
    ensureCompositorExtra(this).stableFrames = val
  }

  get _unstableFrameCount(): number {
    return this._compositor?.unstableFrames ?? 0
  }
  set _unstableFrameCount(val: number) {
    if (!this._compositor && val === 0) return
    ensureCompositorExtra(this).unstableFrames = val
  }

  get _autoLayer(): boolean {
    return this._compositor?.autoLayer ?? false
  }
  set _autoLayer(val: boolean) {
    if (!this._compositor && !val) return
    ensureCompositorExtra(this).autoLayer = val
  }

  get _interactionMode(): InteractionMode {
    return this._rawInteractionMode ?? "none"
  }
  set _interactionMode(val: InteractionMode | undefined) {
    if (!val || val === "none") {
      delete this._rawInteractionMode
    } else {
      this._rawInteractionMode = val
    }
  }
}

/** @public */
export function createNode(kind: TGENodeKind): TGENode {
  const flex = kind === "text" ? null : acquireFlexNode()
  flex?.setFlexDirection(FLEX_DIRECTION_ROW)
  return new TGENodeImpl(kind, flex)
}

export function ensureTransformExtra(node: TGENode): NodeTransformExtra {
  if (!node._transforms) {
    node._transforms = {
      local: null,
      localInverse: null,
      acc: null,
      accInverse: null,
    }
  }
  return node._transforms
}

export function ensureCompositorExtra(node: TGENode): NodeCompositorExtra {
  if (!node._compositor) {
    node._compositor = {
      stableFrames: 0,
      unstableFrames: 0,
      autoLayer: false,
    }
  }
  return node._compositor
}

export function ensureImageExtra(node: TGENode): NodeImageExtra {
  if (!node._imageExtra) node._imageExtra = { buffer: null, state: "idle", nativeHandle: null }
  return node._imageExtra
}

export function ensureCanvasExtra(node: TGENode): NodeCanvasExtra {
  if (!node._canvasExtra) node._canvasExtra = { displayListCommands: null, displayListHash: null, drawCacheKey: null }
  return node._canvasExtra
}

function isMirrorableLayoutKey(key: string): boolean {
  if (key === "hoverStyle" || key === "activeStyle" || key === "focusStyle") return false
  return isLayoutProp(key) || isTextLayoutProp(key) || key === "rowGap" || key === "columnGap" || key === "focusable"
}

/** Sync Flexily properties handled outside the core flex-sync module (flexBasis, rowGap, columnGap). */
export function syncExtendedFlexProps(node: TGENode): void {
  const flex = node._flexNode
  if (!flex || node.kind === "text") return
  const props = resolveProps(node)

  const basis = props.flexBasis
  if (basis === undefined || basis === "auto") {
    flex.setFlexBasisAuto()
  } else if (typeof basis === "number") {
    if (Number.isFinite(basis)) flex.setFlexBasis(basis)
  } else if (typeof basis === "string") {
    if (basis.endsWith("%")) {
      const pct = parseFloat(basis)
      if (Number.isFinite(pct)) flex.setFlexBasisPercent(pct)
    } else if (basis.endsWith("px")) {
      const px = parseFloat(basis)
      if (Number.isFinite(px)) flex.setFlexBasis(px)
    } else {
      const parsed = Number(basis)
      if (Number.isFinite(parsed)) flex.setFlexBasis(parsed)
    }
  }

  if (props.layout !== "grid") {
    if (props.columnGap !== undefined || props.rowGap !== undefined) {
      flex.setGap(GUTTER_COLUMN, props.columnGap ?? props.gap ?? 0)
      flex.setGap(GUTTER_ROW, props.rowGap ?? props.gap ?? 0)
    }
  }
}

function resetFlexProperty(node: TGENode, flex: Node, key: string): void {
  const base = node.props
  switch (key) {
    case "width":
      if (base.width !== undefined) {
        node._widthSizing = parseSizing(base.width)
      } else {
        node._widthSizing = null
        flex.setWidthAuto()
      }
      break
    case "height":
      if (base.height !== undefined) {
        node._heightSizing = parseSizing(base.height)
      } else {
        node._heightSizing = null
        flex.setHeightAuto()
      }
      break
    case "padding":
    case "paddingLeft":
    case "paddingRight":
    case "paddingTop":
    case "paddingBottom":
    case "paddingX":
    case "paddingY":
      syncPadding(flex, base)
      break
    case "margin":
    case "marginLeft":
    case "marginRight":
    case "marginTop":
    case "marginBottom":
    case "marginX":
    case "marginY":
      syncMargin(flex, base)
      break
    case "gap":
      syncGap(flex, base.gap)
      break
    case "columnGap":
    case "rowGap":
      flex.setGap(GUTTER_COLUMN, base.columnGap ?? base.gap ?? 0)
      flex.setGap(GUTTER_ROW, base.rowGap ?? base.gap ?? 0)
      break
    case "direction":
    case "flexDirection":
      syncDirection(flex, base)
      break
    case "alignX":
    case "alignY":
    case "justifyContent":
    case "alignItems":
      syncAlign(flex, base)
      break
    case "flexGrow":
      flex.setFlexGrow(base.flexGrow ?? 0)
      break
    case "flexShrink":
      flex.setFlexShrink(base.flexShrink ?? 0)
      break
    case "flexBasis":
      if (base.flexBasis === undefined || base.flexBasis === "auto") {
        flex.setFlexBasisAuto()
      } else if (typeof base.flexBasis === "number") {
        flex.setFlexBasis(base.flexBasis)
      }
      break
  }
}

/**
 * Mirror resolved layout props from defaultStyle and className onto node.props
 * (without overriding style or explicit direct props) and synchronize Flexily.
 */
export function syncResolvedLayout(node: TGENode): void {
  const base = node.props as Record<string, unknown>
  const prevDefaultSynced = node._syncedDefaultStyle as Record<string, unknown> | undefined

  if (node._defaultLayoutKeys) {
    for (const key of node._defaultLayoutKeys) {
      if (!node._styleKeys?.has(key) && base[key] === prevDefaultSynced?.[key]) {
        delete base[key]
      }
    }
  }
  if (node._classLayoutKeys) {
    for (const key of node._classLayoutKeys) {
      if (!node._styleKeys?.has(key)) {
        delete base[key]
      }
    }
  }

  node._vpDirty = true
  const resolved = resolveProps(node) as Record<string, unknown>
  const resolver = getClassNameResolver()
  const classProps = base.className && resolver
    ? (resolver(base.className as string) as Record<string, unknown>)
    : undefined
  const defaultProps = base.defaultStyle as Record<string, unknown> | undefined

  const nextClassKeys = new Set<string>()
  const nextDefaultKeys = new Set<string>()

  for (const key of Object.keys(resolved)) {
    if (!isMirrorableLayoutKey(key)) continue
    if (base[key] !== undefined && !base.classOverride) continue
    const val = resolved[key]
    if (val === undefined) continue
    if (resolved.layout === "grid" && (key === "direction" || key === "alignX" || key === "alignY") && classProps?.[key] === undefined) {
      continue
    }
    if (!base.classOverride) {
      base[key] = val
    }
    if (classProps && classProps[key] !== undefined) {
      nextClassKeys.add(key)
    } else if (defaultProps && defaultProps[key] !== undefined) {
      nextDefaultKeys.add(key)
    }
  }

  node._classLayoutKeys = nextClassKeys.size > 0 ? nextClassKeys : undefined
  node._defaultLayoutKeys = nextDefaultKeys.size > 0 ? nextDefaultKeys : undefined
  node._syncedClassName = base.className as string | undefined
  node._syncedDefaultStyle = base.defaultStyle as Partial<TGEProps> | undefined

  const flex = node._flexNode
  const currentLayoutKeys = new Set<string>()
  for (const key of Object.keys(resolved)) {
    if (isLayoutProp(key) && resolved[key] !== undefined) {
      currentLayoutKeys.add(key)
    }
  }

  if (flex && node._prevLayoutKeys && node.kind !== "text") {
    for (const prevKey of node._prevLayoutKeys) {
      if (!currentLayoutKeys.has(prevKey)) {
        resetFlexProperty(node, flex, prevKey)
      }
    }
  }
  node._prevLayoutKeys = currentLayoutKeys

  node._widthSizing = parseSizing(resolved.width as number | string | undefined)
  node._heightSizing = parseSizing(resolved.height as number | string | undefined)
  node._vpDirty = true

  syncAllLayoutProps(node)
  syncExtendedFlexProps(node)

  // Ensure interactive border widths introduced via className/defaultStyle reserve space in Flexily
  if (flex && node.kind !== "text") {
    const rProps = resolved as TGEProps
    const maxInteractiveBw = Math.max(
      rProps.focusStyle?.borderWidth ?? 0,
      rProps.hoverStyle?.borderWidth ?? 0,
      rProps.activeStyle?.borderWidth ?? 0,
    )
    if (maxInteractiveBw > (rProps.borderWidth ?? 0) && rProps.borderLeft === undefined && rProps.borderRight === undefined && rProps.borderTop === undefined && rProps.borderBottom === undefined) {
      flex.setBorder(EDGE_ALL, maxInteractiveBw)
    }
  }

  if (node.kind === "box") {
    for (const child of node.children) {
      if (child.kind === "text") child._flexNode?.markDirty()
    }
  }
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
      if (node.parent?.kind !== "text") {
        recreated = true
        createTextFlexNode(node)
      }
    } else {
      recreated = true
      const flex = acquireFlexNode()
      flex.setFlexDirection(FLEX_DIRECTION_ROW)
      node._flexNode = flex
    }
  }

  const parentFlex = node._flexNode
  if (!parentFlex) return
  if (node.kind === "text") {
    syncAllLayoutProps(node)
    return
  }
  for (const child of node.children) {
    ensureFlexSubtree(child)
    const childFlex = child._flexNode
    if (!childFlex || childFlex.getParent() === parentFlex) continue
    parentFlex.insertChild(childFlex, child._siblingIndex)
  }

  // Re-apply the complete snapshot after recreation.  This includes Grid
  // item placement, which depends on the current TGE parent profile.
  syncAllLayoutProps(node)
  syncExtendedFlexProps(node)
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
  if (parent.kind === "text") {
    parent._flexNode?.markDirty()
    return
  }
  if (child.kind === "text" && !child._flexNode) {
    createTextFlexNode(child)
  }
  const parentFlex = parent._flexNode
  const childFlex = child._flexNode
  if (!parentFlex || !childFlex) return
  const nativeParent = childFlex.getParent()
  if (nativeParent && nativeParent !== parentFlex) nativeParent.removeChild(childFlex)
  parentFlex.insertChild(childFlex, index)
  syncAllLayoutProps(child)
  syncExtendedFlexProps(child)
}

function propagateEngineContext(node: TGENode, ctx: EngineContext | null) {
  node._engineContext = ctx
  for (const child of node.children) {
    propagateEngineContext(child, ctx)
  }
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

  if (parent._engineContext && child._engineContext !== parent._engineContext) {
    propagateEngineContext(child, parent._engineContext)
  }

  if (parent.kind === "text") {
    child.parent = parent
    child.destroyed = false
    let insertIndex = parent.children.length
    if (anchor) {
      const idx = parent.children.indexOf(anchor)
      if (idx >= 0) {
        parent.children.splice(idx, 0, child)
        insertIndex = idx
        child._siblingIndex = insertIndex
        updateSiblingIndices(parent, insertIndex)
        adjustFocusableAncestors(parent, child._focusableCount)
        setSubtreeDestroyed(child, false)
        parent._flexNode?.markDirty()
        return
      }
    }
    parent.children.push(child)
    child._siblingIndex = insertIndex
    adjustFocusableAncestors(parent, child._focusableCount)
    setSubtreeDestroyed(child, false)
    parent._flexNode?.markDirty()
    return
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
      child._siblingIndex = insertIndex
      insertFlexChild(parent, child, insertIndex)
      updateSiblingIndices(parent, insertIndex)
      adjustFocusableAncestors(parent, child._focusableCount)
      setSubtreeDestroyed(child, false)
      syncAllLayoutProps(parent)
      syncExtendedFlexProps(parent)
      return
    }
  }
  parent.children.push(child)
  child._siblingIndex = insertIndex
  insertFlexChild(parent, child, insertIndex)
  adjustFocusableAncestors(parent, child._focusableCount)
  setSubtreeDestroyed(child, false)
  syncAllLayoutProps(parent)
  syncExtendedFlexProps(parent)
}

/** @public */
export function removeChild(parent: TGENode, child: TGENode) {
  if (!detachChild(parent, child)) return
  freeFlexSubtree(child)
  setSubtreeDestroyed(child, true)
  syncAllLayoutProps(parent)
  syncExtendedFlexProps(parent)
}

function freeFlexSubtree(node: TGENode) {
  if (node._flexNode) {
    releaseFlexNode(node._flexNode)
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

export { clearColorCache, getColorCacheSize, parseColor }

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
  if (value === "column") return DIRECTION.TOP_TO_BOTTOM
  return DIRECTION.LEFT_TO_RIGHT
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
