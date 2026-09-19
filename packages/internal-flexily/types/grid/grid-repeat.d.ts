/**
 * Grid repeat expansion.
 *
 * This stage turns the track declarations in a normalized snapshot into
 * concrete `GridTrackState` entries.  Fixed repeats are copied exactly.  An
 * auto-repeat is limited to one expression per axis and one fixed track (or
 * `minmax(fixed, 1fr)`) and is expanded from the available axis size.  Track
 * sizing is deliberately not performed here; the numeric fields on the state
 * are neutral values consumed by the sizing stages.
 */
import type { GridAvailableSpace, GridExpandedAxes, GridLayoutError, GridSnapshot, PlacementResult } from "./grid-model";
export declare const GRID_REPEAT_TRACK_LIMIT = 1024;
/** Alias shared with the other Grid stages. */
export declare const GRID_TRACK_LIMIT = 1024;
export type GridRepeatResult = GridExpandedAxes & {
    /** Zero-based auto-fit tracks collapsed after placement. */
    readonly collapsedColumns: readonly number[];
    readonly collapsedRows: readonly number[];
};
type RepeatResult = GridRepeatResult | GridLayoutError;
type Available = GridAvailableSpace | number | undefined;
type AxisAvailable = {
    readonly columns?: Available;
    readonly rows?: Available;
};
type AvailableInput = Available | AxisAvailable;
/**
 * Expand fixed and supported auto-repeat declarations for both axes.
 *
 * A scalar `available` is applied to both axes for compatibility. Callers
 * with independent content-box constraints should pass `{ columns, rows }`;
 * an omitted or indefinite axis keeps exactly one auto-repeat track.
 */
export declare function expandRepeats(snapshot: GridSnapshot, available?: AvailableInput, placement?: PlacementResult): RepeatResult;
/** Alias matching the terminology used by the Grid pipeline. */
export declare const expandGridRepeats: typeof expandRepeats;
export declare const expandRepeat: typeof expandRepeats;
export declare const resolveRepeats: typeof expandRepeats;
export declare const repeatTracks: typeof expandRepeats;
export {};
