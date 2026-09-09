import type { GridErrorCode, GridLayoutError } from "./grid-model";
/** Complete, stable error-code inventory for the Grid pipeline. */
export declare const GRID_ERROR_CODES: readonly ["GRID_INVALID_VALUE", "GRID_INVALID_TRACK", "GRID_INVALID_REPEAT", "GRID_TRACK_LIMIT", "GRID_INVALID_AREA", "GRID_CONFLICTING_PLACEMENT", "GRID_INVALID_PLACEMENT", "GRID_LINE_UNRESOLVED", "GRID_UNSUPPORTED_ALIGNMENT", "GRID_MEASURE_INVALID"];
/** Create the structured error published by every Grid stage. */
export declare function createGridError(code: GridErrorCode, path: string, nodeId: number): GridLayoutError;
/** Narrow an unknown stage result without relying on an error message. */
export declare function isGridLayoutError(value: unknown): value is GridLayoutError;
