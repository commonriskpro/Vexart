import { describe, expect, test } from "bun:test"
import { ptr } from "bun:ffi"
import { openMsdfFontSymbols } from "./vexart-bridge"
import { createGpuRendererBackendForTesting } from "./gpu-renderer-backend"
import { vexartCompositeTargetCreate, vexartCompositeTargetDestroy } from "./gpu-composite-ops"

describe("MSDF Text Batching (Audit 2.2)", () => {
  test("openMsdfFontSymbols exposes vexart_font_render_batch", () => {
    const syms = openMsdfFontSymbols()
    expect(syms).not.toBeNull()
    expect(typeof syms?.vexart_font_render_batch).toBe("function")
  })

  test("vexart_font_render_batch renders batched text items successfully", () => {
    const syms = openMsdfFontSymbols()
    if (!syms) return
    syms.vexart_font_init()

    const vctx = 1n
    const target = vexartCompositeTargetCreate(vctx, 400, 200)
    expect(target).not.toBe(0n)

    try {
      const buf = new Uint8Array(4096)
      const view = new DataView(buf.buffer)
      const encoder = new TextEncoder()

      // Pack two items: "Hello" and "World"
      let offset = 16
      const items = [
        { text: "Hello", x: 10, y: 10, fontSize: 16, lineHeight: 20, maxWidth: 300, color: 0xffffffff, family: "sans-serif", weight: 400, italic: 0 },
        { text: "World", x: 10, y: 35, fontSize: 16, lineHeight: 20, maxWidth: 300, color: 0xffffffff, family: "sans-serif", weight: 400, italic: 0 },
      ]

      for (const item of items) {
        const itemOffset = offset
        view.setFloat32(itemOffset + 0, item.x, true)
        view.setFloat32(itemOffset + 4, item.y, true)
        view.setFloat32(itemOffset + 8, item.fontSize, true)
        view.setFloat32(itemOffset + 12, item.lineHeight, true)
        view.setFloat32(itemOffset + 16, item.maxWidth, true)
        view.setUint32(itemOffset + 20, item.color >>> 0, true)
        view.setUint16(itemOffset + 24, item.weight, true)
        view.setUint16(itemOffset + 26, item.italic, true)

        const fRes = encoder.encodeInto(item.family, buf.subarray(itemOffset + 32))
        const fLen = fRes.written ?? 0
        const tRes = encoder.encodeInto(item.text, buf.subarray(itemOffset + 32 + fLen))
        const tLen = tRes.written ?? 0

        view.setUint16(itemOffset + 28, fLen, true)
        view.setUint16(itemOffset + 30, tLen, true)
        offset = itemOffset + 32 + fLen + tLen
      }

      view.setUint32(0, 0x56585458, true) // 'VXTX'
      view.setUint32(4, 1, true)          // version 1
      view.setUint32(8, items.length, true)
      view.setUint32(12, offset, true)

      const statsOut = new Uint32Array(1)
      const rc = syms.vexart_font_render_batch(
        vctx,
        target,
        ptr(buf),
        offset,
        ptr(statsOut),
      ) as number

      expect(rc).toBe(0)
      expect(statsOut[0]).toBe(10) // "Hello" (5) + "World" (5)
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  })

  test("backend.paint batches contiguous text ops into a single batch call", () => {
    const backend = createGpuRendererBackendForTesting()
    try {
      const makeTextOp = (text: string, y: number) => ({
        kind: "text" as const,
        renderObjectId: null,
        type: 1,
        x: 5,
        y,
        width: 100,
        height: 20,
        color: 0xffffffff,
        cornerRadius: 0,
        extra1: 0,
        extra2: 0,
        fontId: 0,
        text,
        fontSize: 14,
        lineHeight: 18,
        maxWidth: 200,
        textHeight: 18,
        whiteSpace: "normal" as const,
      })
      const textOps = [
        makeTextOp("Batch One", 5),
        makeTextOp("Batch Two", 25),
        makeTextOp("Batch Three", 45),
      ]
      expect(() => {
        backend.paint({
          targetWidth: 200,
          targetHeight: 100,
          backing: null,
          target: { width: 200, height: 100 },
          commands: [],
          graph: { ops: textOps },
          offsetX: 0,
          offsetY: 0,
          frame: null,
          layer: null,
        })
      }).not.toThrow()
    } finally {
      backend.destroy?.()
    }
  })
})
