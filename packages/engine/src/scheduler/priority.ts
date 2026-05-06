/**
 * priority.ts — Task priority lane constants.
 *
 * Three lanes are drained in order during each frame's budget window:
 *   1. user-blocking  — Never skipped. Runs even if budget is exceeded.
 *   2. user-visible   — Runs until budget is exceeded; may split across frames.
 *   3. background     — Runs only when no interaction/dirty state detected.
 *
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Priority Queue
 */

/** Lane order constants — lower index = higher priority. */
export const PRIORITY_LANES = [
  "user-blocking",
  "user-visible",
  "background",
] as const

/** Task priority lane identifier — derived from PRIORITY_LANES. */
export type TaskPriority = (typeof PRIORITY_LANES)[number]
