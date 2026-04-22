/**
 * vexart-buffer.test.ts
 * Tests TS graph buffer encoding matches the Rust-side format.
 * Per design §13.3 / Slice 10 task 10.11.
 */
import { describe, expect, it } from "bun:test"
import {
  GRAPH_BUFFER_BYTES,
  GRAPH_MAGIC,
  GRAPH_VERSION,
  graphBuffer,
  graphView,
  writeCommandPrefix,
  writeHeader,
} from "./vexart-buffer"

describe("vexart-buffer", () => {
  it("graphBuffer is 64KB", () => {
    expect(graphBuffer.byteLength).toBe(64 * 1024)
    expect(GRAPH_BUFFER_BYTES).toBe(64 * 1024)
  })

  it("GRAPH_MAGIC matches Rust-side 0x56584152", () => {
    expect(GRAPH_MAGIC).toBe(0x56584152)
  })

  it("GRAPH_VERSION matches Rust-side 0x00020000", () => {
    expect(GRAPH_VERSION).toBe(0x00020000)
  })

  describe("writeHeader", () => {
    it("writes correct 16-byte header", () => {
      writeHeader(5, 1024)
      expect(graphView.getUint32(0, true)).toBe(GRAPH_MAGIC)
      expect(graphView.getUint32(4, true)).toBe(GRAPH_VERSION)
      expect(graphView.getUint32(8, true)).toBe(5)
      expect(graphView.getUint32(12, true)).toBe(1024)
    })

    it("overwrites previous header on re-call", () => {
      writeHeader(10, 2048)
      expect(graphView.getUint32(8, true)).toBe(10)
      expect(graphView.getUint32(12, true)).toBe(2048)
      writeHeader(0, 0)
      expect(graphView.getUint32(8, true)).toBe(0)
      expect(graphView.getUint32(12, true)).toBe(0)
    })
  })

  describe("writeCommandPrefix", () => {
    it("writes correct 8-byte prefix at given offset", () => {
      const offset = 16
      writeCommandPrefix(offset, 7, 3, 80)
      expect(graphView.getUint16(offset, true)).toBe(7)      // cmdKind
      expect(graphView.getUint16(offset + 2, true)).toBe(3)  // flags
      expect(graphView.getUint32(offset + 4, true)).toBe(80) // payloadBytes
    })

    it("writes prefix at arbitrary offset", () => {
      const offset = 128
      writeCommandPrefix(offset, 14, 0, 64)
      expect(graphView.getUint16(offset, true)).toBe(14)
      expect(graphView.getUint16(offset + 2, true)).toBe(0)
      expect(graphView.getUint32(offset + 4, true)).toBe(64)
    })
  })

  describe("round-trip header + N commands", () => {
    it("packs 3 rect commands with correct offsets", () => {
      const CMD_RECT = 0
      const RECT_BODY_BYTES = 80
      const cmdCount = 3
      const prefixBytes = 8
      const payloadBytes = cmdCount * (prefixBytes + RECT_BODY_BYTES)

      writeHeader(cmdCount, payloadBytes)

      let offset = 16
      for (let i = 0; i < cmdCount; i++) {
        writeCommandPrefix(offset, CMD_RECT, 0, RECT_BODY_BYTES)
        offset += prefixBytes + RECT_BODY_BYTES
      }

      // Verify header
      expect(graphView.getUint32(8, true)).toBe(3)
      expect(graphView.getUint32(12, true)).toBe(payloadBytes)

      // Verify each command prefix
      let checkOff = 16
      for (let i = 0; i < cmdCount; i++) {
        expect(graphView.getUint16(checkOff, true)).toBe(CMD_RECT)
        expect(graphView.getUint32(checkOff + 4, true)).toBe(RECT_BODY_BYTES)
        checkOff += prefixBytes + RECT_BODY_BYTES
      }
    })
  })
})
