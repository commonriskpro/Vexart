/**
 * Runtime validation and immutable snapshot creation for the Grid profile.
 *
 * Normalization is intentionally a pure boundary: it validates a complete
 * style, clones/freeze-protects the resulting snapshot, and does not place
 * items, size tracks, emit rectangles, or fall back to Flex.
 */

import type {
  GridBreadth,
  GridFitContent,
  GridFr,
  GridLayoutError,
  GridMaxBreadth,
  GridMinMax,
  GridPercent,
  GridRepeatCount,
  GridSnapshot,
  GridStyle,
  GridTrack,
  GridTrackSize,
} from "./grid-model"
import { createGridError } from "./grid-errors"

export const GRID_TRACK_LIMIT = 1024

type NormalizeResult = GridSnapshot | GridLayoutError
type RecordValue = Record<string, unknown>

let cache = new WeakMap<object, Map<string, NormalizeResult>>()
let normalizeCalls = 0
let cacheHits = 0

const ALIGN_CONTENT = new Set(["start", "end", "center", "space-between", "space-around", "space-evenly", "stretch"])
const ALIGN_ITEMS = new Set(["start", "end", "center", "stretch"])
const AUTO_FLOW = new Set(["row", "column", "row-dense", "column-dense"])
const BREADTH_KEYWORDS = new Set(["auto", "min-content", "max-content"])
const RESERVED_NAMES = new Set(["auto", "default", "none", "span", "subgrid", "masonry"])

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function ownKeys(value: RecordValue): string[] {
  return Object.keys(value)
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return ownKeys(value).every((key) => expected.has(key)) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0
}

function validPercent(value: unknown): value is GridPercent {
  return record(value) && exactKeys(value, ["percent"]) && nonNegative(value.percent) && value.percent <= 100
}

function validFr(value: unknown): value is GridFr {
  return record(value) && exactKeys(value, ["fr"]) && finite(value.fr) && value.fr > 0
}

function error(code: Parameters<typeof createGridError>[0], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function validName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) return false
  return !RESERVED_NAMES.has(value.toLowerCase())
}

function validateLineNames(value: unknown, path: string, nodeId: number): GridLayoutError | null {
  if (!Array.isArray(value)) return error("GRID_INVALID_TRACK", path, nodeId)
  for (let index = 0; index < value.length; index++) {
    if (!validName(value[index])) return error("GRID_INVALID_TRACK", `${path}[${index}]`, nodeId)
  }
  return null
}

function validateBreadth(value: unknown, path: string, nodeId: number, allowFr: boolean): GridLayoutError | null {
  if (typeof value === "number") return nonNegative(value) ? null : error("GRID_INVALID_VALUE", path, nodeId)
  if (typeof value === "string") return BREADTH_KEYWORDS.has(value) ? null : error("GRID_INVALID_TRACK", path, nodeId)
  if (validPercent(value)) return null
  if (allowFr && validFr(value)) return null
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "fr")) return error("GRID_INVALID_VALUE", path, nodeId)
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "percent")) return error("GRID_INVALID_VALUE", path, nodeId)
  return error("GRID_INVALID_TRACK", path, nodeId)
}

function validateMinMax(value: RecordValue, path: string, nodeId: number): GridLayoutError | null {
  if (!exactKeys(value, ["minmax"]) || !Array.isArray(value.minmax) || value.minmax.length !== 2) {
    return error("GRID_INVALID_TRACK", path, nodeId)
  }
  const minimumError = validateBreadth(value.minmax[0], `${path}.minmax[0]`, nodeId, false)
  if (minimumError) return minimumError
  return validateBreadth(value.minmax[1], `${path}.minmax[1]`, nodeId, true)
}

function validateFitContent(value: RecordValue, path: string, nodeId: number): GridLayoutError | null {
  if (!exactKeys(value, ["fitContent"])) return error("GRID_INVALID_TRACK", path, nodeId)
  const size = value.fitContent
  if (nonNegative(size)) return null
  if (record(size) && Object.prototype.hasOwnProperty.call(size, "percent")) {
    return validPercent(size) ? null : error("GRID_INVALID_VALUE", `${path}.fitContent`, nodeId)
  }
  return error("GRID_INVALID_VALUE", `${path}.fitContent`, nodeId)
}

function isFixedAutoRepeatTrack(value: unknown): boolean {
  if (typeof value === "number") return nonNegative(value)
  if (validPercent(value)) return true
  if (!record(value) || !Object.prototype.hasOwnProperty.call(value, "minmax")) return false
  if (!exactKeys(value, ["minmax"]) || !Array.isArray(value.minmax) || value.minmax.length !== 2) return false
  const minimum = value.minmax[0]
  const maximum = value.minmax[1]
  return (typeof minimum === "number" && nonNegative(minimum) || validPercent(minimum)) && validFr(maximum) && maximum.fr === 1
}

function validateTrack(
  value: unknown,
  path: string,
  nodeId: number,
  state: { repeatDepth: number; autoRepeatCount: number },
): GridLayoutError | null {
  if (validFr(value)) return null
  const breadthError = validateBreadth(value, path, nodeId, false)
  if (breadthError === null) return null
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    validPercent(value) ||
    validFr(value) ||
    (record(value) && (Object.prototype.hasOwnProperty.call(value, "percent") || Object.prototype.hasOwnProperty.call(value, "fr")))
  ) {
    // A value with a known scalar form failed only its scalar constraints.
    return breadthError
  }
  if (!record(value)) return error("GRID_INVALID_TRACK", path, nodeId)

  if (Object.prototype.hasOwnProperty.call(value, "minmax")) return validateMinMax(value, path, nodeId)
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) return validateFitContent(value, path, nodeId)

  if (Object.prototype.hasOwnProperty.call(value, "size")) {
    if (!ownKeys(value).every((key) => key === "size" || key === "before" || key === "after")) return error("GRID_INVALID_TRACK", path, nodeId)
    if (value.before !== undefined) {
      const beforeError = validateLineNames(value.before, `${path}.before`, nodeId)
      if (beforeError) return beforeError
    }
    if (value.after !== undefined) {
      const afterError = validateLineNames(value.after, `${path}.after`, nodeId)
      if (afterError) return afterError
    }
    return validateTrack(value.size, `${path}.size`, nodeId, state)
  }

  if (Object.prototype.hasOwnProperty.call(value, "repeat")) {
    if (state.repeatDepth > 0 || !exactKeys(value, ["repeat"]) || !record(value.repeat)) {
      return error("GRID_INVALID_REPEAT", path, nodeId)
    }
    const repeat = value.repeat
    if (!exactKeys(repeat, ["count", "tracks"]) || !Array.isArray(repeat.tracks) || repeat.tracks.length === 0) {
      return error("GRID_INVALID_REPEAT", path, nodeId)
    }
    const count = repeat.count
    if (typeof count === "number") {
      if (!Number.isInteger(count) || count < 1) return error("GRID_INVALID_REPEAT", `${path}.repeat.count`, nodeId)
      if (count * repeat.tracks.length > GRID_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", path, nodeId)
    } else if (count === "auto-fill" || count === "auto-fit") {
      state.autoRepeatCount++
      if (state.autoRepeatCount > 1 || repeat.tracks.length !== 1 || !isFixedAutoRepeatTrack(repeat.tracks[0])) {
        return error("GRID_INVALID_REPEAT", path, nodeId)
      }
    } else {
      return error("GRID_INVALID_REPEAT", `${path}.repeat.count`, nodeId)
    }
    const nestedState = { repeatDepth: state.repeatDepth + 1, autoRepeatCount: state.autoRepeatCount }
    for (let index = 0; index < repeat.tracks.length; index++) {
      const trackError = validateTrack(repeat.tracks[index], `${path}.repeat.tracks[${index}]`, nodeId, nestedState)
      if (trackError) return trackError
    }
    return null
  }

  return error("GRID_INVALID_TRACK", path, nodeId)
}

function validateTrackList(value: unknown, path: string, nodeId: number): GridLayoutError | null {
  if (!Array.isArray(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  const state = { repeatDepth: 0, autoRepeatCount: 0 }
  let expandedCount = 0
  for (let index = 0; index < value.length; index++) {
    const track = value[index]
    const trackError = validateTrack(track, `${path}[${index}]`, nodeId, state)
    if (trackError) return trackError
    if (record(track) && Object.prototype.hasOwnProperty.call(track, "repeat") && record(track.repeat) && typeof track.repeat.count === "number") {
      expandedCount += track.repeat.count * (Array.isArray(track.repeat.tracks) ? track.repeat.tracks.length : 0)
    } else {
      expandedCount++
    }
    if (expandedCount > GRID_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", path, nodeId)
  }
  return null
}

function validateTrackSize(value: unknown, path: string, nodeId: number): GridLayoutError | null {
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "repeat")) return error("GRID_INVALID_TRACK", path, nodeId)
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "size")) return error("GRID_INVALID_TRACK", path, nodeId)
  return validateTrack(value, path, nodeId, { repeatDepth: 0, autoRepeatCount: 0 })
}

function validateAreas(value: unknown, path: string, nodeId: number): GridLayoutError | null {
  if (!Array.isArray(value)) return error("GRID_INVALID_AREA", path, nodeId)
  if (value.length === 0) return null
  if (!Array.isArray(value[0])) return error("GRID_INVALID_AREA", `${path}[0]`, nodeId)
  const width = value[0].length
  if (value.length > GRID_TRACK_LIMIT || width > GRID_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", path, nodeId)
  const cells = new Map<string, Array<[number, number]>>()
  for (let row = 0; row < value.length; row++) {
    const line = value[row]
    if (!Array.isArray(line) || line.length !== width) return error("GRID_INVALID_AREA", `${path}[${row}]`, nodeId)
    for (let column = 0; column < line.length; column++) {
      const cell = line[column]
      if (cell === null) continue
      if (!validName(cell)) return error("GRID_INVALID_AREA", `${path}[${row}][${column}]`, nodeId)
      const entries = cells.get(cell) ?? []
      entries.push([row, column])
      cells.set(cell, entries)
    }
  }
  for (const [name, entries] of cells) {
    const rows = entries.map(([row]) => row)
    const columns = entries.map(([, column]) => column)
    const minRow = Math.min(...rows)
    const maxRow = Math.max(...rows)
    const minColumn = Math.min(...columns)
    const maxColumn = Math.max(...columns)
    if ((maxRow - minRow + 1) * (maxColumn - minColumn + 1) !== entries.length) {
      return error("GRID_INVALID_AREA", `${path}[name=${name}]`, nodeId)
    }
  }
  return null
}

function validateStyle(style: unknown, nodeId: number): GridLayoutError | null {
  if (!record(style)) return error("GRID_INVALID_VALUE", "style", nodeId)
  const columnsError = validateTrackList(style.columns, "columns", nodeId)
  if (columnsError) return columnsError
  const rowsError = validateTrackList(style.rows, "rows", nodeId)
  if (rowsError) return rowsError
  const autoColumnsError = validateTrackSize(style.autoColumns, "autoColumns", nodeId)
  if (autoColumnsError) return autoColumnsError
  const autoRowsError = validateTrackSize(style.autoRows, "autoRows", nodeId)
  if (autoRowsError) return autoRowsError
  const autoFlow = style.autoFlow
  if (typeof autoFlow !== "string") return error("GRID_INVALID_VALUE", "autoFlow", nodeId)
  if (!AUTO_FLOW.has(autoFlow as string)) return error("GRID_INVALID_VALUE", "gridAutoFlow", nodeId)
  const areasError = validateAreas(style.areas, "areas", nodeId)
  if (areasError) return areasError
  if (!nonNegative(style.gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  const justifyContent = style.justifyContent
  const alignContent = style.alignContent
  const justifyItems = style.justifyItems
  const alignItems = style.alignItems
  if (!ALIGN_CONTENT.has(justifyContent as string)) return error("GRID_INVALID_VALUE", "justifyContent", nodeId)
  if (!ALIGN_CONTENT.has(alignContent as string)) return error("GRID_INVALID_VALUE", "alignContent", nodeId)
  if (!ALIGN_ITEMS.has(justifyItems as string)) return error("GRID_INVALID_VALUE", "justifyItems", nodeId)
  if (!ALIGN_ITEMS.has(alignItems as string)) return error("GRID_INVALID_VALUE", "alignItems", nodeId)
  return null
}

function cloneTrack(value: GridTrack): GridTrack {
  if (typeof value === "number" || typeof value === "string") return value
  if (Object.prototype.hasOwnProperty.call(value, "percent")) return { percent: (value as GridPercent).percent }
  if (Object.prototype.hasOwnProperty.call(value, "fr")) return { fr: (value as GridFr).fr }
  if (Object.prototype.hasOwnProperty.call(value, "minmax")) {
    const minmax = (value as GridMinMax).minmax
    return {
      minmax: [cloneTrack(minmax[0]) as GridBreadth, cloneTrack(minmax[1] as GridTrack) as GridMaxBreadth],
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) {
    const fitContent = (value as GridFitContent).fitContent
    return { fitContent: typeof fitContent === "number" ? fitContent : { percent: fitContent.percent } }
  }
  if (Object.prototype.hasOwnProperty.call(value, "size")) {
    const named = value as Extract<GridTrack, { readonly size: GridTrackSize }>
    return {
      size: cloneTrack(named.size) as GridTrackSize,
      ...(named.before ? { before: [...named.before] } : {}),
      ...(named.after ? { after: [...named.after] } : {}),
    }
  }
  const repeated = value as { readonly repeat: { readonly count: GridRepeatCount; readonly tracks: readonly GridTrack[] } }
  return { repeat: { count: repeated.repeat.count, tracks: repeated.repeat.tracks.map(cloneTrack) } }
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value as object)) {
    freezeDeep((value as Record<PropertyKey, unknown>)[key])
  }
  return value
}

function cloneStyle(style: RecordValue): GridStyle {
  const columns = style.columns as readonly GridTrack[]
  const rows = style.rows as readonly GridTrack[]
  const areas = style.areas as readonly (readonly (string | null)[])[]
  return freezeDeep({
    columns: columns.map(cloneTrack),
    rows: rows.map(cloneTrack),
    autoColumns: cloneTrack(style.autoColumns as GridTrackSize) as GridTrackSize,
    autoRows: cloneTrack(style.autoRows as GridTrackSize) as GridTrackSize,
    autoFlow: style.autoFlow as GridStyle["autoFlow"],
    areas: areas.map((row) => [...row]),
    gap: style.gap as number,
    justifyContent: style.justifyContent as GridStyle["justifyContent"],
    alignContent: style.alignContent as GridStyle["alignContent"],
    justifyItems: style.justifyItems as GridStyle["justifyItems"],
    alignItems: style.alignItems as GridStyle["alignItems"],
  })
}

/** Normalize one complete style snapshot; repeated identity/revision calls hit the cache. */
export function normalize(style: GridStyle, nodeId: number, revision: number): NormalizeResult {
  normalizeCalls++
  if (record(style)) {
    const key = `${nodeId}:${revision}`
    const entries = cache.get(style)
    const cached = entries?.get(key)
    if (cached) {
      cacheHits++
      return cached
    }
    const validationError = validateStyle(style, nodeId)
    const result: NormalizeResult = validationError ?? freezeDeep({ nodeId, revision, style: cloneStyle(style) })
    const nextEntries = entries ?? new Map<string, NormalizeResult>()
    nextEntries.set(key, result)
    if (!entries) cache.set(style, nextEntries)
    return result
  }
  return error("GRID_INVALID_VALUE", "style", nodeId)
}

/** Reset normalization cache and counters between independent Node tests/runs. */
export function resetGridNormalizeStats(): void {
  cache = new WeakMap<object, Map<string, NormalizeResult>>()
  normalizeCalls = 0
  cacheHits = 0
}

/** Read cache counters without exposing mutable cache state. */
export function getGridNormalizeStats(): { readonly normalizeCalls: number; readonly cacheHits: number } {
  return Object.freeze({ normalizeCalls, cacheHits })
}
