/**
 * Resolve flexible (`fr`) Grid tracks after intrinsic/maximize passes.
 *
 * Definite axes use the Grid hypothetical-fr loop: free space is calculated
 * from non-flexible bases and gutters, flexible tracks below their base or
 * above their growth limit are frozen, and the remaining factors are solved
 * again.  Indefinite axes do not invent a viewport-sized budget; they use the
 * corresponding intrinsic contribution (max-content for a max-content axis).
 * This module does not round, align, or write back rectangles.
 */
import type { ExpandedTracks, GridAvailableSpace, GridAxis, GridIntrinsicContribution, GridLayoutError } from "./grid-model";
export declare const GRID_FLEX_TRACK_LIMIT = 1024;
export declare const GRID_FLEX_EPSILON = 0.000001;
export type FlexAvailable = GridAvailableSpace | number;
export type FlexInput = {
    readonly axis: GridAxis;
    readonly available: FlexAvailable;
    readonly tracks: ExpandedTracks;
    readonly gap?: number;
    /** Span contributions used to resolve an indefinite intrinsic axis. */
    readonly contributions?: readonly GridIntrinsicContribution[];
};
export type FlexResult = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    /** Free space available to flexible tracks before this phase. */
    readonly freeSpace: number | null;
    /** Actual free space after all final track bases and gutters. */
    readonly remainingSpace: number | null;
    readonly hypotheticalFr: number | null;
    readonly consumed: number;
    readonly overflow: number;
    readonly available: GridAvailableSpace;
    readonly factors: ReadonlyMap<number, number>;
    readonly frozen: readonly number[];
};
type Result = FlexResult | GridLayoutError;
/** Resolve flexible tracks without rounding or alignment. */
export declare function resolveFlex(input: FlexInput): Result;
/** Positional convenience form for the flexible sizing stage. */
export declare function expandFr(axis: GridAxis, tracks: ExpandedTracks, available: FlexAvailable, gap?: number, contributions?: readonly GridIntrinsicContribution[]): Result;
export declare const resolveFlexibleTracks: typeof resolveFlex;
export declare const flexTracks: typeof resolveFlex;
export declare const distributeFr: typeof resolveFlex;
export {};
