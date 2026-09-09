/**
 * Grid-template-area indexing.
 *
 * The area matrix is part of the explicit grid.  A name is useful only when
 * every occurrence of that name forms one rectangle; disconnected names are
 * rejected here rather than being silently ignored by placement.
 */

import type { GridLayoutError } from "./grid-model"
import { createGridError } from "./grid-errors"

export const GRID_AREA_LIMIT = 1024

/** Zero-based, end-exclusive coordinates for one named template area. */
export type GridAreaRect = {
  readonly rowStart: number
  readonly rowEnd: number
  readonly columnStart: number
  readonly columnEnd: number
}

export type GridAreaMap = ReadonlyMap<string, GridAreaRect>

type AreaResult = GridAreaMap | GridLayoutError

const RESERVED_NAMES = new Set(["auto", "default", "none", "span", "subgrid", "masonry"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAreaMap(value: unknown): value is GridAreaMap {
  return isRecord(value) && typeof (value as { readonly get?: unknown }).get === "function"
}

/** The same restricted name grammar used by grid normalization. */
export function isGridAreaName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) return false
  return !RESERVED_NAMES.has(value.toLowerCase())
}

function areaError(code: "GRID_INVALID_AREA" | "GRID_TRACK_LIMIT", path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

/**
 * Build the named-area index from a complete template matrix.
 *
 * The return value is either a map keyed by area name or a structured Grid
 * error.  It deliberately does not add tracks, resolve item placement, or
 * calculate track sizes.
 */
export function resolveAreas(
  value: unknown,
  nodeId = 0,
  path = "areas",
): AreaResult {
  if (!Array.isArray(value)) return areaError("GRID_INVALID_AREA", path, nodeId)
  if (value.length > GRID_AREA_LIMIT) return areaError("GRID_TRACK_LIMIT", path, nodeId)
  if (value.length === 0) return new Map()

  const first = value[0]
  if (!Array.isArray(first)) return areaError("GRID_INVALID_AREA", `${path}[0]`, nodeId)
  const width = first.length
  if (width > GRID_AREA_LIMIT) return areaError("GRID_TRACK_LIMIT", path, nodeId)

  const cells = new Map<string, Array<[number, number]>>()
  for (let row = 0; row < value.length; row++) {
    const line = value[row]
    if (!Array.isArray(line) || line.length !== width) return areaError("GRID_INVALID_AREA", `${path}[${row}]`, nodeId)

    for (let column = 0; column < width; column++) {
      const cell = line[column]
      if (cell === null) continue
      if (!isGridAreaName(cell)) return areaError("GRID_INVALID_AREA", `${path}[${row}][${column}]`, nodeId)
      const entries = cells.get(cell)
      if (entries) entries.push([row, column])
      else cells.set(cell, [[row, column]])
    }
  }

  const areas = new Map<string, GridAreaRect>()
  for (const [name, entries] of cells) {
    let minRow = entries[0][0]
    let maxRow = minRow
    let minColumn = entries[0][1]
    let maxColumn = minColumn
    for (let index = 1; index < entries.length; index++) {
      const [row, column] = entries[index]
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      minColumn = Math.min(minColumn, column)
      maxColumn = Math.max(maxColumn, column)
    }

    const expected = (maxRow - minRow + 1) * (maxColumn - minColumn + 1)
    if (expected !== entries.length) return areaError("GRID_INVALID_AREA", `${path}[name=${name}]`, nodeId)
    areas.set(name, Object.freeze({
      rowStart: minRow,
      rowEnd: maxRow + 1,
      columnStart: minColumn,
      columnEnd: maxColumn + 1,
    }))
  }

  return areas
}

/** Alias kept explicit for callers that distinguish a template from an item area. */
export const indexAreas = resolveAreas
export const resolveGridAreas = resolveAreas

/**
 * Look up one named area in an already indexed map or template matrix.
 * Unknown names are line-resolution failures, not an empty placement.
 */
export function resolveArea(
  areas: GridAreaMap | readonly (readonly (string | null)[])[],
  name: string,
  nodeId = 0,
  path = "areas",
): GridAreaRect | GridLayoutError {
  const index = isAreaMap(areas) ? areas : resolveAreas(areas, nodeId, path)
  if (!isAreaMap(index)) return index
  const rect = index.get(name)
  return rect ?? createGridError("GRID_LINE_UNRESOLVED", `${path}[name=${name}]`, nodeId)
}

/** Return explicit-grid dimensions contributed by a template matrix. */
export function areaDimensions(
  areas: GridAreaMap | readonly (readonly (string | null)[])[],
  nodeId = 0,
  path = "areas",
): { readonly rows: number; readonly columns: number } | GridLayoutError {
  if (areas instanceof Map) {
    let rows = 0
    let columns = 0
    for (const rect of areas.values()) {
      rows = Math.max(rows, rect.rowEnd)
      columns = Math.max(columns, rect.columnEnd)
    }
    return { rows, columns }
  }
  if (!Array.isArray(areas)) return areaError("GRID_INVALID_AREA", path, nodeId)
  if (areas.length > GRID_AREA_LIMIT) return areaError("GRID_TRACK_LIMIT", path, nodeId)
  if (areas.length === 0) return { rows: 0, columns: 0 }
  if (!Array.isArray(areas[0])) return areaError("GRID_INVALID_AREA", `${path}[0]`, nodeId)
  const columns = areas[0].length
  if (columns > GRID_AREA_LIMIT) return areaError("GRID_TRACK_LIMIT", path, nodeId)
  for (let row = 0; row < areas.length; row++) {
    if (!Array.isArray(areas[row]) || areas[row].length !== columns) return areaError("GRID_INVALID_AREA", `${path}[${row}]`, nodeId)
  }
  return { rows: areas.length, columns }
}
