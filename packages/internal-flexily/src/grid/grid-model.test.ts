import { describe, expect, it } from "bun:test"
import type {
  AxisSizingInput,
  GridAvailableSpace,
  GridIntrinsicContribution,
  GridIntrinsicSizes,
  GridResolvedPlacement,
  GridStyle,
  GridTrackState,
  GridAxis,
  ExpandedTracks,
  PlacementResult,
} from "./grid-model"
import {
  createEmptyExpandedTracks,
  createEmptyPlacementResult,
  createEmptyResolvedLines,
  createExpandedAxes,
  createExpandedTracks,
  createGridScratch,
  createResolvedLineSet,
  createResolvedLines,
  resetGridScratch,
} from "./grid-model"

const style: GridStyle = {
  columns: [80],
  rows: ["auto"],
  autoColumns: "auto",
  autoRows: "auto",
  autoFlow: "row",
  areas: [],
  gap: 4,
  justifyContent: "start",
  alignContent: "stretch",
  justifyItems: "stretch",
  alignItems: "stretch",
}

const track: GridTrackState = {
  min: 80,
  max: { fr: 1 },
  base: 80,
  growthLimit: 160,
  offset: 0,
}

const placement: GridResolvedPlacement = {
  nodeId: 7,
  rowStart: 0,
  rowEnd: 1,
  columnStart: 1,
  columnEnd: 3,
}

const available: GridAvailableSpace = { kind: "definite", px: 300 }
const intrinsic: GridIntrinsicSizes = {
  minContent: 12,
  maxContent: 72,
  minimum: 12,
  preferred: 36,
}
const contribution: GridIntrinsicContribution = {
  nodeId: 7,
  axis: "columns",
  start: 1,
  end: 3,
  minContent: intrinsic.minContent,
  maxContent: intrinsic.maxContent,
  minimum: intrinsic.minimum,
  preferred: intrinsic.preferred,
}

const tracks: ExpandedTracks = createExpandedTracks("columns", [track], 1)
const placements: PlacementResult = { items: [placement], rowCount: 1, columnCount: 3 }
const sizingInput: AxisSizingInput = {
  axis: "columns",
  available,
  tracks,
  gap: 10,
  items: placements,
  contributions: [contribution],
}

// Compile-only guards: validity of these numbers is a later normalization step.
const indefinite: GridAvailableSpace = { kind: "indefinite", constraint: "min-content" }
const negativeSpanForModel: GridResolvedPlacement = { ...placement, rowStart: 0, rowEnd: 0 }
void sizingInput
void indefinite
void negativeSpanForModel

// @ts-expect-error The resolved track list crossing stages is readonly.
if (false) tracks.tracks.push(track)
// @ts-expect-error A resolved placement cannot be mutated after crossing a stage.
if (false) placement.columnStart = 0

describe("Grid model seam", () => {
  it("constructs empty explicit and implicit axis models without normalization", () => {
    const explicit = createEmptyExpandedTracks("columns")
    const implicit = createExpandedTracks("rows", [track], 0)
    const emptyLines = createEmptyResolvedLines("rows")
    const lines = createResolvedLines("columns", [0, 80], new Map([["main", [0]]]), 1)
    const axes = createExpandedAxes(explicit, implicit)
    const lineSet = createResolvedLineSet(lines, emptyLines)
    const emptyPlacement = createEmptyPlacementResult()

    expect(explicit).toEqual({ axis: "columns", tracks: [], explicitCount: 0 })
    expect(implicit.explicitCount).toBe(0)
    expect(emptyLines.positions).toHaveLength(0)
    expect(lines.positions).toEqual([0, 80])
    expect(lines.names.get("main")).toEqual([0])
    expect(axes.rows.axis).toBe("rows")
    expect(lineSet.columns.axis).toBe("columns")
    expect(emptyPlacement).toEqual({ items: [], rowCount: 0, columnCount: 0 })
  })

  it("keeps zero-based, end-exclusive spans and px intrinsic values explicit", () => {
    expect(placement).toEqual({ nodeId: 7, rowStart: 0, rowEnd: 1, columnStart: 1, columnEnd: 3 })
    expect(placement.columnEnd - placement.columnStart).toBe(2)
    expect(available).toEqual({ kind: "definite", px: 300 })
    expect(intrinsic).toEqual({ minContent: 12, maxContent: 72, minimum: 12, preferred: 36 })
    expect(contribution.end - contribution.start).toBe(2)
  })

  it("reuses each node's scratch arrays without sharing them between nodes", () => {
    const first = createGridScratch()
    const second = createGridScratch()
    const firstColumns = first.expandedColumns
    const firstPlacements = first.placements
    first.expandedColumns.push(track)
    first.placements.push(placement)

    resetGridScratch(first)
    expect(first.expandedColumns).toBe(firstColumns)
    expect(first.placements).toBe(firstPlacements)
    expect(first.expandedColumns).toHaveLength(0)
    expect(first.placements).toHaveLength(0)
    expect(second.expandedColumns).not.toBe(first.expandedColumns)
    expect(second.placements).not.toBe(first.placements)
    expect(second.expandedColumns).toHaveLength(0)
    expect(second.placements).toHaveLength(0)
  })

  it("keeps a complete snapshot style and revision as immutable DTO data", () => {
    const snapshot = { nodeId: 42, revision: 3, style }
    expect(snapshot.nodeId).toBe(42)
    expect(snapshot.revision).toBe(3)
    expect(snapshot.style.columns).toEqual([80])
    expect(snapshot.style.rows).toEqual(["auto"])
  })
})
