/**
 * Maximize non-flexible Grid tracks in a definite content box.
 *
 * This stage consumes only the free space left after the current track bases
 * and gutters.  Tracks whose maximum is `fr` are deliberately left alone for
 * the later flexible-track stage; alignment and auto stretching are also
 * outside this seam.  An indefinite axis has no finite free-space budget, so
 * its bases are returned unchanged with the constraint preserved.
 */
import type { ExpandedTracks, GridAvailableSpace, GridAxis, GridLayoutError } from "./grid-model";
export declare const GRID_MAXIMIZE_TRACK_LIMIT = 1024;
export declare const GRID_MAXIMIZE_EPSILON = 0.000001;
export type MaximizeAvailable = GridAvailableSpace | number;
export type MaximizeInput = {
    readonly axis: GridAxis;
    readonly available: MaximizeAvailable;
    readonly tracks: ExpandedTracks;
    readonly gap?: number;
};
export type MaximizeResult = {
    readonly axis: GridAxis;
    readonly tracks: ExpandedTracks;
    /** Free space before this stage consumes any eligible track capacity. */
    readonly freeSpace: number | null;
    /** Space that remains after maximizing, or null on an indefinite axis. */
    readonly remainingSpace: number | null;
    /** Base-size growth consumed by this stage, excluding gutters. */
    readonly consumed: number;
    /** Positive overflow when bases plus gutters already exceed a definite box. */
    readonly overflow: number;
    readonly available: GridAvailableSpace;
    readonly frozen: readonly number[];
};
type Result = MaximizeResult | GridLayoutError;
/** Maximize eligible tracks in a definite box; preserve indefinite axes. */
export declare function maximizeTracks(input: MaximizeInput): Result;
/** Positional convenience form for sizing callers. */
export declare function maximize(axis: GridAxis, tracks: ExpandedTracks, available: MaximizeAvailable, gap?: number): Result;
export declare const resolveMaximize: typeof maximizeTracks;
export declare const maximizeAxis: typeof maximizeTracks;
export declare const maximizeGridTracks: typeof maximizeTracks;
export declare const resolveTrackMaximize: typeof maximizeTracks;
export {};
