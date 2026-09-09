/**
 * Intrinsic contributions for non-spanning Grid items.
 *
 * G-019 is intentionally the span=1 pass only.  It asks the per-node
 * intrinsic callback for min-content, max-content, minimum, and preferred
 * values, records those values with the item's placement, and updates the
 * initial base/growth state for intrinsic tracks.  Span growth, flexible
 * tracks, and final sizing belong to later stages.
 */
import type { ExpandedTracks, GridAvailableSpace, GridAxis, GridIntrinsicContribution, GridIntrinsicMeasureFunc, GridLayoutError, GridResolvedPlacement, PlacementResult } from "./grid-model";
export declare const GRID_INTRINSIC_TRACK_LIMIT = 1024;
export type GridIntrinsicMeasureSource = GridIntrinsicMeasureFunc | ReadonlyMap<number, GridIntrinsicMeasureFunc>;
export type GridIntrinsicOptions = {
    /** Inline width used by the callback.  Undefined keeps the axis indefinite. */
    readonly inlineWidth?: number;
    /** Optional callback for deriving row inline width from a resolved area. */
    readonly inlineWidthFor?: (placement: GridResolvedPlacement) => number | undefined;
    /** Resolved columns used to derive a row item's inline width. */
    readonly columnTracks?: ExpandedTracks;
    readonly gap?: number;
};
export type GridIntrinsicInput = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly items: PlacementResult;
    readonly measure: GridIntrinsicMeasureSource;
    readonly options?: GridIntrinsicOptions;
    /** Optional fields mirror AxisSizingInput for staged callers. */
    readonly available?: GridAvailableSpace;
    readonly inlineWidth?: number;
    readonly columnTracks?: ExpandedTracks;
    readonly gap?: number;
};
export type GridIntrinsicResult = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly contributions: readonly GridIntrinsicContribution[];
    /** Stable per-measure keys, useful for cache diagnostics. */
    readonly cacheKeys: readonly string[];
};
type Result = GridIntrinsicResult | GridLayoutError;
/** Resolve span=1 intrinsic contributions and update the track states. */
export declare function resolveIntrinsic(input: GridIntrinsicInput): Result;
/** Positional convenience form used by the sizing pipeline. */
export declare function collectIntrinsicContributions(axis: GridAxis, tracks: ExpandedTracks, items: PlacementResult, measure: GridIntrinsicMeasureSource, options?: GridIntrinsicOptions): Result;
/** Return only the updated axis state while retaining a concise stage seam. */
export declare function updateIntrinsicTracks(input: GridIntrinsicInput): ExpandedTracks | GridLayoutError;
export declare const measureIntrinsic: typeof resolveIntrinsic;
export declare const intrinsicContributions: typeof collectIntrinsicContributions;
export declare const resolveIntrinsicContributions: typeof collectIntrinsicContributions;
export {};
