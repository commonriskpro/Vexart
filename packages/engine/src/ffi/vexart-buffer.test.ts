/**
 * vexart-buffer.test.ts
 * Tests TS graph buffer constants match the Rust-side format.
 * Per design §13.3 / Slice 10 task 10.11.
 */
import { describe, expect, it } from "bun:test"
import {
  GRAPH_BUFFER_BYTES,
  GRAPH_MAGIC,
  GRAPH_VERSION,
} from "./vexart-buffer"

describe("vexart-buffer", () => {
  it("GRAPH_BUFFER_BYTES is 64KB", () => {
    expect(GRAPH_BUFFER_BYTES).toBe(64 * 1024)
  })

  it("GRAPH_MAGIC matches Rust-side 0x56584152", () => {
    expect(GRAPH_MAGIC).toBe(0x56584152)
  })

  it("GRAPH_VERSION matches Rust-side 0x00020000", () => {
    expect(GRAPH_VERSION).toBe(0x00020000)
  })
})
