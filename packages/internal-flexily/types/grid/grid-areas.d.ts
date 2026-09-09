/**
 * Grid-template-area indexing.
 *
 * The area matrix is part of the explicit grid.  A name is useful only when
 * every occurrence of that name forms one rectangle; disconnected names are
 * rejected here rather than being silently ignored by placement.
 */
import type { GridLayoutError } from "./grid-model";
export declare const GRID_AREA_LIMIT = 1024;
/** Zero-based, end-exclusive coordinates for one named template area. */
export type GridAreaRect = {
    readonly rowStart: number;
    readonly rowEnd: number;
    readonly columnStart: number;
    readonly columnEnd: number;
};
export type GridAreaMap = ReadonlyMap<string, GridAreaRect>;
type AreaResult = GridAreaMap | GridLayoutError;
/** The same restricted name grammar used by grid normalization. */
export declare function isGridAreaName(value: unknown): value is string;
/**
 * Build the named-area index from a complete template matrix.
 *
 * The return value is either a map keyed by area name or a structured Grid
 * error.  It deliberately does not add tracks, resolve item placement, or
 * calculate track sizes.
 */
export declare function resolveAreas(value: unknown, nodeId?: number, path?: string): AreaResult;
/** Alias kept explicit for callers that distinguish a template from an item area. */
export declare const indexAreas: typeof resolveAreas;
export declare const resolveGridAreas: typeof resolveAreas;
/**
 * Look up one named area in an already indexed map or template matrix.
 * Unknown names are line-resolution failures, not an empty placement.
 */
export declare function resolveArea(areas: GridAreaMap | readonly (readonly (string | null)[])[], name: string, nodeId?: number, path?: string): GridAreaRect | GridLayoutError;
/** Return explicit-grid dimensions contributed by a template matrix. */
export declare function areaDimensions(areas: GridAreaMap | readonly (readonly (string | null)[])[], nodeId?: number, path?: string): {
    readonly rows: number;
    readonly columns: number;
} | GridLayoutError;
export {};
