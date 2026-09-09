/**
 * Grid intrinsic-measure callback seam.
 *
 * Flexily owns the callback shape, while an adapter owns the text/font
 * measurement implementation. The callback always receives the Grid axis and
 * the available inline width in px (or `undefined` for an indefinite inline
 * constraint). No engine import is allowed here.
 */
import type { GridIntrinsicMeasureFunc, GridIntrinsicSizes } from "./grid-model";
export type GridAxisIntrinsicMeasure = (availableInlineWidth: number | undefined) => GridIntrinsicSizes;
export type GridIntrinsicMeasureSources = {
    readonly columns: GridAxisIntrinsicMeasure;
    readonly rows: GridAxisIntrinsicMeasure;
};
/**
 * Compose per-axis intrinsic measures into the single callback used by Grid.
 * Results are cached by axis and inline constraint; changing the inline width
 * therefore creates a fresh row measurement instead of reusing stale height.
 */
export declare function createGridIntrinsicMeasureFunc(sources: GridIntrinsicMeasureSources): GridIntrinsicMeasureFunc;
/** Read callback cache counters without exposing the cache itself. */
export declare function getGridIntrinsicMeasureStats(measure: GridIntrinsicMeasureFunc): {
    readonly hits: number;
    readonly misses: number;
};
