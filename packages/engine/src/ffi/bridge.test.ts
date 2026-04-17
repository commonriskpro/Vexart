/**
 * bridge.test.ts
 * Smoke tests for the vexart FFI bridge version handshake.
 * Per design §13.3.
 *
 * Test (a): openVexartLibrary() succeeds and vexartVersion() returns
 *           EXPECTED_BRIDGE_VERSION (0x00020000). This is a live FFI test —
 *           requires the dylib to be built first (cargo build).
 *
 * Test (b): assertBridgeVersion throws VexartNativeError on version mismatch.
 *           This tests the helper directly without touching the real FFI,
 *           so it works even if the dylib is absent.
 */

import { describe, test, expect } from "bun:test"
import {
  openVexartLibrary,
  EXPECTED_BRIDGE_VERSION,
  VexartNativeError,
} from "./vexart-bridge"
import {
  vexartVersion,
  assertBridgeVersion,
  vexartGetLastError,
} from "./vexart-functions"

describe("vexart bridge", () => {
  test("(a) openVexartLibrary succeeds and vexartVersion returns EXPECTED_BRIDGE_VERSION", () => {
    // Live FFI — requires cargo build to produce target/debug/libvexart.dylib
    const lib = openVexartLibrary()
    expect(lib).toBeDefined()
    expect(lib.symbols).toBeDefined()

    const version = vexartVersion()
    expect(version).toBe(EXPECTED_BRIDGE_VERSION)
  })

  test("(b) assertBridgeVersion does not throw when actual === expected", () => {
    expect(() => assertBridgeVersion(EXPECTED_BRIDGE_VERSION)).not.toThrow()
  })

  test("(b) assertBridgeVersion throws VexartNativeError on mismatch", () => {
    const WRONG_VERSION = 0x00010000
    expect(() => assertBridgeVersion(WRONG_VERSION)).toThrow(VexartNativeError)
    expect(() => assertBridgeVersion(WRONG_VERSION)).toThrow(/bridge version mismatch/)
  })

  test("(b) VexartNativeError carries the numeric code", () => {
    try {
      assertBridgeVersion(0x00010000)
      expect(true).toBe(false) // should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(VexartNativeError)
      expect((e as VexartNativeError).code).toBe(-1)
    }
  })
})
