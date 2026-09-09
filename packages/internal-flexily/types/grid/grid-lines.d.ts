/**
 * Grid line naming and numeric line indexing.
 *
 * Placement consumes zero-based line indices, while the public Grid API uses
 * CSS-style one-based (and negative) references.  This module only resolves
 * the line index; it does not scan an occupancy grid or perform auto-placement.
 */
import type { ExpandedTracks, GridAxis, GridExpandedAxes, GridLineRef, GridLayoutError, GridSnapshot, GridTrack, GridResolvedLineSet, ResolvedLines } from "./grid-model";
import { type GridAreaMap, type GridAreaRect } from "./grid-areas";
export declare const GRID_LINE_LIMIT = 1024;
export type LineNameIndex = ReadonlyMap<string, readonly number[]>;
export type GridLineSide = "start" | "end";
export type LineResolution = number | GridLayoutError;
/**
 * Index names declared before/after concrete tracks.  The returned arrays are
 * copies, so later placement cannot mutate this line index accidentally.
 */
export declare function indexLineNames(tracks: readonly GridTrack[], trackCount?: number): LineNameIndex | GridLayoutError;
/**
 * Resolve both axes' line names after track expansion.  Area start/end names
 * are generated as part of the explicit grid (`header-start`, `header-end`).
 */
export declare function resolveLines(snapshot: GridSnapshot, expanded: GridExpandedAxes): GridResolvedLineSet | GridLayoutError;
/** Alias for callers that resolve one axis in a staged pipeline. */
export declare function resolveAxisLines(snapshot: GridSnapshot, axis: GridAxis, expanded: ExpandedTracks): ResolvedLines | GridLayoutError;
/** Resolve a public numeric or named line reference to a zero-based index. */
export declare function resolveLineReference(lines: ResolvedLines, ref: GridLineRef, path?: string, nodeId?: number, _side?: GridLineSide): LineResolution;
export declare function resolveNamedLine(lines: ResolvedLines, name: string, occurrence?: number, path?: string, nodeId?: number): LineResolution;
/** Short alias used by placement implementations. */
export declare const resolveLine: typeof resolveLineReference;
/** Look up area-generated names without exposing mutable index arrays. */
export declare function areaLineNames(areas: GridAreaMap, axis: GridAxis): LineNameIndex;
/** Retrieve a named area's four line indices from an indexed line set. */
export declare function areaLines(lines: ResolvedLines, name: string, nodeId?: number): {
    readonly start: number;
    readonly end: number;
} | GridLayoutError;
export type { GridAreaMap, GridAreaRect };
