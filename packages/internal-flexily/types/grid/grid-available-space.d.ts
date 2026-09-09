/**
 * Resolve the space that is available to Grid sizing functions.
 *
 * This seam deliberately keeps the content box separate from its gutters.  A
 * percentage is resolved from the content box; the gap is only deducted when
 * calculating the budget left for tracks.  This distinction is observable
 * for, for example, two 50% columns with a gap: each column is 150px in a
 * 300px content box and the ten pixel gap causes the expected overflow.
 */
import type { ExpandedTracks, GridAvailableSpace, GridAxis, GridIntrinsicContribution, GridIntrinsicSizes, GridLayoutError, GridPercent } from "./grid-model";
export declare const GRID_AVAILABLE_TRACK_LIMIT = 1024;
type Numeric = number | undefined;
type SpaceValue = GridAvailableSpace | number | undefined;
/** A pair of leading/trailing edges for one axis. */
export type GridAxisEdges = number | readonly [number, number] | {
    readonly start?: number;
    readonly end?: number;
    readonly before?: number;
    readonly after?: number;
    readonly inlineStart?: number;
    readonly inlineEnd?: number;
    readonly blockStart?: number;
    readonly blockEnd?: number;
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
};
/**
 * Inputs accepted by `resolveAvailableSpace`.
 *
 * `container`, `outer`, and `available` are aliases because the sizing seam
 * is used both before and after Flexily has selected a container size.  The
 * index signature is intentional: callers may carry unrelated layout fields
 * in a snapshot without first allocating a translated object.
 */
export type GridAvailableSpaceInput = {
    readonly axis?: GridAxis;
    readonly available?: SpaceValue;
    readonly container?: SpaceValue;
    readonly outer?: SpaceValue;
    readonly outerSize?: SpaceValue;
    readonly containerSize?: SpaceValue;
    readonly availableSize?: SpaceValue;
    readonly size?: SpaceValue;
    readonly width?: SpaceValue;
    readonly height?: SpaceValue;
    readonly padding?: GridAxisEdges;
    readonly border?: GridAxisEdges;
    readonly paddingStart?: Numeric;
    readonly paddingEnd?: Numeric;
    readonly borderStart?: Numeric;
    readonly borderEnd?: Numeric;
    readonly paddingInline?: GridAxisEdges;
    readonly paddingBlock?: GridAxisEdges;
    readonly paddingLeft?: Numeric;
    readonly paddingRight?: Numeric;
    readonly paddingTop?: Numeric;
    readonly paddingBottom?: Numeric;
    readonly borderInline?: GridAxisEdges;
    readonly borderBlock?: GridAxisEdges;
    readonly borderLeft?: Numeric;
    readonly borderRight?: Numeric;
    readonly borderTop?: Numeric;
    readonly borderBottom?: Numeric;
    readonly gap?: Numeric;
    readonly trackCount?: Numeric;
    readonly min?: Numeric;
    readonly max?: Numeric;
    readonly minSize?: Numeric;
    readonly maxSize?: Numeric;
    readonly containerMin?: Numeric;
    readonly containerMax?: Numeric;
    readonly minWidth?: Numeric;
    readonly maxWidth?: Numeric;
    readonly minHeight?: Numeric;
    readonly maxHeight?: Numeric;
    readonly minContent?: Numeric;
    readonly maxContent?: Numeric;
    readonly intrinsic?: Numeric | GridIntrinsicSizes;
    readonly contribution?: Numeric | GridIntrinsicSizes;
    readonly intrinsicContribution?: Numeric | GridIntrinsicSizes;
    readonly [key: string]: unknown;
};
/** Result of resolving the outer size, content box, and gutter budget. */
export type GridAvailableSpaceResult = {
    readonly axis: GridAxis;
    /** Content-box space used by percentage sizing functions. */
    readonly available: GridAvailableSpace;
    readonly contentBox: number | null;
    /** Content-box space less gutters, floored at zero. */
    readonly trackSpace: number | null;
    readonly outerSize: number | null;
    readonly origin: number;
    readonly paddingStart: number;
    readonly paddingEnd: number;
    readonly borderStart: number;
    readonly borderEnd: number;
    readonly padding: number;
    readonly border: number;
    readonly gap: number;
    readonly gutter: number;
    readonly overflow: number;
    readonly intrinsic: number | null;
    readonly minSize: number | null;
    readonly maxSize: number | null;
};
/** Inputs for resolving percent sizing functions on initialized tracks. */
export type GridPercentageInput = {
    readonly axis?: GridAxis;
    readonly tracks: ExpandedTracks;
    readonly available: GridAvailableSpace | GridAvailableSpaceResult | number | GridAvailableSpaceInput;
    readonly gap?: number;
    readonly intrinsic?: number | GridIntrinsicSizes;
    readonly contribution?: number | GridIntrinsicSizes;
    readonly intrinsicContribution?: number | GridIntrinsicSizes;
    readonly intrinsicByTrack?: readonly number[];
    readonly contributions?: readonly GridIntrinsicContribution[];
    readonly nodeId?: number;
    readonly [key: string]: unknown;
};
/** Result of resolving percentages on an axis without mutating the source. */
export type GridPercentageResult = GridAvailableSpaceResult & {
    readonly tracks: ExpandedTracks;
    readonly unresolved: readonly number[];
    readonly changed: boolean;
    readonly pass: 1;
};
/**
 * Resolve a container's content-box space.  The function is pure, so a new
 * viewport/container size naturally produces a new result (and never a stale
 * percentage from a previous calculation).
 */
export declare function resolveAvailableSpace(input?: GridAvailableSpaceInput | GridAvailableSpace | number, padding?: GridAxisEdges, border?: GridAxisEdges, gap?: number, nodeId?: number): GridAvailableSpaceResult | GridLayoutError;
/**
 * Resolve one percentage.  On an indefinite axis the whole intrinsic
 * contribution is used, as prescribed by the Grid intrinsic fallback; the
 * percentage is not multiplied by an invented viewport or replaced by zero.
 */
export declare function resolvePercentage(value: GridPercent | number, available: GridAvailableSpace | GridAvailableSpaceResult | number, intrinsic?: number | GridIntrinsicSizes): number | null | GridLayoutError;
/** Resolve all percentage sizing functions on one initialized axis. */
export declare function resolvePercentageTracks(input: GridPercentageInput): ExpandedTracks | GridLayoutError;
/**
 * Resolve percentages and publish the available-space accounting used by the
 * following sizing stages.  Source track state and contributions are never
 * mutated, which also makes viewport resize recalculation deterministic.
 */
export declare function resolvePercentages(input: GridPercentageInput): GridPercentageResult | GridLayoutError;
export declare function resolvePercentages(axis: GridAxis, tracks: ExpandedTracks, available: GridAvailableSpace | GridAvailableSpaceResult | number | GridAvailableSpaceInput, intrinsic?: number | GridIntrinsicSizes, gap?: number): GridPercentageResult | GridLayoutError;
export declare const resolveGridAvailableSpace: typeof resolveAvailableSpace;
export declare const calculateAvailableSpace: typeof resolveAvailableSpace;
export declare const availableSpace: typeof resolveAvailableSpace;
export declare const resolveAvailable: typeof resolveAvailableSpace;
export declare const resolvePercent: typeof resolvePercentage;
export declare const resolvePercentValue: typeof resolvePercentage;
export declare const resolvePercentTrack: typeof resolvePercentageTracks;
export declare const resolveTrackPercentages: typeof resolvePercentageTracks;
export declare const resolveGridPercentages: typeof resolvePercentages;
export declare const resolvePercentageSizes: typeof resolvePercentages;
export {};
