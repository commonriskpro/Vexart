/**
 * Flexily Node
 *
 * Yoga-compatible Node class for flexbox layout.
 */

import * as C from "./constants.js"
import { computeLayout, countNodes, markSubtreeLayoutSeen } from "./layout-zero.js"
import { layoutGridNode } from "./grid/grid-layout.js"
import {
  type BaselineFunc,
  type FlexInfo,
  type Layout,
  type LayoutCacheEntry,
  type MeasureEntry,
  type MeasureFunc,
} from "./types.js"
import { log } from "./logger.js"
import { getTrace } from "./trace.js"
import type {
  GridCalculateResult,
  GridIntrinsicContribution,
  GridIntrinsicMeasureFunc,
  GridItemStyle,
  GridLayoutError,
  GridStyle,
} from "./grid/grid-model.js"
import type { GridIntrinsicCycleCache } from "./grid/grid-intrinsic-cycle.js"
import { NodeStyle } from "./node-zero-style.js"
import {
  insertChildNode,
  removeChildNode,
  freeNode,
  freeRecursiveNode,
  resetNode,
  refreshGridDescendant,
  captureGridState,
  restoreGridState,
  resetLayoutCacheTree,
  findGridDescendantError,
} from "./node-zero-tree.js"

/**
 * A layout node in the flexbox tree.
 */
export class Node extends NodeStyle {
  // Tree structure
  _parent: Node | null = null
  _children: Node[] = []
  _hasGridDescendant = false

  // Optional Grid mode state. Grid remains an internal extension of the same
  // Node tree; Flex nodes keep their original style and cache behaviour.
  _layoutMode: "flex" | "grid" = "flex"
  // Keep the hot layout dispatcher on a direct, stable bit. The method form
  // remains for callers, while layout-zero avoids a call for every Flex node.
  _gridMode = false
  _gridStyle: GridStyle | null = null
  _gridItemStyle: GridItemStyle = {}
  _gridIntrinsicMeasureFunc: GridIntrinsicMeasureFunc | null = null
  _gridRevision = 0
  _gridIntrinsicCache: GridIntrinsicCycleCache | undefined
  _gridContributions: readonly GridIntrinsicContribution[] = []
  _gridResult: GridCalculateResult | null = null
  _gridError: GridLayoutError | null = null
  // A bridge-level validation error is kept separate from the solver's
  // transient error. The Grid dispatcher consumes it before any stage can
  // publish geometry, while ordinary solver success may still clear
  // _gridError as before.
  _gridValidationError: GridLayoutError | null = null
  private static _nextGridNodeId = 1
  private readonly _gridNodeId = Node._nextGridNodeId++

  // Measure function for intrinsic sizing
  _measureFunc: MeasureFunc | null = null

  // Baseline function for baseline alignment
  _baselineFunc: BaselineFunc | null = null

  // Measure cache - 4-entry numeric cache (faster than Map<string,...>)
  // Each entry stores: w, wm, h, hm, rw, rh
  // Cleared when markDirty() is called since content may have changed
  _m0?: MeasureEntry
  _m1?: MeasureEntry
  _m2?: MeasureEntry
  _m3?: MeasureEntry

  // Layout cache - 2-entry cache for sizing pass (availW, availH -> computedW, computedH)
  // Cleared at start of each calculateLayout pass via resetLayoutCache()
  // This avoids redundant recursive layout calls during intrinsic sizing
  _lc0?: LayoutCacheEntry
  _lc1?: LayoutCacheEntry

  // Stable result objects for zero-allocation cache returns
  // These are mutated in place instead of creating new objects on each cache hit
  _measureResult: { width: number; height: number } = {
    width: 0,
    height: 0,
  }
  _layoutResult: { width: number; height: number } = {
    width: 0,
    height: 0,
  }

  // Static counters for cache statistics (reset per layout pass)
  static measureCalls = 0
  static measureCacheHits = 0

  /** Reset measure statistics (call before calculateLayout). */
  static resetMeasureStats(): void {
    Node.measureCalls = 0
    Node.measureCacheHits = 0
  }

  // Computed layout
  _layout: Layout = { left: 0, top: 0, width: 0, height: 0 }

  // Per-node flex calculation state (reused across layout passes to avoid allocation)
  _flex: FlexInfo = {
    mainSize: 0,
    baseSize: 0,
    mainMargin: 0,
    flexGrow: 0,
    flexShrink: 0,
    minMain: 0,
    maxMain: Infinity,
    mainStartMarginAuto: false,
    mainEndMarginAuto: false,
    mainStartMarginValue: 0,
    mainEndMarginValue: 0,
    marginL: 0,
    marginT: 0,
    marginR: 0,
    marginB: 0,
    frozen: false,
    lineIndex: 0,
    relativeIndex: -1,
    baseline: 0,
    lastAvailW: NaN,
    lastAvailH: NaN,
    lastOffsetX: NaN,
    lastOffsetY: NaN,
    lastAbsX: NaN,
    lastAbsY: NaN,
    layoutValid: false,
    lastDir: 0,
  }

  // Dirty flags
  _isDirty = true
  _hasNewLayout = false

  // Last calculateLayout() inputs (for constraint-aware skip)
  _lastCalcW: number = NaN
  _lastCalcH: number = NaN
  _lastCalcDir: number = 0

  // ============================================================================
  // Static Factory
  // ============================================================================

  /** Create a new layout node. */
  static create(): Node {
    return new Node()
  }

  // ============================================================================
  // Tree Operations
  // ============================================================================

  /** Get the number of child nodes. */
  getChildCount(): number {
    return this._children.length
  }

  /** Get a child node by index. */
  getChild(index: number): Node | undefined {
    return this._children[index]
  }

  /** Get the parent node. */
  getParent(): Node | null {
    return this._parent
  }

  /** Insert a child node at the specified index. */
  insertChild(child: Node, index: number): void {
    insertChildNode(this, child, index)
    this.markDirty()
  }

  /** Remove a child node from this node. */
  removeChild(child: Node): void {
    if (removeChildNode(this, child)) {
      this.markDirty()
    }
  }

  /** Free this node and clean up references. */
  free(): void {
    freeNode(this)
    this._measureFunc = null
    this._baselineFunc = null
  }

  /** Reset this node to a clean initial state for reuse. */
  reset(): void {
    resetNode(this)
  }

  /** Free this node and all descendants recursively. */
  freeRecursive(): void {
    freeRecursiveNode(this)
  }

  /** Dispose the node (calls free). */
  [Symbol.dispose](): void {
    this.free()
  }

  // ============================================================================
  // Measure / Baseline Callbacks
  // ============================================================================

  /** Set a measure function for intrinsic sizing. */
  setMeasureFunc(measureFunc: MeasureFunc): void {
    this._measureFunc = measureFunc
    this.markDirty()
  }

  /** Remove the measure function from this node. */
  unsetMeasureFunc(): void {
    this._measureFunc = null
    this.markDirty()
  }

  /** Check if this node has a measure function. */
  hasMeasureFunc(): boolean {
    return this._measureFunc !== null
  }

  /** Set a baseline function to determine where this node's text baseline is. */
  setBaselineFunc(baselineFunc: BaselineFunc): void {
    this._baselineFunc = baselineFunc
    this.markDirty()
  }

  /** Remove the baseline function from this node. */
  unsetBaselineFunc(): void {
    this._baselineFunc = null
    this.markDirty()
  }

  /** Check if this node has a baseline function. */
  hasBaselineFunc(): boolean {
    return this._baselineFunc !== null
  }

  // ============================================================================
  // Layout Mode & Grid Configuration
  // ============================================================================

  /** Select Grid or the default Flex layout algorithm for this Node. */
  setLayoutMode(mode: "flex" | "grid"): void {
    if (mode !== "flex" && mode !== "grid") throw new Error(`Invalid layout mode: ${String(mode)}`)
    if (this._layoutMode === mode) return
    this._layoutMode = mode
    this._gridMode = mode === "grid"
    if (this._parent) refreshGridDescendant(this._parent)
    this.markDirty()
  }

  getLayoutMode(): "flex" | "grid" {
    return this._layoutMode
  }

  isGridMode(): boolean {
    return this._gridMode
  }

  hasGridDescendant(): boolean {
    return this._hasGridDescendant
  }

  setGridStyle(style: GridStyle): void {
    this._gridStyle = style
    this._gridRevision++
    this.markDirty()
  }

  setGridItemStyle(style: GridItemStyle): void {
    this._gridItemStyle = style ?? {}
    this.markDirty()
  }

  setGridItem(style: GridItemStyle): void {
    this.setGridItemStyle(style)
  }

  setIntrinsicMeasureFunc(measureFunc: GridIntrinsicMeasureFunc | null): void {
    this._gridIntrinsicMeasureFunc = measureFunc
    this.markDirty()
  }

  // ============================================================================
  // Caching
  // ============================================================================

  /** Call the measure function with caching. */
  cachedMeasure(w: number, wm: number, h: number, hm: number): { width: number; height: number } | null {
    if (!this._measureFunc) return null
    Node.measureCalls++
    const m0 = this._m0
    if (m0 && m0.w === w && m0.wm === wm && m0.h === h && m0.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m0.rw
      this._measureResult.height = m0.rh
      getTrace()?.measureCacheHit(0, w, h, m0.rw, m0.rh)
      return this._measureResult
    }
    const m1 = this._m1
    if (m1 && m1.w === w && m1.wm === wm && m1.h === h && m1.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m1.rw
      this._measureResult.height = m1.rh
      getTrace()?.measureCacheHit(0, w, h, m1.rw, m1.rh)
      return this._measureResult
    }
    const m2 = this._m2
    if (m2 && m2.w === w && m2.wm === wm && m2.h === h && m2.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m2.rw
      this._measureResult.height = m2.rh
      getTrace()?.measureCacheHit(0, w, h, m2.rw, m2.rh)
      return this._measureResult
    }
    const m3 = this._m3
    if (m3 && m3.w === w && m3.wm === wm && m3.h === h && m3.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m3.rw
      this._measureResult.height = m3.rh
      getTrace()?.measureCacheHit(0, w, h, m3.rw, m3.rh)
      return this._measureResult
    }

    getTrace()?.measureCacheMiss(0, w, h)
    const result = this._measureFunc(w, wm, h, hm)

    if (this._m2) {
      if (!this._m3) this._m3 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
      this._m3.w = this._m2.w
      this._m3.wm = this._m2.wm
      this._m3.h = this._m2.h
      this._m3.hm = this._m2.hm
      this._m3.rw = this._m2.rw
      this._m3.rh = this._m2.rh
    }
    if (this._m1) {
      if (!this._m2) this._m2 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
      this._m2.w = this._m1.w
      this._m2.wm = this._m1.wm
      this._m2.h = this._m1.h
      this._m2.hm = this._m1.hm
      this._m2.rw = this._m1.rw
      this._m2.rh = this._m1.rh
    }
    if (this._m0) {
      if (!this._m1) this._m1 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
      this._m1.w = this._m0.w
      this._m1.wm = this._m0.wm
      this._m1.h = this._m0.h
      this._m1.hm = this._m0.hm
      this._m1.rw = this._m0.rw
      this._m1.rh = this._m0.rh
    }
    if (!this._m0) this._m0 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
    this._m0.w = w
    this._m0.wm = wm
    this._m0.h = h
    this._m0.hm = hm
    this._m0.rw = result.width
    this._m0.rh = result.height

    this._measureResult.width = result.width
    this._measureResult.height = result.height
    return this._measureResult
  }

  /** Check layout cache for a previously computed size with same available dimensions. */
  getCachedLayout(availW: number, availH: number): { width: number; height: number } | null {
    if (this._isDirty) return null
    const lc0 = this._lc0
    if (lc0 && Object.is(lc0.availW, availW) && Object.is(lc0.availH, availH)) {
      this._layoutResult.width = lc0.computedW
      this._layoutResult.height = lc0.computedH
      return this._layoutResult
    }
    const lc1 = this._lc1
    if (lc1 && Object.is(lc1.availW, availW) && Object.is(lc1.availH, availH)) {
      this._layoutResult.width = lc1.computedW
      this._layoutResult.height = lc1.computedH
      return this._layoutResult
    }
    return null
  }

  /** Cache a computed layout result for the given available dimensions. */
  setCachedLayout(availW: number, availH: number, computedW: number, computedH: number): void {
    if (this._lc0) {
      if (!this._lc1) {
        this._lc1 = { availW: NaN, availH: NaN, computedW: 0, computedH: 0 }
      }
      this._lc1.availW = this._lc0.availW
      this._lc1.availH = this._lc0.availH
      this._lc1.computedW = this._lc0.computedW
      this._lc1.computedH = this._lc0.computedH
    }
    if (!this._lc0) {
      this._lc0 = { availW: 0, availH: 0, computedW: 0, computedH: 0 }
    }
    this._lc0.availW = availW
    this._lc0.availH = availH
    this._lc0.computedW = computedW
    this._lc0.computedH = computedH
  }

  /** Clear layout cache for this node and all descendants. */
  resetLayoutCache(): void {
    resetLayoutCacheTree(this)
  }

  // ============================================================================
  // Dirty Tracking
  // ============================================================================

  /** Check if this node needs layout recalculation. */
  isDirty(): boolean {
    return this._isDirty
  }

  /** Mark this node and all ancestors as dirty. */
  markDirty(): void {
    let current: Node | null = this
    while (current !== null) {
      current._m0 = current._m1 = current._m2 = current._m3 = undefined
      current._lc0 = current._lc1 = undefined
      current._gridIntrinsicCache = undefined
      current._gridError = null
      if (current._isDirty) break
      current._isDirty = true
      current._flex.layoutValid = false
      current = current._parent
    }
  }

  /** Check if this node has new layout results since the last check. */
  hasNewLayout(): boolean {
    return this._hasNewLayout
  }

  /** Mark that the current layout has been seen/processed. */
  markLayoutSeen(): void {
    this._hasNewLayout = false
  }

  // ============================================================================
  // Layout Calculation
  // ============================================================================

  /** Calculate layout for this node and all descendants. */
  calculateLayout(width?: number, height?: number, direction: number = C.DIRECTION_LTR): void | GridCalculateResult {
    const availableWidth = width ?? NaN
    const availableHeight = height ?? NaN

    if (
      !this._isDirty &&
      Object.is(this._lastCalcW, availableWidth) &&
      Object.is(this._lastCalcH, availableHeight) &&
      this._lastCalcDir === direction
    ) {
      log.debug?.("layout skip (not dirty, constraints unchanged)")
      if (this._gridMode) {
        return layoutGridNode(this, availableWidth, availableHeight, 0, 0, 0, 0, direction)
      }
      return
    }

    this._lastCalcW = availableWidth
    this._lastCalcH = availableHeight
    this._lastCalcDir = direction

    const start = log.debug ? Date.now() : 0
    const nodeCount = log.debug ? countNodes(this) : 0

    Node.resetMeasureStats()

    const transaction = this._hasGridDescendant ? captureGridState(this) : undefined

    const result = computeLayout(this, availableWidth, availableHeight, direction)

    if (result?.error) {
      if (transaction) restoreGridState(transaction)
      this._gridResult = result
      return result
    }

    this._isDirty = false
    this._hasNewLayout = true
    markSubtreeLayoutSeen(this)

    log.debug?.(
      "layout: %dx%d, %d nodes in %dms (measure: calls=%d hits=%d)",
      width,
      height,
      nodeCount,
      Date.now() - start,
      Node.measureCalls,
      Node.measureCacheHits,
    )
    return result ?? undefined
  }

  // ============================================================================
  // Layout Results
  // ============================================================================

  /** Get the computed left position after layout. */
  getComputedLeft(): number {
    return this._layout.left
  }

  /** Get the computed top position after layout. */
  getComputedTop(): number {
    return this._layout.top
  }

  /** Get the computed width after layout. */
  getComputedWidth(): number {
    return this._layout.width
  }

  /** Get the computed height after layout. */
  getComputedHeight(): number {
    return this._layout.height
  }

  /** Get the computed right edge position after layout (left + width). */
  getComputedRight(): number {
    return this._layout.left + this._layout.width
  }

  /** Get the computed bottom edge position after layout (top + height). */
  getComputedBottom(): number {
    return this._layout.top + this._layout.height
  }

  // ============================================================================
  // Internal Accessors (for layout algorithm)
  // ============================================================================

  get children(): readonly Node[] {
    return this._children
  }

  get layout(): Layout {
    return this._layout
  }

  get measureFunc(): MeasureFunc | null {
    return this._measureFunc
  }

  get baselineFunc(): BaselineFunc | null {
    return this._baselineFunc
  }

  get flex(): FlexInfo {
    return this._flex
  }

  getGridStyle(): GridStyle | null {
    return this._gridStyle
  }

  getGridItemStyle(): GridItemStyle {
    return this._gridItemStyle
  }

  getIntrinsicMeasureFunc(): GridIntrinsicMeasureFunc | null {
    return this._gridIntrinsicMeasureFunc
  }

  getGridRevision(): number {
    return this._gridRevision
  }

  getGridNodeId(): number {
    return this._gridNodeId
  }

  getGridIntrinsicCache(): GridIntrinsicCycleCache | undefined {
    return this._gridIntrinsicCache
  }

  setGridIntrinsicCache(cache: GridIntrinsicCycleCache): void {
    this._gridIntrinsicCache = cache
  }

  getGridContributions(): readonly GridIntrinsicContribution[] {
    return this._gridContributions
  }

  setGridContributions(contributions: readonly GridIntrinsicContribution[]): void {
    this._gridContributions = contributions
  }

  getGridResult(): GridCalculateResult | null {
    return this._gridResult
  }

  setGridResult(result: GridCalculateResult): void {
    this._gridResult = result
  }

  getGridError(): GridLayoutError | null {
    if (this._gridError) return this._gridError
    if (!this._hasGridDescendant) return null
    return findGridDescendantError(this)
  }

  setGridError(error: GridLayoutError | null): void {
    this._gridError = error
  }

  setGridValidationError(error: GridLayoutError | null): void {
    const prior = this._gridValidationError
    if (prior?.code === error?.code && prior?.path === error?.path && prior?.nodeId === error?.nodeId) return
    this._gridValidationError = error
    this.markDirty()
  }

  getGridValidationError(): GridLayoutError | null {
    return this._gridValidationError
  }
}
