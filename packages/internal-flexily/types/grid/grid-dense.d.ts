/**
 * Dense Grid auto-placement.
 *
 * Dense placement repeats the normal row/column search from the beginning of
 * the implicit grid for every unresolved item.  That fills holes left by
 * earlier spans, while the returned list stays in source order.  This module
 * does not implement `order`, masonry, or track sizing.
 */
import type { GridAutoFlow, GridItemInput, GridLayoutError, GridResolvedLineSet, GridSnapshot, PlacementResult } from "./grid-model";
/** Place `row-dense`/`column-dense` items by searching from the first cell. */
export declare function densePlace(snapshot: GridSnapshot, lines: GridResolvedLineSet, items: readonly GridItemInput[]): PlacementResult | GridLayoutError;
export declare const placeDense: typeof densePlace;
export declare const resolveDensePlacement: typeof densePlace;
export declare const dense: typeof densePlace;
export type { GridAutoFlow };
