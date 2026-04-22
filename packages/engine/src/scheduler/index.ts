/**
 * index.ts — 3-priority frame budget scheduler.
 *
 * Implements the priority-queue scheduler described in the design doc.
 * Three lanes are drained per frame in priority order:
 *   1. user-blocking  — Always runs. Never deferred.
 *   2. user-visible   — Runs up to the frame budget. May split across frames.
 *   3. background     — Runs only when no input/dirty state is detected (idle).
 *
 * Usage:
 *   const scheduler = createFrameScheduler()
 *   scheduler.scheduleTask("user-blocking", () => applyFocusChange())
 *   scheduler.scheduleTask("background", () => prefetchData())
 *   // Each frame:
 *   scheduler.drainFrame(12)  // drain with 12ms budget
 *
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Priority Queue
 */

import type { TaskPriority } from "./priority"
import { createBudgetTracker } from "./budget"

// ── Task type ─────────────────────────────────────────────────────────────

type Task = {
  id: number
  priority: TaskPriority
  fn: () => void
}

// ── FrameScheduler ────────────────────────────────────────────────────────

export type FrameScheduler = {
  /**
   * Add a task to the scheduler queue.
   * Returns a cancel function — call it before the task runs to remove it.
   */
  scheduleTask: (priority: TaskPriority, fn: () => void) => () => void

  /**
   * Drain queues in priority order within the given budget.
   *
   * - `user-blocking` tasks ALWAYS run (ignores budget).
   * - `user-visible` tasks run until budget is exceeded.
   * - `background` tasks run only when `isIdle()` returns true and budget remains.
   *
   * @param budgetMs  — Per-frame time budget in ms. Default: 12.
   * @param isIdle    — Optional predicate: returns true when no interaction/dirty
   *                    state is active. Background tasks are gated on this.
   */
  drainFrame: (budgetMs?: number, isIdle?: () => boolean) => void

  /** Returns the total number of pending tasks across all lanes. */
  pendingCount: () => number

  /** Returns the number of pending tasks in a specific lane. */
  pendingInLane: (priority: TaskPriority) => number

  /** Remove all pending tasks in all lanes. */
  clear: () => void
}

/**
 * Create a new FrameScheduler instance.
 *
 * The scheduler is stateful — it maintains three queues that persist across
 * frames. The coordinator calls `drainFrame()` each tick.
 */
export function createFrameScheduler(): FrameScheduler {
  const userBlocking: Task[] = []
  const userVisible: Task[] = []
  const background: Task[] = []
  let nextId = 1

  function laneFor(priority: TaskPriority): Task[] {
    if (priority === "user-blocking") return userBlocking
    if (priority === "user-visible") return userVisible
    return background
  }

  function scheduleTask(priority: TaskPriority, fn: () => void): () => void {
    const id = nextId++
    const task: Task = { id, priority, fn }
    laneFor(priority).push(task)
    return () => {
      const lane = laneFor(priority)
      const idx = lane.findIndex((t) => t.id === id)
      if (idx >= 0) lane.splice(idx, 1)
    }
  }

  function drainLane(lane: Task[], budget?: BudgetTrackerRef): void {
    while (lane.length > 0) {
      if (budget && !budget.hasRemaining()) break
      const task = lane.shift()!
      task.fn()
    }
  }

  function drainFrame(budgetMs = 12, isIdle?: () => boolean): void {
    // user-blocking: always drain, no budget gate
    drainLane(userBlocking)

    // user-visible: drain up to budget
    const tracker = createBudgetTracker(budgetMs)
    drainLane(userVisible, tracker)

    // background: only when idle and budget remains
    if (background.length > 0 && tracker.hasRemaining() && (!isIdle || isIdle())) {
      drainLane(background, tracker)
    }
  }

  function pendingCount(): number {
    return userBlocking.length + userVisible.length + background.length
  }

  function pendingInLane(priority: TaskPriority): number {
    return laneFor(priority).length
  }

  function clear(): void {
    userBlocking.length = 0
    userVisible.length = 0
    background.length = 0
  }

  return { scheduleTask, drainFrame, pendingCount, pendingInLane, clear }
}

// ── Internal helper type ──────────────────────────────────────────────────

type BudgetTrackerRef = {
  hasRemaining: () => boolean
}
