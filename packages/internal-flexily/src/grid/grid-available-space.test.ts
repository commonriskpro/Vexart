import { describe, expect, it } from "bun:test"
import type { ExpandedTracks, GridAvailableSpace, GridIntrinsicContribution, GridTrackState } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import {
  resolveAvailableSpace,
  resolvePercentage,
  resolvePercentageTracks,
  resolvePercentages,
} from "./grid-available-space"

function axis(tracks: readonly GridTrackState[]): ExpandedTracks {
  return { axis: "columns", tracks, explicitCount: tracks.length }
}

function percent(value: number): GridTrackState {
  return { min: { percent: value }, max: { percent: value }, base: 0, growthLimit: 0, offset: 0 }
}

function contribution(maxContent: number): GridIntrinsicContribution {
  return {
    nodeId: 1,
    axis: "columns",
    start: 0,
    end: 1,
    minContent: maxContent,
    maxContent,
    minimum: maxContent,
    preferred: maxContent,
  }
}

describe("Grid available space and percentage sizing", () => {
  it("resolves percentages from the content box and subtracts the gap only from track budget", () => {
    const space = resolveAvailableSpace({
      axis: "columns",
      container: 340,
      padding: [20, 20],
      gap: 10,
      trackCount: 2,
    })
    expect(isGridLayoutError(space)).toBe(false)
    if (isGridLayoutError(space)) return
    expect(space.available).toEqual({ kind: "definite", px: 300 })
    expect(space.contentBox).toBe(300)
    expect(space.trackSpace).toBe(290)
    expect(space.origin).toBe(20)
    expect(resolvePercentage({ percent: 50 }, space.available)).toBe(150)

    const result = resolvePercentages({
      axis: "columns",
      tracks: axis([percent(50), percent(50)]),
      available: space,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks.map((track) => track.base)).toEqual([150, 150])
    expect(result.trackSpace).toBe(290)
  })

  it("uses max-content contribution for an indefinite percentage without Infinity or NaN", () => {
    const available: GridAvailableSpace = { kind: "indefinite", constraint: "max-content" }
    expect(resolvePercentage({ percent: 50 }, available, 120)).toBe(120)
    const descriptor = resolveAvailableSpace({ available, intrinsic: 120 })
    expect(isGridLayoutError(descriptor)).toBe(false)
    if (isGridLayoutError(descriptor)) return
    expect(resolvePercentage({ percent: 50 }, descriptor)).toBe(120)
    const result = resolvePercentages({
      axis: "columns",
      tracks: axis([percent(50)]),
      available,
      contributions: [contribution(120)],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    const track = result.tracks.tracks[0]
    expect(track?.base).toBe(120)
    expect(track?.growthLimit).toBe(120)
    expect(Number.isFinite(track?.base)).toBe(true)
    expect(Number.isFinite(track?.growthLimit)).toBe(true)
    expect(result.available).toEqual(available)
    expect(result.unresolved).toEqual([])
  })

  it("applies finite container min/max before removing padding and handles contradictory bounds", () => {
    const result = resolveAvailableSpace({
      axis: "columns",
      container: 500,
      padding: 10,
      min: 300,
      max: 320,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.outerSize).toBe(320)
    expect(result.contentBox).toBe(300)
    expect(result.maxSize).toBe(320)

    const contradictory = resolveAvailableSpace({ container: 100, min: 250, max: 200 })
    expect(isGridLayoutError(contradictory)).toBe(false)
    if (isGridLayoutError(contradictory)) return
    expect(contradictory.outerSize).toBe(250)
    expect(contradictory.maxSize).toBe(250)
    expect(Number.isFinite(contradictory.outerSize)).toBe(true)
  })

  it("recomputes percentage tracks when the viewport is resized", () => {
    const tracks = axis([percent(50)])
    const first = resolvePercentageTracks({ axis: "columns", tracks, available: 300 })
    const second = resolvePercentageTracks({ axis: "columns", tracks, available: 400 })
    expect(isGridLayoutError(first)).toBe(false)
    expect(isGridLayoutError(second)).toBe(false)
    if (isGridLayoutError(first) || isGridLayoutError(second)) return
    expect(first.tracks[0]?.base).toBe(150)
    expect(second.tracks[0]?.base).toBe(200)
    expect(tracks.tracks[0]?.base).toBe(0)
  })

  it("accepts a container descriptor directly at the percentage stage", () => {
    const result = resolvePercentages({
      axis: "columns",
      tracks: axis([percent(50), percent(50)]),
      available: { container: 340, padding: [20, 20], gap: 10, trackCount: 2 },
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.contentBox).toBe(300)
    expect(result.tracks.tracks.map((track) => track.base)).toEqual([150, 150])
  })

  it("rejects negative/non-finite dimensions without publishing partial state", () => {
    expect(resolveAvailableSpace({ container: -1 })).toMatchObject({ code: "GRID_INVALID_VALUE", path: "available" })
    expect(resolveAvailableSpace({ container: Infinity })).toMatchObject({ code: "GRID_INVALID_VALUE", path: "available" })
    expect(resolveAvailableSpace({ container: 100, padding: [1, -1] })).toMatchObject({ code: "GRID_INVALID_VALUE", path: "padding.1" })
    expect(resolvePercentages({
      axis: "columns",
      tracks: axis([percent(50)]),
      available: 100,
    })).not.toMatchObject({ code: "GRID_INVALID_VALUE" })
  })
})
