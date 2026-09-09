/**
 * Apply the resolved min/max functions of Grid tracks.
 *
 * This is deliberately a sizing seam: it does not distribute free space,
 * resolve `fr`, or align tracks.  It only turns intrinsic and fixed limits
 * into a safe base/growth interval.  A finite percentage limit uses the
 * content-box available space; an indefinite percentage uses the matching
 * intrinsic contribution when one is available.
 */
import type { ExpandedTracks, GridAvailableSpace, GridAxis, GridIntrinsicContribution, GridIntrinsicSizes, GridLayoutError } from "./grid-model";
export declare const GRID_LIMITS_TRACK_LIMIT = 1024;
type Available = GridAvailableSpace | number | {
    readonly available: GridAvailableSpace;
    readonly contentBox?: number | null;
};
type Result = GridLimitsResult | GridLayoutError;
export type GridLimitsInput = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly available: Available;
    readonly contributions?: readonly GridIntrinsicContribution[];
    readonly intrinsic?: number | GridIntrinsicSizes;
    readonly intrinsicByTrack?: readonly (number | GridIntrinsicSizes | undefined)[];
    readonly gap?: number;
    readonly nodeId?: number;
    readonly [key: string]: unknown;
};
export type GridTrackLimit = {
    readonly min: number;
    readonly max: number;
    readonly growthLimit: number;
};
export type GridLimitsResult = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly available: GridAvailableSpace;
    readonly limits: readonly GridTrackLimit[];
    readonly changed: boolean;
};
/** Apply intrinsic, minmax, and fit-content limits without mutating input. */
export declare function applyTrackLimits(input: GridLimitsInput): Result;
/** Return only the bounded track state for a sizing pipeline. */
export declare function limitedTracks(input: GridLimitsInput): ExpandedTracks | GridLayoutError;
/** Positional convenience form used by sizing callers. */
export declare function applyLimits(axis: GridAxis, tracks: ExpandedTracks, available: Available, contributions?: readonly GridIntrinsicContribution[], gap?: number): Result;
export declare const resolveLimits: typeof applyTrackLimits;
export declare const resolveTrackLimits: typeof applyTrackLimits;
export declare const resolveLimitedTracks: typeof limitedTracks;
export declare const limitTracks: typeof applyTrackLimits;
export declare const applyGridLimits: typeof applyTrackLimits;
export declare const resolveGridLimits: typeof applyTrackLimits;
export {};
