/**
 * gpu-context.ts — Native context creation, lifecycle, and symbol initialization.
 * Extracted from gpu-renderer-backend.ts.
 */

import { ptr } from "bun:ffi"
import { openVexartLibrary, VexartNativeError } from "./vexart-bridge"
import { vexartGetLastError } from "./vexart-functions"

export interface GpuContext {
  getHandle(): bigint
  readonly rawHandle: bigint | null
  isValid(): boolean
  destroy(): void
}

export function createGpuContext(): GpuContext {
  let ctx: bigint | null = null

  return {
    getHandle(): bigint {
      if (ctx !== null) return ctx
      const { symbols } = openVexartLibrary()
      const ctxBuf = new BigUint64Array(1)
      // Bun FFI rejects zero-length ArrayBufferView for ptr(); use 1-byte dummy.
      const optsPtr = ptr(new Uint8Array(1))
      const result = symbols.vexart_context_create(optsPtr, 0, ptr(ctxBuf)) as number
      if (result !== 0) {
        const err = vexartGetLastError()
        throw new VexartNativeError(result, `GPU context creation failed: ${err}`)
      }
      ctx = ctxBuf[0]
      return ctx
    },
    get rawHandle(): bigint | null {
      return ctx
    },
    isValid(): boolean {
      return ctx !== null
    },
    destroy(): void {
      if (ctx !== null) {
        const { symbols } = openVexartLibrary()
        symbols.vexart_context_destroy(ctx)
        ctx = null
      }
    },
  }
}
