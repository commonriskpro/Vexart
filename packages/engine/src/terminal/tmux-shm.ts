import { prepareNativeKittyShm, releaseNativeKittyShm } from "../output/kitty-shm-native"
import { wrapPassthrough } from "./tmux"
import { createKittyResponseParser, type KittyResponse } from "./kitty-responses"

export type TmuxShmProbeResult = KittyResponse & { queryId: number; shmName: string }

const randomSeed = (() => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] || 1
})()
let idCounter = randomSeed
let nameCounter = 0

function nextQueryId() {
  idCounter = (idCounter + 1) >>> 0
  if (idCounter === 0) idCounter = 1
  return idCounter
}

function nextShmName() {
  nameCounter++
  const pid = process.pid.toString(36).slice(-5)
  const time = Date.now().toString(36).slice(-5)
  const random = randomSeed.toString(36).slice(-6)
  const counter = nameCounter.toString(36).slice(-3)
  return `/vex-${pid}-${time}-${random}-${counter}`
}

/** Build the one-image query used by the tmux SHM startup check. */
export function buildTmuxShmQuery(imageId: number, shmName: string) {
  const name = Buffer.from(shmName).toString("base64")
  return `\x1b_Gi=${imageId},s=1,v=1,a=q,t=s,f=32;${name}\x1b\\`
}

function unavailable(reason: string, cause?: unknown): Error {
  const detail = cause instanceof Error ? ` (${cause.message})` : ""
  return new Error(`Vexart requires Kitty SHM support through tmux; ${reason}${detail}`)
}

/**
 * Verify the Kitty shared-memory query path through tmux.
 *
 * This deliberately has no direct/file fallback.  A successful return is the
 * only proof used by createTerminal before it selects tmux SHM transport.
 */
export async function probeTmuxShm(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<TmuxShmProbeResult> {
  const queryId = nextQueryId()
  const shmName = nextShmName()
  const pixel = new Uint8Array([0xff, 0xff, 0xff, 0xff])
  let prepared: ReturnType<typeof prepareNativeKittyShm> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let failed: unknown = null
  let releaseError: unknown = null
  let complete = false
  let result: TmuxShmProbeResult | null = null
  let resolveAck: (() => void) | null = null

  const parser = createKittyResponseParser((response) => {
    if (complete || response.imageId !== queryId) return
    complete = true
    result = { ...response, queryId, shmName }
    resolveAck?.()
  })
  const handler = (data: Buffer) => parser.feed(data)

  try {
    onData(handler)
    prepared = prepareNativeKittyShm(shmName, pixel, 0o600)

    const ack = new Promise<void>((resolve, reject) => {
      resolveAck = resolve
      timer = setTimeout(() => reject(unavailable(`the SHM query timed out after ${timeout}ms`)), Math.max(1, timeout))
      try {
        write(wrapPassthrough(buildTmuxShmQuery(queryId, shmName)))
      } catch (error) {
        reject(unavailable("the SHM query could not be written", error))
      }
    })
    await ack
    const ackResult = result as TmuxShmProbeResult | null
    if (!ackResult) throw unavailable("the SHM query returned no usable response")
    if (ackResult.status !== "OK") throw unavailable(`the terminal rejected the SHM query with status ${ackResult.status}`)
  } catch (error) {
    failed = error
  } finally {
    if (timer) clearTimeout(timer)
    offData(handler)
    parser.destroy()
    if (prepared) {
      try {
        releaseNativeKittyShm(prepared.handle, true)
      } catch (error) {
        releaseError = error
      }
    }
  }

  if (failed) {
    if (failed instanceof Error && failed.message.startsWith("Vexart requires Kitty SHM")) throw failed
    throw unavailable("the SHM probe failed", failed)
  }
  if (releaseError) throw unavailable("the probe shared-memory segment could not be cleaned up", releaseError)
  if (!result) throw unavailable("the SHM probe completed without an acknowledgement")
  return result
}
