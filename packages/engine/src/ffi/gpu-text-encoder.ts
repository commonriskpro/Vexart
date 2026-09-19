/**
 * gpu-text-encoder.ts — MSDF binary buffer packing & VXTX text stream batching.
 * Extracted from gpu-renderer-backend.ts.
 */

import { ptr } from "bun:ffi"
import { openMsdfFontSymbols } from "./vexart-bridge"

export type DeferredMsdfOp = {
  text: string
  x: number
  y: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  colorRgba: number
  fontFamily?: string
  fontWeight?: number
  fontStyle?: string
}

export interface GpuTextEncoder {
  getSymbols(): ReturnType<typeof openMsdfFontSymbols> | null
  tryRenderText(
    vctx: bigint,
    targetHandle: bigint,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    lineHeight: number,
    maxWidth: number,
    colorRgba: number,
    targetWidth: number,
    targetHeight: number,
    fontFamily?: string,
    fontWeight?: number,
    fontStyle?: string,
  ): boolean
  queueTextOp(op: DeferredMsdfOp): void
  hasPending(): boolean
  drainPending(): DeferredMsdfOp[]
  restorePending(ops: DeferredMsdfOp[]): void
  flush(
    vctx: bigint,
    targetHandle: bigint,
    targetWidth: number,
    targetHeight: number,
  ): boolean
  clear(): void
}

export function createGpuTextEncoder(): GpuTextEncoder {
  let symbols: ReturnType<typeof openMsdfFontSymbols> | null = null
  let initDone = false
  const encoder = new TextEncoder()
  const statsBuf = new Uint8Array(32)
  // HP-4: Pre-allocated buffers for tryRenderText and batching — avoids per-call allocations.
  let textBuf = new Uint8Array(4096)
  let paramsBuf = new Uint8Array(4096)
  let batchBuf = new Uint8Array(64 * 1024)
  let batchView = new DataView(batchBuf.buffer)
  const batchStatsOut = new Uint32Array(1)
  const deferredOps: DeferredMsdfOp[] = []

  function getSymbols() {
    if (symbols !== null) return symbols
    symbols = openMsdfFontSymbols()
    if (symbols && !initDone) {
      initDone = true
      symbols.vexart_font_init()
    }
    return symbols
  }

  function ensureBatchCapacity(requiredBytes: number) {
    if (requiredBytes > batchBuf.byteLength) {
      let nextCap = batchBuf.byteLength * 2
      while (nextCap < requiredBytes) nextCap *= 2
      const nextBuf = new Uint8Array(nextCap)
      nextBuf.set(batchBuf)
      batchBuf = nextBuf
      batchView = new DataView(batchBuf.buffer)
    }
  }

  function tryRenderText(
    vctx: bigint,
    targetHandle: bigint,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    lineHeight: number,
    maxWidth: number,
    colorRgba: number,
    _targetWidth: number,
    _targetHeight: number,
    fontFamily?: string,
    fontWeight?: number,
    fontStyle?: string,
  ): boolean {
    const sym = getSymbols()
    if (!sym) return false
    if (text.length === 0) return true

    const maxBytes = text.length * 3
    if (maxBytes > textBuf.byteLength) {
      textBuf = new Uint8Array(Math.max(maxBytes, textBuf.byteLength * 2))
    }
    const { written: textLen } = encoder.encodeInto(text, textBuf)
    if (textLen === 0) return true

    const family = fontFamily || "sans-serif"
    const familiesEncoded = encoder.encode(family)

    const headerSize = 28
    const totalParamsSize = headerSize + familiesEncoded.byteLength
    if (totalParamsSize > paramsBuf.byteLength) {
      paramsBuf = new Uint8Array(Math.max(totalParamsSize, paramsBuf.byteLength * 2))
    }
    const pView = new DataView(paramsBuf.buffer)
    const weight = fontWeight ?? 400
    const flags = fontStyle === "italic" ? 1 : 0
    pView.setFloat32(0, x, true)
    pView.setFloat32(4, y, true)
    pView.setFloat32(8, fontSize, true)
    pView.setFloat32(12, lineHeight, true)
    pView.setFloat32(16, maxWidth, true)
    pView.setUint32(20, colorRgba >>> 0, true)
    pView.setUint16(24, weight, true)
    pView.setUint16(26, flags, true)
    paramsBuf.set(familiesEncoded, headerSize)

    const rc = sym.vexart_font_render_text(
      vctx, targetHandle,
      ptr(textBuf), textLen,
      ptr(paramsBuf), totalParamsSize,
      ptr(statsBuf),
    ) as number

    return rc === 0
  }

  return {
    getSymbols,
    tryRenderText,
    queueTextOp(op: DeferredMsdfOp) {
      deferredOps.push(op)
    },
    hasPending() {
      return deferredOps.length > 0
    },
    drainPending() {
      return deferredOps.splice(0)
    },
    restorePending(ops: DeferredMsdfOp[]) {
      deferredOps.push(...ops)
    },
    flush(vctx: bigint, targetHandle: bigint, targetWidth: number, targetHeight: number): boolean {
      if (deferredOps.length === 0) return false
      const sym = getSymbols()
      if (sym && typeof sym.vexart_font_render_batch === "function") {
        let offset = 16
        for (let i = 0; i < deferredOps.length; i++) {
          const msdfOp = deferredOps[i]
          const family = msdfOp.fontFamily || "sans-serif"
          const text = msdfOp.text
          const worstCaseBytes = 32 + (family.length + text.length) * 3
          ensureBatchCapacity(offset + worstCaseBytes)

          const itemOffset = offset
          batchView.setFloat32(itemOffset + 0, msdfOp.x, true)
          batchView.setFloat32(itemOffset + 4, msdfOp.y, true)
          batchView.setFloat32(itemOffset + 8, msdfOp.fontSize, true)
          batchView.setFloat32(itemOffset + 12, msdfOp.lineHeight, true)
          batchView.setFloat32(itemOffset + 16, msdfOp.maxWidth, true)
          batchView.setUint32(itemOffset + 20, msdfOp.colorRgba >>> 0, true)
          batchView.setUint16(itemOffset + 24, msdfOp.fontWeight ?? 400, true)
          batchView.setUint16(itemOffset + 26, msdfOp.fontStyle === "italic" ? 1 : 0, true)

          const familyRes = encoder.encodeInto(family, batchBuf.subarray(itemOffset + 32))
          const familyLen = familyRes.written ?? 0
          const textRes = encoder.encodeInto(text, batchBuf.subarray(itemOffset + 32 + familyLen))
          const textLen = textRes.written ?? 0

          batchView.setUint16(itemOffset + 28, familyLen, true)
          batchView.setUint16(itemOffset + 30, textLen, true)

          offset = itemOffset + 32 + familyLen + textLen
        }

        batchView.setUint32(0, 0x56585458, true)
        batchView.setUint32(4, 1, true)
        batchView.setUint32(8, deferredOps.length, true)
        batchView.setUint32(12, offset, true)

        sym.vexart_font_render_batch(
          vctx,
          targetHandle,
          ptr(batchBuf),
          offset,
          ptr(batchStatsOut),
        )
      } else {
        for (const msdfOp of deferredOps) {
          tryRenderText(
            vctx, targetHandle,
            msdfOp.text, msdfOp.x, msdfOp.y,
            msdfOp.fontSize, msdfOp.lineHeight, msdfOp.maxWidth,
            msdfOp.colorRgba,
            targetWidth, targetHeight,
            msdfOp.fontFamily, msdfOp.fontWeight, msdfOp.fontStyle,
          )
        }
      }
      deferredOps.length = 0
      return true
    },
    clear() {
      deferredOps.length = 0
    },
  }
}
