/**
 * Resolve the bounded intrinsic dependency between Grid columns and rows.
 *
 * A pass resolves columns first, then measures rows with the resulting inline
 * width.  A changed min-content contribution may request one more complete
 * pass, but the budget is deliberately fixed at two.  The cache key contains
 * the item, axis, and inline restriction, so wrapping and nested layout do
 * not reuse a measurement made for a different width.
 */
import type { AxisSizingResult, ExpandedTracks, GridAvailableSpace, GridAxis, GridIntrinsicContribution, GridIntrinsicSizes, GridLayoutError, GridResolvedPlacement, PlacementResult } from "./grid-model";
import type { GridIntrinsicMeasureSource } from "./grid-intrinsic";
export declare const GRID_INTRINSIC_CYCLE_MAX_PASSES = 2;
export declare const GRID_INTRINSIC_CYCLE_TRACK_LIMIT = 1024;
export declare const GRID_INTRINSIC_CYCLE_EPSILON = 0.000001;
type AxisSource = AxisSizingResult | ExpandedTracks;
type Available = GridAvailableSpace | number | Record<string, unknown> | undefined;
type ContributionSet = readonly GridIntrinsicContribution[] | {
    readonly columns?: readonly GridIntrinsicContribution[];
    readonly rows?: readonly GridIntrinsicContribution[];
};
export type GridIntrinsicCycleCache = {
    readonly entries: Map<string, GridIntrinsicSizes>;
    readonly hits: number;
    readonly misses: number;
};
export type GridIntrinsicCycleLog = {
    readonly pass: 1 | 2;
    readonly nodeId: number;
    readonly axis: GridAxis;
    readonly inlineWidth: number | undefined;
    readonly restriction: string;
    readonly key: string;
    readonly cacheHit: boolean;
};
export type GridIntrinsicCycleResolver = (axis: GridAxis, tracks: ExpandedTracks, contributions: readonly GridIntrinsicContribution[], pass: 1 | 2) => AxisSource | GridLayoutError;
export type GridIntrinsicCycleInput = {
    readonly columns?: AxisSource;
    readonly rows?: AxisSource;
    /** Aliases are useful when the preceding stage names its outputs tracks. */
    readonly columnTracks?: AxisSource;
    readonly rowTracks?: AxisSource;
    readonly items?: PlacementResult | readonly GridResolvedPlacement[];
    readonly placements?: PlacementResult | readonly GridResolvedPlacement[];
    readonly measure?: GridIntrinsicMeasureSource;
    readonly intrinsicMeasure?: GridIntrinsicMeasureSource;
    readonly columnMeasure?: GridIntrinsicMeasureSource;
    readonly rowMeasure?: GridIntrinsicMeasureSource;
    readonly available?: Available;
    readonly columnAvailable?: Available;
    readonly rowAvailable?: Available;
    readonly gap?: number;
    readonly columnGap?: number;
    readonly rowGap?: number;
    readonly previousContributions?: ContributionSet;
    readonly initialContributions?: ContributionSet;
    readonly previous?: ContributionSet;
    readonly forceSecondPass?: boolean;
    readonly resolveColumns?: GridIntrinsicCycleResolver;
    readonly resolveRows?: GridIntrinsicCycleResolver;
    readonly cache?: GridIntrinsicCycleCache | Map<string, GridIntrinsicSizes>;
    readonly nodeId?: number;
    readonly [key: string]: unknown;
};
export type GridIntrinsicCycleStats = {
    readonly intrinsicPasses: 1 | 2;
    readonly cacheHit: boolean;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly measureCalls: number;
};
export type GridIntrinsicCycleResult = {
    readonly columns: AxisSizingResult;
    readonly rows: AxisSizingResult;
    readonly columnTracks: ExpandedTracks;
    readonly rowTracks: ExpandedTracks;
    readonly columnContributions: readonly GridIntrinsicContribution[];
    readonly rowContributions: readonly GridIntrinsicContribution[];
    readonly contributions: readonly GridIntrinsicContribution[];
    readonly items: readonly GridResolvedPlacement[];
    readonly intrinsicPasses: 1 | 2;
    readonly passes: 1 | 2;
    readonly stats: GridIntrinsicCycleStats;
    readonly logs: readonly GridIntrinsicCycleLog[];
    readonly cache: GridIntrinsicCycleCache;
};
export type IntrinsicCycleInput = GridIntrinsicCycleInput;
export type IntrinsicCycleResult = GridIntrinsicCycleResult;
type Result = GridIntrinsicCycleResult | GridLayoutError;
/** Resolve columns, measure rows with their real inline widths, and allow one recalc. */
export declare function resolveIntrinsicCycle(input: GridIntrinsicCycleInput): Result;
export declare function createIntrinsicCycleCache(): GridIntrinsicCycleCache;
export declare const runIntrinsicCycle: typeof resolveIntrinsicCycle;
export declare const recalculateIntrinsic: typeof resolveIntrinsicCycle;
export declare const intrinsicRecalc: typeof resolveIntrinsicCycle;
export declare const resolveGridIntrinsicCycle: typeof resolveIntrinsicCycle;
export declare const resolveIntrinsicDependency: typeof resolveIntrinsicCycle;
export declare const recalculateIntrinsicCycle: typeof resolveIntrinsicCycle;
export declare const resolveGridIntrinsicDependency: typeof resolveIntrinsicCycle;
export declare const calculateIntrinsicCycle: typeof resolveIntrinsicCycle;
export declare const createGridIntrinsicCycleCache: typeof createIntrinsicCycleCache;
export {};
