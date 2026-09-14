import { describe, expect, test } from "bun:test"
import { getKittyTransportStats, resetKittyTransportStats } from "./kitty"

describe("kitty transport stats", () => {
  test("tracks and resets stats for shm and direct modes", () => {
    resetKittyTransportStats()
    const stats = getKittyTransportStats()
    expect(stats.transmitCalls).toBe(0)
    expect(stats.patchCalls).toBe(0)
    expect(stats.payloadBytes).toBe(0)
    expect(stats.estimatedTtyBytes).toBe(0)
    expect(stats.byMode.shm).toBeDefined()
    expect(stats.byMode.direct).toBeDefined()
    expect((stats.byMode as Record<string, unknown>).file).toBeUndefined()
  })
})
