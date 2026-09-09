/**
 * Internal Grid model seam.
 *
 * This module has no dependency on Vexart or the engine package. It only
 * describes the values exchanged by the future Grid normalization, placement,
 * and sizing stages. Public input validation belongs to grid-normalize.ts;
 * this file intentionally does not turn invalid numbers into fallbacks.
 */

// ── Value vocabulary ─────────────────────────────────────────────────────────

export type GridPercent = { readonly percent: number }
export type GridFr = { readonly fr: number }
export type GridBreadth =
  | number
  | GridPercent
  | "auto"
  | "min-content"
  | "max-content"
export type GridMaxBreadth = GridBreadth | GridFr
export type GridMinMax = { readonly minmax: readonly [GridBreadth, GridMaxBreadth] }
export type GridFitContent = { readonly fitContent: number | GridPercent }
export type GridRepeatCount = number | "auto-fill" | "auto-fit"
export type GridTrackSize = GridBreadth | GridFr | GridMinMax | GridFitContent
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

export type GridLineRef =
  | number
  | { readonly name: string; readonly occurrence?: number }
  | { readonly span: number; readonly name?: string }
export type GridPlacement = {
  readonly start?: GridLineRef | "auto"
  readonly end?: GridLineRef | "auto"
}
export type GridAreaPlacement =
  | string
  | {
      readonly rowStart: GridLineRef | "auto"
      readonly columnStart: GridLineRef | "auto"
      readonly rowEnd: GridLineRef | "auto"
      readonly columnEnd: GridLineRef | "auto"
    }
export type GridAutoFlow = "row" | "column" | "row-dense" | "column-dense"
export type GridContentAlignment =
  | "start"
  | "end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch"
export type GridItemAlignment = "start" | "end" | "center" | "stretch"
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
export type GridLayoutError = {
  readonly code: GridErrorCode
  readonly path: string
  readonly nodeId: number
}

// ── Cross-stage model ────────────────────────────────────────────────────────

export type GridAxis = "columns" | "rows"

export type GridAvailableSpace =
  | { readonly kind: "definite"; readonly px: number }
  | { readonly kind: "indefinite"; readonly constraint: "min-content" | "max-content" }

/** All intrinsic values are px; no character-cell or percentage values cross this seam. */
export type GridIntrinsicSizes = {
  readonly minContent: number
  readonly maxContent: number
  readonly minimum: number
  readonly preferred: number
}

/** Track fields are solver state; track arrays crossing stages remain readonly. */
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

/** Zero-based line indices with an end-exclusive boundary. */
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

/** One item's contribution for one axis and one zero-based end-exclusive span. */
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

// ── Per-node reusable scratch ────────────────────────────────────────────────

/**
 * Scratch is deliberately the only mutable container in this seam. A factory
 * creates one instance per Node; reset clears arrays in place so a subsequent
 * calculation reuses capacity without sharing data between Nodes.
 */
export type GridScratch = {
  readonly expandedColumns: GridTrackState[]
  readonly expandedRows: GridTrackState[]
  readonly columnPositions: number[]
  readonly rowPositions: number[]
  readonly placements: GridResolvedPlacement[]
  readonly contributions: GridIntrinsicContribution[]
  readonly itemSizes: GridResolvedRect[]
  readonly boxes: GridResolvedRect[]
}

export function createGridScratch(): GridScratch {
  return {
    expandedColumns: [],
    expandedRows: [],
    columnPositions: [],
    rowPositions: [],
    placements: [],
    contributions: [],
    itemSizes: [],
    boxes: [],
  }
}

export function resetGridScratch(scratch: GridScratch): void {
  scratch.expandedColumns.length = 0
  scratch.expandedRows.length = 0
  scratch.columnPositions.length = 0
  scratch.rowPositions.length = 0
  scratch.placements.length = 0
  scratch.contributions.length = 0
  scratch.itemSizes.length = 0
  scratch.boxes.length = 0
}

// ── Empty model constructors ─────────────────────────────────────────────────
// These are structural constructors only. They do not validate public values,
// resolve lines, size tracks, place items, or create layout rectangles.

export function createEmptyExpandedTracks(axis: GridAxis, explicitCount = 0): ExpandedTracks {
  return { axis, tracks: [], explicitCount }
}

export function createExpandedTracks(axis: GridAxis, tracks: readonly GridTrackState[], explicitCount: number): ExpandedTracks {
  return { axis, tracks, explicitCount }
}

export function createEmptyResolvedLines(axis: GridAxis, explicitCount = 0): ResolvedLines {
  return { axis, positions: [], names: new Map(), explicitCount }
}

export function createResolvedLines(
  axis: GridAxis,
  positions: readonly number[],
  names: ReadonlyMap<string, readonly number[]>,
  explicitCount: number,
): ResolvedLines {
  return { axis, positions, names, explicitCount }
}

export function createEmptyPlacementResult(rowCount = 0, columnCount = 0): PlacementResult {
  return { items: [], rowCount, columnCount }
}

export function createExpandedAxes(columns: ExpandedTracks, rows: ExpandedTracks): GridExpandedAxes {
  return { columns, rows }
}

export function createResolvedLineSet(columns: ResolvedLines, rows: ResolvedLines): GridResolvedLineSet {
  return { columns, rows }
}
