/**
 * Initial Grid track sizing state.
 *
 * This stage only translates a track's sizing functions into the initial
 * `GridTrackState`.  It does not measure content, distribute free space, or
 * resolve flexible fractions.  Percentages on an indefinite axis stay
 * represented by their sizing function and receive an unresolved intrinsic
 * base; a later available-space stage resolves them.
 */
import type { ExpandedTracks, GridAvailableSpace, GridExpandedAxes, GridLayoutError, GridTrackSize, GridTrackState } from "./grid-model";
export declare const GRID_TRACK_INIT_LIMIT = 1024;
export declare const GRID_TRACK_LIMIT = 1024;
type Available = GridAvailableSpace | number | undefined;
type TrackResult = GridTrackState | GridLayoutError;
/** Initialize one GridTrackSize without performing later sizing phases. */
export declare function initializeTrack(value: GridTrackSize, space?: Available, path?: string, nodeId?: number): TrackResult;
/** Initialize all states in one expanded axis, preserving its explicit count. */
export declare function initializeAxisTracks(expanded: ExpandedTracks, space?: Available, nodeId?: number): ExpandedTracks | GridLayoutError;
/** Initialize both axes atomically. */
export declare function initializeGridTracks(axes: GridExpandedAxes, space?: Available, nodeId?: number): GridExpandedAxes | GridLayoutError;
/** A gap is a fixed-size gutter; it does not participate in fr distribution. */
export declare function initializeGutter(gap: number, nodeId?: number): GridTrackState | GridLayoutError;
/** Convenience helper for callers carrying an axis and its gap together. */
export declare function initializeAxisWithGutter(expanded: ExpandedTracks, space?: Available, gap?: number, nodeId?: number): {
    readonly tracks: ExpandedTracks;
    readonly gutter: GridTrackState;
} | GridLayoutError;
export declare const initializeTrackSize: typeof initializeTrack;
export declare const initTrack: typeof initializeTrack;
export declare const initializeTracks: typeof initializeGridTracks;
export declare const initializeAxis: typeof initializeAxisTracks;
export declare const createGutterTrack: typeof initializeGutter;
export {};
