import { describe, expect, test } from "bun:test"
import { assertBridgeVersion, EXPECTED_BRIDGE_VERSION, VexartNativeError } from "./vexart-functions"

describe("FFI bridge error handling", () => {
  test("assertBridgeVersion throws on mismatch", () => {
    expect(() => assertBridgeVersion(0x00010000)).toThrow(VexartNativeError)
    expect(() => assertBridgeVersion(0x00010000)).toThrow(/bridge version mismatch/)
  })

  test("assertBridgeVersion passes on match", () => {
    expect(() => assertBridgeVersion(EXPECTED_BRIDGE_VERSION)).not.toThrow()
  })
})
