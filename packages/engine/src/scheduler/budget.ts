/**
 * budget.ts — Frame budget tracker.
 *
 * Measures elapsed time since the start of a frame and reports whether
 * remaining budget is available for lower-priority tasks.
 *
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Priority Queue
 */

/** Default per-frame budget in milliseconds. */
export const DEFAULT_BUDGET_MS = 12

/**
 * Tracks elapsed time since frame start to determine if remaining
 * budget is available for user-visible or background tasks.
 */
export type BudgetTracker = {
  /** Elapsed milliseconds since the tracker was created. */
  elapsed: () => number
  /** True if remaining budget > 0. */
  hasRemaining: () => boolean
  /** Remaining budget in milliseconds (may be negative if over budget). */
  remaining: () => number
}

/**
 * Create a BudgetTracker for a single frame.
 *
 * @param budgetMs — Frame budget in milliseconds. Default: DEFAULT_BUDGET_MS.
 * @returns A BudgetTracker bound to the current timestamp.
 */
export function createBudgetTracker(budgetMs = DEFAULT_BUDGET_MS): BudgetTracker {
  const start = performance.now()
  return {
    elapsed: () => performance.now() - start,
    hasRemaining: () => performance.now() - start < budgetMs,
    remaining: () => budgetMs - (performance.now() - start),
  }
}
