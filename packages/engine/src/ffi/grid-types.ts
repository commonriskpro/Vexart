/**
 * Grid contracts shared by the public engine surface and the internal solver.
 *
 * The public aliases in this file are beta API. Numeric validity (for example
 * positive `fr`, finite pixels, and rectangular areas) is deliberately a
 * runtime concern for G-007; the type layer must not reject a plain `number`.
 */

// ── Public Grid value types ──────────────────────────────────────────────────

/** @beta Percentage in the 0..100 range, measured against the available axis. */
export type GridPercent = { readonly percent: number }

/** @beta Fractional track unit. Runtime validation requires a positive value. */
export type GridFr = { readonly fr: number }

/** @beta A non-flexible Grid breadth, in px when numeric. */
export type GridBreadth =
  | number
  | GridPercent
  | "auto"
  | "min-content"
  | "max-content"

/** @beta A maximum breadth may also be a fractional track. */
export type GridMaxBreadth = GridBreadth | GridFr

/** @beta A two-sided minimum/maximum track definition. */
export type GridMinMax = {
  readonly minmax: readonly [GridBreadth, GridMaxBreadth]
}

/** @beta A max-content track capped at a fixed px or percentage size. */
export type GridFitContent = {
  readonly fitContent: number | GridPercent
}

/** @beta Fixed or automatic repeat count for a track list. */
export type GridRepeatCount = number | "auto-fill" | "auto-fit"

/** @beta A single track size, including the terminal profile's fit-content unit. */
export type GridTrackSize = GridBreadth | GridFr | GridMinMax | GridFitContent

/** @beta A track with optional line names or a repeated track list. */
export type GridTrack =
  | GridTrackSize
  | {
      readonly size: GridTrackSize
      readonly before?: readonly string[]
      readonly after?: readonly string[]
    }
  | {
      readonly repeat: {
        readonly count: GridRepeatCount
        readonly tracks: readonly GridTrack[]
      }
    }

/** @beta A 1-based line, named line, or positive span. */
export type GridLineRef =
  | number
  | { readonly name: string; readonly occurrence?: number }
  | { readonly span: number; readonly name?: string }

/** @beta Start/end shorthand for item placement. */
export type GridPlacement = {
  readonly start?: GridLineRef | "auto"
  readonly end?: GridLineRef | "auto"
}

/** @beta A named template area or its four-line placement form. */
export type GridAreaPlacement =
  | string
  | {
      readonly rowStart: GridLineRef | "auto"
      readonly columnStart: GridLineRef | "auto"
      readonly rowEnd: GridLineRef | "auto"
      readonly columnEnd: GridLineRef | "auto"
    }

/** @beta Automatic placement direction, optionally using dense cursor search. */
export type GridAutoFlow = "row" | "column" | "row-dense" | "column-dense"

/** @beta Content distribution along a Grid axis. */
export type GridContentAlignment =
  | "start"
  | "end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch"

/** @beta Item alignment inside its Grid area. */
export type GridItemAlignment = "start" | "end" | "center" | "stretch"

/** @beta Stable diagnostic codes emitted by Grid normalization and layout. */
export type GridErrorCode =
  | "GRID_INVALID_VALUE"
  | "GRID_INVALID_TRACK"
  | "GRID_INVALID_REPEAT"
  | "GRID_TRACK_LIMIT"
  | "GRID_INVALID_AREA"
  | "GRID_CONFLICTING_PLACEMENT"
  | "GRID_INVALID_PLACEMENT"
  | "GRID_LINE_UNRESOLVED"
  | "GRID_UNSUPPORTED_ALIGNMENT"
  | "GRID_MEASURE_INVALID"

/** @beta Structured Grid error; `path` points into the offending prop. */
export type GridLayoutError = {
  readonly code: GridErrorCode
  readonly path: string
  readonly nodeId: number
}

// ── Internal Grid model seam ─────────────────────────────────────────────────
// These exports are implementation contracts for packages/internal-flexily.
// They are intentionally not re-exported from public.ts.

export type GridAxis = "columns" | "rows"

export type GridAvailableSpace =
  | { readonly kind: "definite"; readonly px: number }
  | { readonly kind: "indefinite"; readonly constraint: "min-content" | "max-content" }

export type GridIntrinsicSizes = {
  readonly minContent: number
  readonly maxContent: number
  readonly minimum: number
  readonly preferred: number
}

export type GridTrackState = {
  readonly min: GridTrackSize
  readonly max: GridTrackSize
  readonly base: number
  readonly growthLimit: number
  readonly offset: number
}

export type GridStyle = {
  readonly columns: readonly GridTrack[]
  readonly rows: readonly GridTrack[]
  readonly autoColumns: GridTrackSize
  readonly autoRows: GridTrackSize
  readonly autoFlow: GridAutoFlow
  readonly areas: readonly (readonly (string | null)[])[]
  readonly gap: number
  readonly justifyContent: GridContentAlignment
  readonly alignContent: GridContentAlignment
  readonly justifyItems: GridItemAlignment
  readonly alignItems: GridItemAlignment
}

export type GridSnapshot = {
  readonly nodeId: number
  readonly revision: number
  readonly style: GridStyle
}

export type ExpandedTracks = {
  readonly axis: GridAxis
  readonly tracks: readonly GridTrackState[]
  readonly explicitCount: number
}

export type ResolvedLines = {
  readonly axis: GridAxis
  readonly positions: readonly number[]
  readonly names: ReadonlyMap<string, readonly number[]>
  readonly explicitCount: number
}

export type GridExpandedAxes = {
  readonly columns: ExpandedTracks
  readonly rows: ExpandedTracks
}

export type GridResolvedLineSet = {
  readonly columns: ResolvedLines
  readonly rows: ResolvedLines
}

export type GridItemStyle = {
  readonly row?: GridPlacement
  readonly column?: GridPlacement
  readonly area?: GridAreaPlacement
  readonly justifySelf?: GridItemAlignment
  readonly alignSelf?: GridItemAlignment
}

export type GridItemInput = {
  readonly nodeId: number
  readonly style: GridItemStyle
}

export type GridResolvedPlacement = {
  readonly nodeId: number
  readonly rowStart: number
  readonly rowEnd: number
  readonly columnStart: number
  readonly columnEnd: number
}

export type PlacementResult = {
  readonly items: readonly GridResolvedPlacement[]
  readonly rowCount: number
  readonly columnCount: number
}

export type GridIntrinsicContribution = {
  readonly nodeId: number
  readonly axis: GridAxis
  readonly start: number
  readonly end: number
  readonly minContent: number
  readonly maxContent: number
  readonly minimum: number
  readonly preferred: number
}

export type AxisSizingInput = {
  readonly axis: GridAxis
  readonly available: GridAvailableSpace
  readonly tracks: ExpandedTracks
  readonly gap: number
  readonly items: PlacementResult
  readonly contributions: readonly GridIntrinsicContribution[]
}

export type AxisSizingResult = {
  readonly axis: GridAxis
  readonly tracks: readonly GridTrackState[]
  readonly lines: readonly number[]
}

export type GridResolvedRect = {
  readonly nodeId: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type AlignmentInput = {
  readonly rows: AxisSizingResult
  readonly columns: AxisSizingResult
  readonly style: GridStyle
  readonly items: readonly GridResolvedPlacement[]
  readonly itemSizes: readonly GridResolvedRect[]
}

export type AlignedGrid = {
  readonly rows: AxisSizingResult
  readonly columns: AxisSizingResult
  readonly items: readonly GridResolvedPlacement[]
  readonly boxes: readonly GridResolvedRect[]
}

export type GridCalculateStats = {
  readonly intrinsicPasses: 1 | 2
  readonly cacheHit: boolean
  readonly noOp: boolean
}

export type GridCalculateResult = {
  readonly error: GridLayoutError | null
  readonly stats: GridCalculateStats
}

export type GridIntrinsicMeasureFunc = (
  axis: GridAxis,
  availableInlineWidth: number | undefined,
) => GridIntrinsicSizes

/** Normalize a complete Grid style snapshot without publishing geometry. */
export declare function normalize(style: GridStyle, nodeId: number, revision: number): GridSnapshot | GridLayoutError

/** Expand one axis's explicit and auto-repeat track list. */
export declare function expand(axis: GridAxis, tracks: readonly GridTrack[], available: GridAvailableSpace): ExpandedTracks | GridLayoutError

/** Resolve both axes' named and numbered lines after expansion. */
export declare function resolveLines(snapshot: GridSnapshot, expanded: GridExpandedAxes): GridResolvedLineSet | GridLayoutError

/** Resolve explicit and automatic item placement against both line sets. */
export declare function place(snapshot: GridSnapshot, lines: GridResolvedLineSet, items: readonly GridItemInput[]): PlacementResult | GridLayoutError

/** Size one axis from tracks, gaps, placements, and intrinsic contributions. */
export declare function sizeAxis(axis: GridAxis, input: AxisSizingInput): AxisSizingResult | GridLayoutError

/** Align resolved item boxes within the sized Grid. */
export declare function align(input: AlignmentInput): AlignedGrid | GridLayoutError

/** Copy the already-resolved local boxes; this function does not invent rects. */
export declare function writeback(input: AlignedGrid): readonly GridResolvedRect[]
