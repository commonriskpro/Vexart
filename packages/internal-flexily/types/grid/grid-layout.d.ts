/**
 * Grid composition for the zero-allocation Flexily Node.
 *
 * The individual Grid stages deliberately remain pure.  This file is the
 * only place that wires them to a Node: normalize -> repeat/placement ->
 * implicit tracks -> intrinsic -> span/limits/maximize/fr -> alignment ->
 * item rectangles.  A successful plan is committed in one step, so an error
 * never replaces an already published Node layout.
 */
import type { Node } from "../node-zero.js";
import { type GridItemSizingEntry } from "./grid-item-size.js";
import { type GridIntrinsicCycleCache } from "./grid-intrinsic-cycle.js";
import type { AxisSizingResult, GridCalculateResult, GridIntrinsicContribution, GridLayoutError, GridSnapshot, PlacementResult } from "./grid-model.js";
export declare const GRID_LAYOUT_TRACK_LIMIT = 1024;
export type GridLayoutComputation = {
    readonly snapshot: GridSnapshot;
    readonly placements: PlacementResult;
    readonly columns: AxisSizingResult;
    readonly rows: AxisSizingResult;
    readonly boxes: readonly {
        readonly nodeId: number;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }[];
    readonly intrinsicPasses: 1 | 2;
    readonly cacheHit: boolean;
    readonly cache: GridIntrinsicCycleCache;
    readonly contentWidth: number | null;
    readonly contentHeight: number | null;
    readonly contributions: readonly GridIntrinsicContribution[];
};
export type GridLayoutStats = {
    readonly layoutCalls: number;
    readonly noOp: number;
    readonly errors: number;
};
export type GridLayoutPlan = GridLayoutComputation & {
    readonly itemEntries: readonly GridItemSizingEntry[];
    readonly nodes: readonly Node[];
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
};
type Plan = GridLayoutPlan;
type Result = GridLayoutError | Plan;
/** Resolve a complete Grid plan without changing the Node's published rect. */
export declare function resolveGridLayout(node: Node, width?: number, height?: number, direction?: number): Result;
/** Execute a Grid plan and commit all local rectangles after every stage succeeds. */
export declare function layoutGridNode(node: Node, width: number, height: number, offsetX: number, offsetY: number, absX: number, absY: number, direction: number): GridCalculateResult;
/** Measure a Grid child for a Flex intrinsic pass without publishing positions. */
export declare function measureGridNode(node: Node, width: number, height: number, direction?: number): void;
export declare function getGridLayoutStats(): GridLayoutStats;
export declare function resetGridLayoutStats(): void;
export declare const calculateGridLayout: typeof resolveGridLayout;
export declare const resolveGridNodeLayout: typeof layoutGridNode;
export {};
