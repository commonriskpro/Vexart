/**
 * Implicit grid-track expansion.
 *
 * Placement works with zero-based, end-exclusive cell coordinates.  Once the
 * placement stage has found a cell outside the explicit grid, this stage
 * materialises the missing tracks using the corresponding auto-track value.
 * It deliberately does not interpret the track value: repeat expansion and
 * track sizing belong to later stages.
 *
 * All functions build new DTOs.  In particular, a track-limit error is
 * returned before anything supplied by the caller is changed (or truncated).
 */
import type { ExpandedTracks, GridAxis, GridExpandedAxes, GridLayoutError, GridResolvedLineSet, GridResolvedPlacement, GridSnapshot, PlacementResult, ResolvedLines } from "./grid-model";
/** Maximum number of concrete tracks on either axis. */
export declare const GRID_IMPLICIT_TRACK_LIMIT = 1024;
/** Shared spelling used by the other Grid stages. */
export declare const GRID_TRACK_LIMIT = 1024;
/**
 * Materialise the implicit tracks required by a placement result.
 *
 * `rowCount`/`columnCount` are the placement stage's requested dimensions;
 * item end coordinates are also checked so a malformed/stale count cannot
 * silently drop a placed cell.  Both axes are expanded in local arrays before
 * the result is returned, which makes the operation atomic on errors.
 */
export declare function expandImplicitTracks(snapshot: GridSnapshot, axes: GridExpandedAxes, placement: PlacementResult): GridExpandedAxes | GridLayoutError;
/** Expand one axis, useful to staged callers that have not built both axes. */
export declare function expandImplicitAxis(snapshot: GridSnapshot, axis: GridAxis, expanded: ExpandedTracks, requestedCount: number, placements?: readonly GridResolvedPlacement[]): ExpandedTracks | GridLayoutError;
/**
 * Extend a resolved axis's line placeholders to match its concrete tracks.
 * Track sizing may later replace the numeric positions; this stage only makes
 * every line index addressable and does not calculate physical coordinates.
 */
export declare function extendImplicitAxisLines(lines: ResolvedLines, trackCount: number, node?: number): ResolvedLines | GridLayoutError;
/**
 * Extend both line sets after implicit-track expansion.  Existing names and
 * positions are copied; no name is invented for an implicit track.
 */
export declare function extendImplicitLines(lines: GridResolvedLineSet, axes: GridExpandedAxes, node?: number): GridResolvedLineSet | GridLayoutError;
export declare const addImplicitTracks: typeof expandImplicitTracks;
export declare const createImplicitTracks: typeof expandImplicitTracks;
export declare const addImplicitAxisTracks: typeof expandImplicitAxis;
export declare const extendLines: typeof extendImplicitLines;
export declare const expandImplicitLines: typeof extendImplicitLines;
