/**
 * budget.test.ts — Unit tests for BudgetTracker.
 *
 * Tests pure timing logic without any FFI or GPU dependencies.
 */

import { describe, test, expect } from "bun:test"
import { createBudgetTracker, DEFAULT_BUDGET_MS } from "./budget"

describe("DEFAULT_BUDGET_MS", () => {
  test("is 12ms", () => {
    expect(DEFAULT_BUDGET_MS).toBe(12)
  })
})

describe("createBudgetTracker", () => {
  test("hasRemaining returns true immediately after creation", () => {
    const tracker = createBudgetTracker(100)
    expect(tracker.hasRemaining()).toBe(true)
  })

  test("elapsed starts near zero", () => {
    const tracker = createBudgetTracker()
    expect(tracker.elapsed()).toBeGreaterThanOrEqual(0)
    expect(tracker.elapsed()).toBeLessThan(50)
  })

  test("remaining starts near budgetMs", () => {
    const tracker = createBudgetTracker(100)
    const rem = tracker.remaining()
    expect(rem).toBeGreaterThan(50)
    expect(rem).toBeLessThanOrEqual(100)
  })

  test("hasRemaining returns false after budget expires", async () => {
    const tracker = createBudgetTracker(1) // 1ms budget
    await new Promise((r) => setTimeout(r, 10)) // wait 10ms
    expect(tracker.hasRemaining()).toBe(false)
  })

  test("remaining is negative after budget expires", async () => {
    const tracker = createBudgetTracker(1)
    await new Promise((r) => setTimeout(r, 10))
    expect(tracker.remaining()).toBeLessThan(0)
  })

  test("uses DEFAULT_BUDGET_MS when no argument given", () => {
    const tracker = createBudgetTracker()
    // Just after creation: remaining should be close to DEFAULT_BUDGET_MS
    expect(tracker.remaining()).toBeGreaterThan(0)
    expect(tracker.remaining()).toBeLessThanOrEqual(DEFAULT_BUDGET_MS)
  })
})
