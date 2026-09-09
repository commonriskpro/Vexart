/**
 * Intrinsic growth for spanning Grid items.
 *
 * Contributions are processed from the narrowest span to the widest span.
 * Each span contributes only the space still missing after the current bases
 * and gutters, and that space is distributed among eligible tracks without
 * exceeding their growth limits.  This stage never resolves the final `fr`
 * fraction or alignment.
 */
import type { ExpandedTracks, GridAxis, GridIntrinsicContribution, GridLayoutError } from "./grid-model";
export declare const GRID_SPAN_TRACK_LIMIT = 1024;
export type SpanGrowthInput = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly contributions: readonly GridIntrinsicContribution[];
    readonly gap?: number;
};
export type SpanGrowthAllocation = {
    readonly nodeId: number;
    readonly start: number;
    readonly end: number;
    readonly requested: number;
    readonly allocated: number;
    readonly tracks: ReadonlyMap<number, number>;
};
export type SpanGrowthResult = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly frozen: readonly number[];
    readonly allocations: readonly SpanGrowthAllocation[];
};
type Result = SpanGrowthResult | GridLayoutError;
/** Distribute min-content growth from wider spans in increasing span order. */
export declare function distributeSpanGrowth(input: SpanGrowthInput): Result;
/** Positional convenience form for callers with separate stage values. */
export declare function growSpans(axis: GridAxis, tracks: ExpandedTracks, contributions: readonly GridIntrinsicContribution[], gap?: number): Result;
export declare const resolveSpanGrowth: typeof distributeSpanGrowth;
export declare const distributeSpans: typeof distributeSpanGrowth;
export declare const spanGrowth: typeof distributeSpanGrowth;
export {};
