/**
 * Flexily Node
 *
 * Yoga-compatible Node class for flexbox layout.
 */
import { type BaselineFunc, type FlexInfo, type Layout, type LayoutCacheEntry, type MeasureEntry, type MeasureFunc } from "./types.js";
import type { GridCalculateResult, GridIntrinsicContribution, GridIntrinsicMeasureFunc, GridItemStyle, GridLayoutError, GridStyle } from "./grid/grid-model.js";
import type { GridIntrinsicCycleCache } from "./grid/grid-intrinsic-cycle.js";
import { NodeStyle } from "./node-zero-style.js";
/**
 * A layout node in the flexbox tree.
 */
export declare class Node extends NodeStyle {
    _parent: Node | null;
    _children: Node[];
    _hasGridDescendant: boolean;
    _layoutMode: "flex" | "grid";
    _gridMode: boolean;
    _gridStyle: GridStyle | null;
    _gridItemStyle: GridItemStyle;
    _gridIntrinsicMeasureFunc: GridIntrinsicMeasureFunc | null;
    _gridRevision: number;
    _gridIntrinsicCache: GridIntrinsicCycleCache | undefined;
    _gridContributions: readonly GridIntrinsicContribution[];
    _gridResult: GridCalculateResult | null;
    _gridError: GridLayoutError | null;
    _gridValidationError: GridLayoutError | null;
    private static _nextGridNodeId;
    private readonly _gridNodeId;
    _measureFunc: MeasureFunc | null;
    _baselineFunc: BaselineFunc | null;
    _m0?: MeasureEntry;
    _m1?: MeasureEntry;
    _m2?: MeasureEntry;
    _m3?: MeasureEntry;
    _lc0?: LayoutCacheEntry;
    _lc1?: LayoutCacheEntry;
    _measureResult: {
        width: number;
        height: number;
    };
    _layoutResult: {
        width: number;
        height: number;
    };
    static measureCalls: number;
    static measureCacheHits: number;
    /** Reset measure statistics (call before calculateLayout). */
    static resetMeasureStats(): void;
    _layout: Layout;
    _flex: FlexInfo;
    _isDirty: boolean;
    _hasNewLayout: boolean;
    _lastCalcW: number;
    _lastCalcH: number;
    _lastCalcDir: number;
    /** Create a new layout node. */
    static create(): Node;
    /** Get the number of child nodes. */
    getChildCount(): number;
    /** Get a child node by index. */
    getChild(index: number): Node | undefined;
    /** Get the parent node. */
    getParent(): Node | null;
    /** Insert a child node at the specified index. */
    insertChild(child: Node, index: number): void;
    /** Remove a child node from this node. */
    removeChild(child: Node): void;
    /** Free this node and clean up references. */
    free(): void;
    /** Reset this node to a clean initial state for reuse. */
    reset(): void;
    /** Free this node and all descendants recursively. */
    freeRecursive(): void;
    /** Dispose the node (calls free). */
    [Symbol.dispose](): void;
    /** Set a measure function for intrinsic sizing. */
    setMeasureFunc(measureFunc: MeasureFunc): void;
    /** Remove the measure function from this node. */
    unsetMeasureFunc(): void;
    /** Check if this node has a measure function. */
    hasMeasureFunc(): boolean;
    /** Set a baseline function to determine where this node's text baseline is. */
    setBaselineFunc(baselineFunc: BaselineFunc): void;
    /** Remove the baseline function from this node. */
    unsetBaselineFunc(): void;
    /** Check if this node has a baseline function. */
    hasBaselineFunc(): boolean;
    /** Select Grid or the default Flex layout algorithm for this Node. */
    setLayoutMode(mode: "flex" | "grid"): void;
    getLayoutMode(): "flex" | "grid";
    isGridMode(): boolean;
    hasGridDescendant(): boolean;
    setGridStyle(style: GridStyle): void;
    setGridItemStyle(style: GridItemStyle): void;
    setGridItem(style: GridItemStyle): void;
    setIntrinsicMeasureFunc(measureFunc: GridIntrinsicMeasureFunc | null): void;
    /** Call the measure function with caching. */
    cachedMeasure(w: number, wm: number, h: number, hm: number): {
        width: number;
        height: number;
    } | null;
    /** Check layout cache for a previously computed size with same available dimensions. */
    getCachedLayout(availW: number, availH: number): {
        width: number;
        height: number;
    } | null;
    /** Cache a computed layout result for the given available dimensions. */
    setCachedLayout(availW: number, availH: number, computedW: number, computedH: number): void;
    /** Clear layout cache for this node and all descendants. */
    resetLayoutCache(): void;
    /** Check if this node needs layout recalculation. */
    isDirty(): boolean;
    /** Mark this node and all ancestors as dirty. */
    markDirty(): void;
    /** Check if this node has new layout results since the last check. */
    hasNewLayout(): boolean;
    /** Mark that the current layout has been seen/processed. */
    markLayoutSeen(): void;
    /** Calculate layout for this node and all descendants. */
    calculateLayout(width?: number, height?: number, direction?: number): void | GridCalculateResult;
    /** Get the computed left position after layout. */
    getComputedLeft(): number;
    /** Get the computed top position after layout. */
    getComputedTop(): number;
    /** Get the computed width after layout. */
    getComputedWidth(): number;
    /** Get the computed height after layout. */
    getComputedHeight(): number;
    /** Get the computed right edge position after layout (left + width). */
    getComputedRight(): number;
    /** Get the computed bottom edge position after layout (top + height). */
    getComputedBottom(): number;
    get children(): readonly Node[];
    get layout(): Layout;
    get measureFunc(): MeasureFunc | null;
    get baselineFunc(): BaselineFunc | null;
    get flex(): FlexInfo;
    getGridStyle(): GridStyle | null;
    getGridItemStyle(): GridItemStyle;
    getIntrinsicMeasureFunc(): GridIntrinsicMeasureFunc | null;
    getGridRevision(): number;
    getGridNodeId(): number;
    getGridIntrinsicCache(): GridIntrinsicCycleCache | undefined;
    setGridIntrinsicCache(cache: GridIntrinsicCycleCache): void;
    getGridContributions(): readonly GridIntrinsicContribution[];
    setGridContributions(contributions: readonly GridIntrinsicContribution[]): void;
    getGridResult(): GridCalculateResult | null;
    setGridResult(result: GridCalculateResult): void;
    getGridError(): GridLayoutError | null;
    setGridError(error: GridLayoutError | null): void;
    setGridValidationError(error: GridLayoutError | null): void;
    getGridValidationError(): GridLayoutError | null;
}
