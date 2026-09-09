/**
 * Explicit Grid placement.
 *
 * This stage resolves the item's definite lines and spans.  An axis that is
 * still `auto` receives the smallest provisional cell; G-014 owns replacing
 * that provisional cell with the row/column auto-placement cursor.  No
 * occupancy search, dense packing, or track sizing happens here.
 */
import type { GridAreaPlacement, GridItemInput, GridLineRef, GridLayoutError, GridPlacement, GridResolvedLineSet, GridResolvedPlacement, GridSnapshot, PlacementResult } from "./grid-model";
type PlacementResultOrError = PlacementResult | GridLayoutError;
/** Return all occupied cells without treating overlaps as an error. */
export declare function occupancy(placements: readonly GridResolvedPlacement[]): ReadonlySet<string>;
export declare const getOccupiedCells: typeof occupancy;
/**
 * Resolve explicit item lines, spans, and named areas.  Explicit overlap is
 * valid; the returned occupancy helper is intentionally separate so G-014 can
 * use it while implementing auto-placement.
 */
export declare function place(snapshot: GridSnapshot, lines: GridResolvedLineSet, items: readonly GridItemInput[]): PlacementResultOrError;
export declare const resolvePlacement: typeof place;
export type { GridLineRef, GridPlacement, GridAreaPlacement };
