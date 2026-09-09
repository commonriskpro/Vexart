import type { GridErrorCode, GridLayoutError } from "./grid-model"

/** Complete, stable error-code inventory for the Grid pipeline. */
export const GRID_ERROR_CODES = [
  "GRID_INVALID_VALUE",
  "GRID_INVALID_TRACK",
  "GRID_INVALID_REPEAT",
  "GRID_TRACK_LIMIT",
  "GRID_INVALID_AREA",
  "GRID_CONFLICTING_PLACEMENT",
  "GRID_INVALID_PLACEMENT",
  "GRID_LINE_UNRESOLVED",
  "GRID_UNSUPPORTED_ALIGNMENT",
  "GRID_MEASURE_INVALID",
] as const satisfies readonly GridErrorCode[]

/** Create the structured error published by every Grid stage. */
export function createGridError(code: GridErrorCode, path: string, nodeId: number): GridLayoutError {
  return Object.freeze({ code, path, nodeId })
}

/** Narrow an unknown stage result without relying on an error message. */
export function isGridLayoutError(value: unknown): value is GridLayoutError {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.code === "string" &&
    (GRID_ERROR_CODES as readonly string[]).includes(candidate.code) &&
    typeof candidate.path === "string" &&
    typeof candidate.nodeId === "number"
  )
}
