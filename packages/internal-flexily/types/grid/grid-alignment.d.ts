/**
 * Align sized Grid tracks in their content box.
 *
 * Track sizing has already happened when this stage runs.  In particular,
 * the gap is a fixed gutter while sizing is in progress; the `space-*`
 * values below only change the gutters after the track bases are known.
 * `stretch` is the one exception: it may grow tracks whose maximum sizing
 * function is `auto`, and never changes a fixed or an intrinsic track.
 */
import type { AlignedGrid, AlignmentInput as ModelAlignmentInput, AxisSizingResult, ExpandedTracks, GridAvailableSpace, GridAxis, GridContentAlignment, GridItemStyle, GridLayoutError, GridTrackState } from "./grid-model";
import type { GridAvailableSpaceInput, GridAvailableSpaceResult } from "./grid-available-space";
export declare const GRID_ALIGNMENT_TRACK_LIMIT = 1024;
export declare const GRID_ALIGNMENT_EPSILON = 0.000001;
/** Values accepted for an axis content box by the internal alignment seam. */
export type AlignmentAvailable = GridAvailableSpace | GridAvailableSpaceResult | GridAvailableSpaceInput | number;
/** The model input plus the container accounting carried by the sizing seam. */
export type AlignmentInput = ModelAlignmentInput & {
    /** A number applies to both axes; an object can provide one value per axis. */
    readonly available?: AlignmentAvailable | {
        readonly columns?: AlignmentAvailable;
        readonly rows?: AlignmentAvailable;
    };
    readonly width?: AlignmentAvailable;
    readonly height?: AlignmentAvailable;
    readonly contentBox?: number | null;
    readonly columnGap?: number;
    readonly rowGap?: number;
    readonly gap?: number;
    readonly itemStyles?: readonly GridItemStyle[];
    readonly nodeId?: number;
    readonly [key: string]: unknown;
};
/** One-axis input useful to sizing callers that do not yet have both axes. */
export type AxisAlignmentInput = {
    readonly axis: GridAxis;
    readonly tracks: AxisSizingResult | ExpandedTracks;
    readonly available?: AlignmentAvailable;
    readonly contentBox?: number | null;
    readonly gap?: number;
    readonly alignment?: GridContentAlignment | string;
    readonly nodeId?: number;
};
/** Aligned track geometry, including the effective gutter accounting. */
export type AxisAlignmentResult = {
    readonly axis: GridAxis;
    readonly tracks: readonly GridTrackState[];
    /** Track edges are emitted as start/end pairs, including the gap edges. */
    readonly lines: readonly number[];
    readonly gap: number;
    readonly leading: number;
    readonly origin: number;
    readonly freeSpace: number | null;
    readonly overflow: number;
    readonly available: GridAvailableSpace | null;
};
type Result = AlignedGrid | GridLayoutError;
type AxisResult = AxisAlignmentResult | GridLayoutError;
/** Align one axis after sizing, preserving the source track bases. */
export declare function alignTracks(input: AxisAlignmentInput): AxisResult;
/** Positional convenience form for one-axis alignment. */
export declare function alignAxis(axis: GridAxis, tracks: AxisSizingResult | ExpandedTracks, available?: AlignmentAvailable, gap?: number, alignment?: GridContentAlignment | string, nodeId?: number): AxisResult;
/** Align both axes, atomically returning the pre-sized item boxes unchanged. */
export declare function align(input: AlignmentInput): Result;
export declare const resolveAlignment: typeof align;
export declare const alignGrid: typeof align;
export declare const alignGridTracks: typeof alignTracks;
export declare const resolveTrackAlignment: typeof alignTracks;
export {};
