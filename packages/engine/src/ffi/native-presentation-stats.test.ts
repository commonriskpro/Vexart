import { describe, expect, it } from "bun:test"
import {
  decodeNativePresentationStats,
  formatNativeStats,
  NATIVE_STATS_BYTE_SIZE,
  NATIVE_STATS_FLAG,
  NATIVE_STATS_MODE,
  NATIVE_STATS_TRANSPORT,
} from "./native-presentation-stats"

describe("native-presentation-stats", () => {
  it("decodes the 64-byte native stats struct", () => {
    const buf = new Uint8Array(NATIVE_STATS_BYTE_SIZE)
    const view = new DataView(buf.buffer)
    view.setUint32(0, 1, true)
    view.setUint32(4, NATIVE_STATS_MODE.REGION, true)
    view.setUint32(8, 0, true)
    view.setUint32(16, 4096, true)
    view.setUint32(24, 12, true)
    view.setUint32(32, 34, true)
    view.setUint32(40, 56, true)
    view.setUint32(48, 78, true)
    view.setUint32(56, NATIVE_STATS_TRANSPORT.SHM, true)
    view.setUint32(60, NATIVE_STATS_FLAG.NATIVE_USED | NATIVE_STATS_FLAG.VALID, true)

    const stats = decodeNativePresentationStats(buf)

    expect(stats?.mode).toBe(NATIVE_STATS_MODE.REGION)
    expect(stats?.rgbaBytesRead).toBe(0)
    expect(stats?.kittyBytesEmitted).toBe(4096)
    expect(stats?.readbackUs).toBe(12)
    expect(stats?.encodeUs).toBe(34)
    expect(stats?.writeUs).toBe(56)
    expect(stats?.totalUs).toBe(78)
    expect(stats?.transport).toBe(NATIVE_STATS_TRANSPORT.SHM)
  })

  it("returns null for an uninitialized stats buffer", () => {
    expect(decodeNativePresentationStats(new Uint8Array(NATIVE_STATS_BYTE_SIZE))).toBeNull()
  })

  it("formats native stats for debug output", () => {
    const stats = {
      version: 1,
      mode: NATIVE_STATS_MODE.LAYER,
      rgbaBytesRead: 0,
      kittyBytesEmitted: 1024,
      readbackUs: 10,
      encodeUs: 20,
      writeUs: 0,
      totalUs: 30,
      transport: NATIVE_STATS_TRANSPORT.SHM,
      flags: NATIVE_STATS_FLAG.NATIVE_USED | NATIVE_STATS_FLAG.VALID,
    }

    expect(formatNativeStats(stats)).toBe("native[shm] layer rb=0B emit=1024B total=30µs")
  })
})
