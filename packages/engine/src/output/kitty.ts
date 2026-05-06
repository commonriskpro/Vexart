/**
 * Kitty graphics protocol — probing + transport stats.
 *
 * The actual frame/layer/region emission is handled entirely by the native
 * Rust path (vexart_kitty_emit_*). This module only provides:
 *   - Capability probing (probeShm, probeFile)
 *   - Transport stats tracking (used by the native presenter for telemetry)
 *
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import type { TransmissionMode } from "./transport-manager"
import { prepareNativeKittyShm, releaseNativeKittyShm } from "./kitty-shm-native"

/** @public */
export type RawImageData = {
  data: Uint8Array
  width: number
  height: number
}

/** @public */
export type KittyTransportStats = {
  transmitCalls: number
  patchCalls: number
  payloadBytes: number
  estimatedTtyBytes: number
  byMode: Record<TransmissionMode, { transmitCalls: number; patchCalls: number; payloadBytes: number; estimatedTtyBytes: number }>
}

const DEBUG_KITTY_PROBE = process.env.VEXART_DEBUG_KITTY === "1" || process.env.VEXART_DEBUG_KITTY_SHM === "1"

const kittyTransportStats: KittyTransportStats = {
  transmitCalls: 0,
  patchCalls: 0,
  payloadBytes: 0,
  estimatedTtyBytes: 0,
  byMode: {
    shm: { transmitCalls: 0, patchCalls: 0, payloadBytes: 0, estimatedTtyBytes: 0 },
    file: { transmitCalls: 0, patchCalls: 0, payloadBytes: 0, estimatedTtyBytes: 0 },
    direct: { transmitCalls: 0, patchCalls: 0, payloadBytes: 0, estimatedTtyBytes: 0 },
  },
}

/** @public */
export function resetKittyTransportStats() {
  kittyTransportStats.transmitCalls = 0
  kittyTransportStats.patchCalls = 0
  kittyTransportStats.payloadBytes = 0
  kittyTransportStats.estimatedTtyBytes = 0
  for (const mode of ["shm", "file", "direct"] as const) {
    kittyTransportStats.byMode[mode].transmitCalls = 0
    kittyTransportStats.byMode[mode].patchCalls = 0
    kittyTransportStats.byMode[mode].payloadBytes = 0
    kittyTransportStats.byMode[mode].estimatedTtyBytes = 0
  }
}

/** @public */
export function getKittyTransportStats(): KittyTransportStats {
  return {
    transmitCalls: kittyTransportStats.transmitCalls,
    patchCalls: kittyTransportStats.patchCalls,
    payloadBytes: kittyTransportStats.payloadBytes,
    estimatedTtyBytes: kittyTransportStats.estimatedTtyBytes,
    byMode: {
      shm: { ...kittyTransportStats.byMode.shm },
      file: { ...kittyTransportStats.byMode.file },
      direct: { ...kittyTransportStats.byMode.direct },
    },
  }
}

/** @public */
export const COMPRESS_MODE = {
  AUTO: "auto",
} as const

/** @public */
export type CompressMode = boolean | (typeof COMPRESS_MODE)["AUTO"]

export type { TransmissionMode } from "./transport-manager"

// ── Probing ──────────────────────────────────────────────────────────────────

function probeDebug(message: string, extra?: unknown) {
  if (!DEBUG_KITTY_PROBE) return
  if (extra === undefined) {
    console.error(`[tge/kitty-probe] ${message}`)
    return
  }
  console.error(`[tge/kitty-probe] ${message}`, extra)
}

/** Monotonic counter for unique shm/file names per process. */
let shmCounter = 0

function createKittyShmName(kind: "gfx" | "patch" | "probe") {
  return `/tge-${kind}-${process.pid}-${shmCounter++}`
}

function probeTransport(
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout: number,
  label: string,
  responseId: number,
  sendQuery: (setCleanup: (cleanup: () => void) => void) => void,
) {
  return new Promise<boolean>((resolve) => {
    let done = false
    let cleanupResource: (() => void) | void

    probeDebug(`${label}:start`, { timeout })

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
      cleanupResource?.()
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      probeDebug(`${label}:reply`, { raw: JSON.stringify(str) })
      if (str.includes(`_Gi=${responseId};OK`)) {
        probeDebug(`${label}:success`)
        cleanup()
        resolve(true)
      } else if (str.includes(`_Gi=${responseId};`)) {
        probeDebug(`${label}:negative-reply`)
        cleanup()
        resolve(false)
      }
    }

    const timer = setTimeout(() => {
      probeDebug(`${label}:timeout`)
      cleanup()
      resolve(false)
    }, timeout)

    onData(handler)

    try {
      sendQuery((cleanup) => { cleanupResource = cleanup })
    } catch (error) {
      probeDebug(`${label}:exception`, error)
      cleanup()
      resolve(false)
    }
  })
}

/**
 * Probe if the terminal supports shared memory transmission.
 *
 * Creates a tiny 64x64 shm segment, sends a query action (a=q),
 * and checks if terminal responds with OK.
 */
/** @public */
export function probeShm(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<boolean> {
  return probeTransport(onData, offData, timeout, "probeShm", 32, (setCleanup) => {
    const name = createKittyShmName("probe")
    const size = 64 * 64 * 4

    const pixel = new Uint8Array(size)
    pixel.fill(0xff)
    const prepared = prepareNativeKittyShm(name, pixel, 0o666)
    setCleanup(() => { try { releaseNativeKittyShm(prepared.handle, true) } catch {} })
    probeDebug("probeShm:prepared", { handle: prepared.handle, name, size })

    const nameB64 = Buffer.from(name).toString("base64")
    probeDebug("probeShm:query-sent", { name, nameB64 })
    write(`\x1b_Gi=32,s=64,v=64,a=q,t=s,f=32;${nameB64}\x1b\\`)
  })
}

/**
 * Probe if the terminal supports temp file transmission.
 *
 * Writes a 1x1 pixel to a temp file, sends a query action (a=q),
 * and checks if terminal responds with OK.
 */
/** @public */
export function probeFile(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<boolean> {
  return probeTransport(onData, offData, timeout, "probeFile", 33, () => {
    const os = require("os")
    const path = require("path")
    const fs = require("fs")

    const filePath = path.join(os.tmpdir(), `tty-graphics-protocol-probe-${process.pid}`)
    const pixel = new Uint8Array([0, 0, 0, 0])
    fs.writeFileSync(filePath, pixel)

    const pathB64 = Buffer.from(filePath).toString("base64")
    probeDebug("probeFile:query-sent", { filePath, pathB64 })
    write(`\x1b_Gi=33,s=1,v=1,a=q,t=t,f=32;${pathB64}\x1b\\`)
  })
}
