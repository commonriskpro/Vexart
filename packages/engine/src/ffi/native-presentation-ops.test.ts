import { expect, test } from "bun:test"
import { ensureNativeKittyTransport, tickNativePresentationRecovery } from "./native-presentation-ops"

test("ensureNativeKittyTransport sets transport modes without error", () => {
  expect(() => ensureNativeKittyTransport("direct")).not.toThrow()
  expect(() => ensureNativeKittyTransport("shm")).not.toThrow()
  expect(() => ensureNativeKittyTransport(0)).not.toThrow()
})

test("tickNativePresentationRecovery advances frame counter cleanly", () => {
  expect(() => {
    for (let i = 0; i < 10; i++) {
      tickNativePresentationRecovery()
    }
  }).not.toThrow()
})
