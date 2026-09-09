/**
 * Runtime validation and immutable snapshot creation for the Grid profile.
 *
 * Normalization is intentionally a pure boundary: it validates a complete
 * style, clones/freeze-protects the resulting snapshot, and does not place
 * items, size tracks, emit rectangles, or fall back to Flex.
 */
import type { GridLayoutError, GridSnapshot, GridStyle } from "./grid-model";
export declare const GRID_TRACK_LIMIT = 1024;
type NormalizeResult = GridSnapshot | GridLayoutError;
/** Normalize one complete style snapshot; repeated identity/revision calls hit the cache. */
export declare function normalize(style: GridStyle, nodeId: number, revision: number): NormalizeResult;
/** Reset normalization cache and counters between independent Node tests/runs. */
export declare function resetGridNormalizeStats(): void;
/** Read cache counters without exposing mutable cache state. */
export declare function getGridNormalizeStats(): {
    readonly normalizeCalls: number;
    readonly cacheHits: number;
};
export {};
