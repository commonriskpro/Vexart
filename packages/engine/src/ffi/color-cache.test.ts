import { describe, expect, test } from "bun:test"
import { parseColor, clearColorCache, getColorCacheSizeForTest } from "./node"

describe("color cache lifecycle and eviction", () => {
  test("clearColorCache empties the cache", () => {
    clearColorCache()
    expect(getColorCacheSizeForTest()).toBe(0)

    parseColor("#ff0000")
    parseColor("#00ff00")
    expect(getColorCacheSizeForTest()).toBe(2)

    clearColorCache()
    expect(getColorCacheSizeForTest()).toBe(0)
  })

  test("color cache is capped at 1024 entries with FIFO eviction", () => {
    clearColorCache()

    // Fill the cache to capacity (1024 entries)
    for (let i = 0; i < 1024; i++) {
      const hex = `#${i.toString(16).padStart(6, "0")}`
      parseColor(hex)
    }
    expect(getColorCacheSizeForTest()).toBe(1024)

    // Oldest entry (#000000) is in cache
    // Inserting the 1025th entry should evict the oldest entry (#000000)
    parseColor("#abcdef")
    expect(getColorCacheSizeForTest()).toBe(1024)

    // Inserting another entry evicts the next oldest (#000001)
    parseColor("#fedcba")
    expect(getColorCacheSizeForTest()).toBe(1024)

    // Numbers and undefined do not pollute the string cache
    parseColor(0x12345678)
    parseColor(undefined)
    expect(getColorCacheSizeForTest()).toBe(1024)

    clearColorCache()
    expect(getColorCacheSizeForTest()).toBe(0)
  })
})
