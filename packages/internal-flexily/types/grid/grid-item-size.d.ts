/**
 * Resolve Grid item areas and local rectangles.
 *
 * This stage consumes the aligned track geometry.  It deliberately has no
 * Node/writeback or transform knowledge: the result is a list of local
 * `GridResolvedRect` values for the later compositor seam.
 */
import type { AxisSizingResult, ExpandedTracks, GridItemAlignment, GridItemStyle, GridLayoutError, GridResolvedPlacement, GridResolvedRect } from "./grid-model";
export declare const GRID_ITEM_SIZE_LIMIT = 1024;
export declare const GRID_ITEM_SIZE_EPSILON = 0.000001;
export type GridItemDimension = number | {
    readonly percent: number;
} | {
    readonly fitContent: number | {
        readonly percent: number;
    };
} | {
    readonly value: number;
    readonly unit: number | string;
} | "auto" | "fit" | "fit-content" | "grow" | "min-content" | "max-content";
export type GridItemEdge = number | {
    readonly percent: number;
} | {
    readonly value: number;
    readonly unit: number | string;
};
export type GridItemEdges = GridItemEdge | readonly [GridItemEdge, GridItemEdge, GridItemEdge, GridItemEdge] | {
    readonly top?: GridItemEdge;
    readonly right?: GridItemEdge;
    readonly bottom?: GridItemEdge;
    readonly left?: GridItemEdge;
    readonly inlineStart?: GridItemEdge;
    readonly inlineEnd?: GridItemEdge;
    readonly blockStart?: GridItemEdge;
    readonly blockEnd?: GridItemEdge;
    readonly start?: GridItemEdge;
    readonly end?: GridItemEdge;
};
export type GridItemIntrinsic = {
    readonly width?: number;
    readonly height?: number;
    readonly minWidth?: number;
    readonly maxWidth?: number;
    readonly minHeight?: number;
    readonly maxHeight?: number;
    readonly minContentWidth?: number;
    readonly maxContentWidth?: number;
    readonly minContentHeight?: number;
    readonly maxContentHeight?: number;
    readonly minContent?: number;
    readonly maxContent?: number;
    readonly minimum?: number;
    readonly preferred?: number;
};
/** Item properties used by this internal sizing stage. */
export type GridItemSizeStyle = GridItemStyle & {
    readonly width?: GridItemDimension;
    readonly height?: GridItemDimension;
    readonly minWidth?: GridItemDimension;
    readonly maxWidth?: GridItemDimension;
    readonly minHeight?: GridItemDimension;
    readonly maxHeight?: GridItemDimension;
    readonly margin?: GridItemEdges;
    readonly padding?: GridItemEdges;
    readonly border?: GridItemEdges;
    readonly marginTop?: GridItemEdge;
    readonly marginRight?: GridItemEdge;
    readonly marginBottom?: GridItemEdge;
    readonly marginLeft?: GridItemEdge;
    readonly paddingTop?: GridItemEdge;
    readonly paddingRight?: GridItemEdge;
    readonly paddingBottom?: GridItemEdge;
    readonly paddingLeft?: GridItemEdge;
    readonly borderTop?: GridItemEdge;
    readonly borderRight?: GridItemEdge;
    readonly borderBottom?: GridItemEdge;
    readonly borderLeft?: GridItemEdge;
    readonly [key: string]: unknown;
};
export type GridItemSizingEntry = {
    readonly nodeId?: number;
    readonly placement?: GridResolvedPlacement;
    readonly style?: GridItemSizeStyle;
    readonly intrinsic?: GridItemIntrinsic | number;
    readonly measure?: GridItemIntrinsic | number;
    readonly kind?: "box" | "text" | "img" | "canvas" | string;
    readonly [key: string]: unknown;
};
export type GridItemArea = {
    readonly nodeId: number;
    readonly rowStart: number;
    readonly rowEnd: number;
    readonly columnStart: number;
    readonly columnEnd: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};
export type GridItemSizeInput = {
    readonly rows: AxisSizingResult | ExpandedTracks;
    readonly columns: AxisSizingResult | ExpandedTracks;
    readonly items?: readonly (GridItemSizingEntry | GridResolvedPlacement)[];
    readonly placements?: readonly GridResolvedPlacement[];
    readonly itemStyles?: readonly GridItemSizeStyle[] | Readonly<Record<string, GridItemSizeStyle>>;
    readonly intrinsicSizes?: readonly (GridItemIntrinsic | number | undefined)[] | Readonly<Record<string, GridItemIntrinsic | number>>;
    readonly intrinsics?: readonly (GridItemIntrinsic | number | undefined)[] | Readonly<Record<string, GridItemIntrinsic | number>>;
    readonly measurements?: readonly (GridItemIntrinsic | number | undefined)[] | Readonly<Record<string, GridItemIntrinsic | number>>;
    readonly intrinsicByNode?: Readonly<Record<string, GridItemIntrinsic | number>>;
    readonly gap?: number;
    readonly columnGap?: number;
    readonly rowGap?: number;
    readonly justifyItems?: GridItemAlignment | string;
    readonly alignItems?: GridItemAlignment | string;
    readonly defaults?: {
        readonly justifySelf?: GridItemAlignment | string;
        readonly alignSelf?: GridItemAlignment | string;
    };
    readonly style?: {
        readonly justifyItems?: GridItemAlignment | string;
        readonly alignItems?: GridItemAlignment | string;
    };
    readonly nodeId?: number;
    readonly [key: string]: unknown;
};
export type GridItemSizeResult = {
    readonly areas: readonly GridItemArea[];
    readonly boxes: readonly GridResolvedRect[];
    /** Alias useful to callers that consume rectangles directly. */
    readonly rects: readonly GridResolvedRect[];
};
export type ItemSizeInput = GridItemSizeInput;
export type ItemSizeResult = GridItemSizeResult;
export type ItemStyle = GridItemSizeStyle;
type Result = GridItemSizeResult | GridLayoutError;
/** Resolve all placed items to local rectangles without mutating any input. */
export declare function resolveItemSizes(input: GridItemSizeInput): Result;
/** Alias using the shorter stage name used by the layout pipeline. */
export declare const sizeItems: typeof resolveItemSizes;
export declare const resolveGridItemSizes: typeof resolveItemSizes;
export declare const layoutItems: typeof resolveItemSizes;
export declare const resolveItemSize: typeof resolveItemSizes;
export declare const calculateItemSizes: typeof resolveItemSizes;
export declare const sizeItem: typeof resolveItemSizes;
/** Return only the local item rectangles. */
export declare function resolveItemRects(input: GridItemSizeInput): readonly GridResolvedRect[] | GridLayoutError;
export declare const itemRects: typeof resolveItemRects;
export declare const resolveItemRect: typeof resolveItemRects;
export {};
