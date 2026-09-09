/**
 * Grid row/column auto-placement.
 *
 * Explicit lines are resolved by G-013.  This stage only walks unresolved
 * axes in source order, advances a row/column cursor, and grows the implicit
 * axis as needed.  It intentionally does not perform dense backtracking or
 * track sizing; `*-dense` is accepted as a valid flow and behaves as normal
 * flow until G-015 supplies the dense search.
 */
import type { GridAutoFlow, GridItemInput, GridLayoutError, GridResolvedLineSet, GridSnapshot, PlacementResult } from "./grid-model";
/** Resolve auto-placement in source order without dense backtracking. */
export declare function autoPlace(snapshot: GridSnapshot, lines: GridResolvedLineSet, items: readonly GridItemInput[]): PlacementResult | GridLayoutError;
export declare const placeAuto: typeof autoPlace;
export declare const resolveAutoPlacement: typeof autoPlace;
export declare const place: typeof autoPlace;
export type { GridAutoFlow };
