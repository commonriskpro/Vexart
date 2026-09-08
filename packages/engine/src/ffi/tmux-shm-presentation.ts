import { ptr } from "bun:ffi"
import {
  openKittyPlaceholderSymbols,
  openKittyShmSymbols,
} from "./vexart-bridge"
import { vexartGetLastError } from "./vexart-functions"
import {
  allocNativeStatsBuf,
  decodeNativePresentationStats,
  type NativePresentationStats,
} from "./native-presentation-stats"
import { createKittyResponseParser } from "../terminal/kitty-responses"
import type { TmuxClientInfo, TmuxClientState } from "../terminal/tmux"

/** Metadata retained for one complete tmux SHM frame. */
export type TmuxShmFrame = {
  context: bigint
  target: bigint
  width: number
  height: number
  cols: number
  rows: number
  transmissionMode: "direct" | "file" | "shm"
}

type ShmSymbols = ReturnType<typeof openKittyShmSymbols>
type PlaceholderSymbols = ReturnType<typeof openKittyPlaceholderSymbols>

export type TmuxShmPresentationOptions = {
  /** Subscribe to terminal input. The parser is observational only. */
  onData?: (handler: (data: Buffer) => void) => () => void
  /** Bounded poll interval. Production uses 4ms; tests may shorten it. */
  pollIntervalMs?: number
  /** Maximum time to wait for the terminal to consume one SHM segment. */
  timeoutMs?: number
  /** Injectable clock for focused controller tests. */
  now?: () => number
  /** Injectable native symbol lookup for focused controller tests. */
  getSymbols?: () => ShmSymbols
  /** Small native seam used by focused controller tests. */
  native?: TmuxShmNativeAdapter
  /** Injectable placeholder symbol lookup used for owned-image cleanup. */
  getPlaceholderSymbols?: () => PlaceholderSymbols
  /** Receive one actionable asynchronous failure instead of console.error. */
  onError?: (error: Error) => void
  /** Called for every successful upload, including a coalesced pending frame. */
  onPresented?: (stats: NativePresentationStats | null) => void
  /** Native error text lookup (the default reads libvexart's last error). */
  getLastError?: () => string
  /** Stable Kitty image id. Omit to allocate one in this process. */
  imageId?: number
  /** Internal initial tmux client identity/capability snapshot. */
  expectedClient?: TmuxClientInfo
  /** Internal bounded tmux client state query used only after a timeout. */
  getClientState?: () => TmuxClientState
  /** Internal slow recovery poll interval while no client is attached. */
  detachedPollIntervalMs?: number
}

export type TmuxShmNativeAdapter = {
  emit: (context: bigint, target: bigint, params: Uint32Array) => { handle: bigint; stats: NativePresentationStats | null }
  isConsumed: (handle: bigint) => number
  release: (handle: bigint) => number
  deleteImage: (context: bigint, imageId: number) => number
}

export type TmuxShmPresentation = {
  present: (frame: TmuxShmFrame) => NativePresentationStats | null
  waitForDrain: () => Promise<void>
  invalidate: () => void
  suspend: () => void
  resume: () => void
  destroy: () => void
  readonly imageId: number
  readonly fatalError: Error | null
  /** Internal telemetry hook; not part of the public renderer backend. */
  setOnPresented: (callback: (stats: NativePresentationStats | null) => void) => void
}

// Kitty image ids are process-global. Start in a randomized high range to
// avoid deterministic collisions with other Kitty clients, then allocate
// monotonically for backends created by this process.
const imageIdSeed = (() => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return 0x80000000 + (values[0] % 0x3ffff000)
})()
let nextImageId = imageIdSeed
function allocateImageId() {
  const id = nextImageId
  nextImageId = 0x80000000 + ((id - 0x80000000 + 1) % 0x3ffff000)
  return id >>> 0
}

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) return error
  return new Error(`${fallback}: ${String(error)}`)
}

function frameGeometry(frame: TmuxShmFrame) {
  return `${frame.width}x${frame.height}:${frame.cols}x${frame.rows}`
}

type ActiveShmFrame = {
  handle: bigint
  placement: number
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
  frame: TmuxShmFrame
}

type DetachedShmFrame = {
  frame: TmuxShmFrame
}

function sameTmuxClient(left: TmuxClientInfo, right: TmuxClientInfo) {
  return left.tty === right.tty && left.termName === right.termName
}

function tmuxClientCanReceiveGraphics(client: TmuxClientInfo) {
  return client.passthroughAll && client.rgb
}

/**
 * Present complete frames through the native tmux SHM placeholder ABI.
 *
 * The native call copies the GPU readback into POSIX SHM and writes the Kitty
 * `a=T,t=s,U=1,q=1` upload.  Consumption is detected by the SHM name being
 * unlinked, not by a Kitty ACK: ACKs can be routed to a different tmux pane.
 */
export function createTmuxShmPresentation(options: TmuxShmPresentationOptions = {}): TmuxShmPresentation {
  const pollIntervalMs = Math.max(1, Math.floor(options.pollIntervalMs ?? 4))
  const timeoutMs = Math.max(pollIntervalMs, Math.floor(options.timeoutMs ?? 1000))
  const detachedPollIntervalMs = Math.max(250, Math.min(500, Math.floor(options.detachedPollIntervalMs ?? 350)))
  const now = options.now ?? (() => performance.now())
  const getLastError = options.getLastError ?? vexartGetLastError
  const imageId = options.imageId ?? allocateImageId()
  if (!Number.isSafeInteger(imageId) || imageId <= 0 || imageId > 0xffffffff) {
    throw new Error(`[vexart] tmux SHM presentation image id must be a positive u32 (received ${imageId})`)
  }

  let symbols: ShmSymbols = null
  let native: TmuxShmNativeAdapter | null = options.native ?? null
  let placeholderSymbols: PlaceholderSymbols = null
  let active: ActiveShmFrame | null = null
  let lastUpload: { placement: number; emittedAt: number } | null = null
  let pending: TmuxShmFrame | null = null
  let detached: DetachedShmFrame | null = null
  let detachedTimer: ReturnType<typeof setTimeout> | null = null
  let gridGeometry: string | null = null
  let imagePresented = false
  let lastContext: bigint | null = null
  let suspended = false
  let destroyed = false
  let fatal: Error | null = null
  const reportedErrors = new Set<Error>()
  let onPresented = options.onPresented ?? (() => {})
  let removeData: (() => void) | null = null
  const drains = new Set<{ resolve: () => void; reject: (error: Error) => void }>()
  const expectedClient = options.expectedClient ?? null
  const getClientState = options.getClientState

  const reportError = (error: Error) => {
    if (reportedErrors.has(error)) return
    reportedErrors.add(error)
    if (options.onError) options.onError(error)
    else console.error(error.message)
  }

  const actionable = (message: string, cause?: unknown) => {
    const detail = cause instanceof Error ? ` (${cause.message})` : cause ? ` (${String(cause)})` : ""
    return new Error(`[vexart] tmux SHM presentation failed: ${message}${detail}`)
  }

  const releaseHandle = (handle: bigint) => {
    if (handle === 0n) return
    try {
      const rc = native
        ? native.release(handle)
        : symbols
          ? symbols.vexart_kitty_shm_release(handle, 1) as number
          : 0
      if (rc !== 0) throw actionable(`shared-memory cleanup returned ${rc}: ${getLastError()}`)
    } catch (error) {
      // Cleanup is attempted once. The caller can still see the original
      // failure, while this error is retained if it was the only failure.
      throw toError(error, "shared-memory cleanup failed")
    }
  }

  const settleDrains = (error?: Error) => {
    if (active || pending || detached) return
    for (const wait of drains) error ? wait.reject(error) : wait.resolve()
    drains.clear()
  }

  const stopDetached = () => {
    if (detachedTimer !== null) clearTimeout(detachedTimer)
    detachedTimer = null
  }

  const fail = (error: Error) => {
    if (fatal) return
    fatal = error
    stopDetached()
    detached = null
    pending = null
    const current = active
    if (current && current.timer !== null) clearTimeout(current.timer)
    const handle = current?.handle ?? 0n
    active = null
    if (handle !== 0n) {
      try { releaseHandle(handle) } catch (cleanupError) {
        // Keep the actionable original error; cleanup has already been tried.
        reportError(toError(cleanupError, "shared-memory cleanup failed"))
      }
    }
    const imageCleanupError = deleteOwnedImage(false)
    if (imageCleanupError) reportError(imageCleanupError)
    reportError(error)
    settleDrains(error)
  }

  const deleteOwnedImage = (reportFailure = true): Error | null => {
    if (!imagePresented || lastContext === null) return null
    // Mark it first so terminal destroy/suspend cannot issue a second delete
    // after a write failure or a re-entrant lifecycle callback.
    imagePresented = false
    try {
      const rc = native
        ? native.deleteImage(lastContext, imageId)
        : (() => {
            if (!placeholderSymbols) placeholderSymbols = options.getPlaceholderSymbols?.() ?? openKittyPlaceholderSymbols()
            if (!placeholderSymbols) throw actionable(
              "native cleanup ABI is unavailable; rebuild native/libvexart with vexart_kitty_delete_placeholder",
            )
            return placeholderSymbols.vexart_kitty_delete_placeholder(lastContext, imageId) as number
          })()
      if (rc !== 0) throw actionable(`owned image cleanup returned ${rc}: ${getLastError()}`)
    } catch (error) {
      const cleanupError = toError(error, "owned image cleanup failed")
      if (reportFailure) reportError(cleanupError)
      return cleanupError
    }
    return null
  }

  const stopActive = (): Error | null => {
    const current = active
    if (current && current.timer !== null) clearTimeout(current.timer)
    const handle = current?.handle ?? 0n
    active = null
    if (handle === 0n) return null
    try {
      releaseHandle(handle)
      return null
    } catch (error) {
      return toError(error, "shared-memory cleanup failed")
    }
  }

  const stopActiveAndCleanupImage = () => {
    const releaseError = stopActive()
    if (releaseError) {
      fatal ??= releaseError
      reportError(releaseError)
    }
    const imageError = deleteOwnedImage()
    if (imageError) fatal ??= imageError
  }

  const clientStateError = (state: TmuxClientState) => {
    if (state.kind === "multiple") {
      return actionable(`tmux SHM presentation requires one attached client during recovery (found ${state.count})`)
    }
    if (state.kind === "unknown") return actionable(`could not verify tmux client during recovery: ${state.reason}`)
    return actionable("tmux SHM presentation cannot recover without the original attached client")
  }

  const scheduleDetachedPoll = () => {
    if (!detached || suspended || destroyed || fatal || detachedTimer !== null) return
    detachedTimer = setTimeout(checkDetached, detachedPollIntervalMs)
  }

  const checkDetached = () => {
    detachedTimer = null
    if (!detached || suspended || destroyed || fatal) return
    let state: TmuxClientState
    try {
      state = getClientState?.() ?? { kind: "unknown", reason: "tmux client recovery is unavailable" }
    } catch (error) {
      state = { kind: "unknown", reason: String(error) }
    }
    if (state.kind === "zero") {
      scheduleDetachedPoll()
      return
    }
    if (state.kind !== "single") {
      fail(clientStateError(state))
      return
    }
    if (expectedClient === null || !sameTmuxClient(expectedClient, state.client)) {
      fail(actionable("tmux SHM presentation client identity changed during recovery; restart Vexart to reprobe the new client"))
      return
    }
    if (!tmuxClientCanReceiveGraphics(state.client) || !tmuxClientCanReceiveGraphics(expectedClient)) {
      fail(actionable("tmux SHM presentation client capability changed during recovery; restart Vexart to reprobe the new client"))
      return
    }
    const current = detached
    detached = null
    lastUpload = null
    gridGeometry = null
    try { start(current.frame) } catch { /* start() records and reports the fatal error */ }
  }

  const poll = () => {
    if (!active || fatal || destroyed || suspended) return
    const current = active
    if (!native && !symbols) {
      fail(actionable("native SHM symbols became unavailable while polling"))
      return
    }
    let consumed: number
    try {
      consumed = native
        ? native.isConsumed(current.handle)
        : symbols!.vexart_kitty_shm_is_consumed(current.handle) as number
    } catch (error) {
      fail(actionable("consumption check threw", error))
      return
    }
    if (consumed < 0) {
      fail(actionable(`consumption check returned ${consumed}: ${getLastError()}`))
      return
    }
    if (consumed === 1) {
      active = null
      try {
        releaseHandle(current.handle)
      } catch (error) {
        fail(toError(error, "shared-memory cleanup failed"))
        return
      }
      if (pending && !suspended && !destroyed && !fatal) {
        const next = pending
        pending = null
        try {
          start(next)
        } catch {
          // start() records and reports the fatal error. Keep this timer
          // callback from turning an asynchronous rejection into an uncaught
          // exception in the render loop.
        }
      }
      settleDrains(fatal ?? undefined)
      return
    }
    if (now() - current.startedAt >= timeoutMs) {
      // Release before surfacing the timeout so no segment remains pinned.
      active = null
      try {
        releaseHandle(current.handle)
      } catch (error) {
        fail(toError(error, "shared-memory cleanup failed"))
        return
      }
      const timeoutError = actionable(`timed out after ${timeoutMs}ms waiting for terminal consumption (SHM handle ${current.handle})`)
      let state: TmuxClientState | null = null
      if (getClientState) {
        try { state = getClientState() } catch (error) { state = { kind: "unknown", reason: String(error) } }
      }
      if (state?.kind === "zero" && expectedClient !== null && tmuxClientCanReceiveGraphics(expectedClient)) {
        detached = { frame: pending ?? current.frame }
        pending = null
        lastUpload = null
        gridGeometry = null
        scheduleDetachedPoll()
        return
      }
      if (state && state.kind !== "zero") {
        fail(state.kind === "single" && !sameTmuxClient(expectedClient ?? state.client, state.client)
          ? actionable("tmux SHM presentation client identity changed; restart Vexart to reprobe the new client")
          : state.kind === "single" && !tmuxClientCanReceiveGraphics(state.client)
            ? actionable("tmux SHM presentation client capability is unavailable")
            : state.kind === "single"
              ? timeoutError
              : clientStateError(state))
        return
      }
      fail(timeoutError)
      return
    }
    current.timer = setTimeout(poll, pollIntervalMs)
  }

  function start(frame: TmuxShmFrame): NativePresentationStats | null {
    if (fatal) throw fatal
    if (suspended || destroyed) return null
    if (frame.transmissionMode !== "shm") {
      const error = actionable(`runtime transmissionMode must be "shm" (received "${frame.transmissionMode}")`)
      fail(error)
      throw error
    }
    try {
      if (!native) {
        if (!symbols) symbols = options.getSymbols?.() ?? openKittyShmSymbols()
        if (!symbols) throw actionable(
          "native ABI is unavailable; rebuild native/libvexart with vexart_kitty_emit_placeholder_shm_frame and vexart_kitty_shm_is_consumed",
        )
        native = {
          emit(context, target, params) {
            const statsBuf = allocNativeStatsBuf()
            const handleBuf = new BigUint64Array(1)
            const rc = symbols!.vexart_kitty_emit_placeholder_shm_frame(
              context,
              target,
              ptr(params),
              params.byteLength,
              ptr(handleBuf),
              ptr(statsBuf),
            ) as number
            if (rc !== 0) throw actionable(`native emit returned ${rc}: ${getLastError()}`)
            return { handle: handleBuf[0], stats: decodeNativePresentationStats(statsBuf) }
          },
          isConsumed(handle) {
            return symbols!.vexart_kitty_shm_is_consumed(handle) as number
          },
          release(handle) {
            return symbols!.vexart_kitty_shm_release(handle, 1) as number
          },
          deleteImage(context, id) {
            if (!placeholderSymbols) placeholderSymbols = options.getPlaceholderSymbols?.() ?? openKittyPlaceholderSymbols()
            if (!placeholderSymbols) throw actionable(
              "native cleanup ABI is unavailable; rebuild native/libvexart with vexart_kitty_delete_placeholder",
            )
            return placeholderSymbols.vexart_kitty_delete_placeholder(context, id) as number
          },
        }
      }
      const params = new Uint32Array(5)
      if (placement === 0xffffffff) throw actionable("placement id exhausted; restart the renderer to allocate a fresh image id")
      params[0] = imageId >>> 0
      params[1] = (placement + 1) >>> 0
      params[2] = Math.max(0, Math.floor(frame.cols)) >>> 0
      params[3] = Math.max(0, Math.floor(frame.rows)) >>> 0
      params[4] = gridGeometry === null || gridGeometry !== frameGeometry(frame) ? 1 : 0
      // `placement` is kept outside the public frame metadata and increments
      // for every upload, including uploads started from the pending slot.
      placement = params[1]
      const emitted = native.emit(frame.context, frame.target, params)
      const handle = emitted.handle
      if (handle === 0n) throw actionable("native emit succeeded without returning an SHM handle")
      lastContext = frame.context
      imagePresented = true
      gridGeometry = frameGeometry(frame)
      active = { handle, placement, startedAt: now(), timer: null, frame }
      lastUpload = { placement, emittedAt: now() }
      active.timer = setTimeout(poll, pollIntervalMs)
      try { onPresented(emitted.stats) } catch { /* telemetry must not break presentation */ }
      return emitted.stats
    } catch (error) {
      const result = toError(error, "native emit failed")
      fail(result)
      throw result
    }
  }

  // Placement is deliberately process-local and monotonic.  Native receives
  // it in params[1] on every upload; it is not used as an ACK waiter.
  let placement = 0

  const observeResponse = (response: { imageId: number; placementId: number | null; status: string }) => {
    // A response can already be queued in the shared terminal input stream
    // when lifecycle suspension starts. It must not poison the next session.
    if (fatal || suspended || destroyed || detached || response.imageId !== imageId) return
    const responsePlacement = response.placementId
    const matchesActive = active !== null && (
      responsePlacement === null || responsePlacement === active.placement
    )
    const matchesLast = lastUpload !== null
      && now() - lastUpload.emittedAt <= timeoutMs
      && responsePlacement !== null
      && responsePlacement === lastUpload.placement
    if (!matchesActive && !matchesLast) return
    if (response.status !== "OK") {
      fail(actionable(`terminal rejected image i=${response.imageId} p=${responsePlacement ?? "?"} with status ${response.status}`))
    }
    // An OK response is intentionally ignored. tmux routes it to the active
    // pane, which is not proof that this client's SHM name was consumed.
  }

  const subscribeData = () => {
    if (!options.onData || removeData || fatal || suspended || destroyed) return
    const parser = createKittyResponseParser(observeResponse)
    const unsubscribe = options.onData((data) => parser.feed(data))
    removeData = () => {
      unsubscribe()
      parser.destroy()
    }
  }

  subscribeData()

  const controller: TmuxShmPresentation = {
    imageId,
    get fatalError() { return fatal },
    setOnPresented(callback) { onPresented = callback },
    present(frame) {
      if (fatal) throw fatal
      if (suspended || destroyed) return null
      if (frame.transmissionMode !== "shm") {
        const error = actionable(`runtime transmissionMode must be "shm" (received "${frame.transmissionMode}")`)
        fail(error)
        throw error
      }
      if (detached) {
        detached.frame = frame
        return null
      }
      if (active) {
        // Keep only metadata for the newest complete frame. In particular do
        // not retain a GPU target/readback buffer for every render tick.
        pending = frame
        return null
      }
      return start(frame)
    },
    waitForDrain() {
      if (fatal) return Promise.reject(fatal)
      if (!active && !pending && !detached) return Promise.resolve()
      return new Promise<void>((resolve, reject) => drains.add({ resolve, reject }))
    },
    invalidate() {
      gridGeometry = null
    },
    suspend() {
      if (destroyed) return
      suspended = true
      stopDetached()
      detached = null
      pending = null
      stopActiveAndCleanupImage()
      lastUpload = null
      removeData?.()
      removeData = null
      settleDrains(fatal ?? undefined)
    },
    resume() {
      if (destroyed) return
      suspended = false
      gridGeometry = null
      pending = null
      lastUpload = null
      subscribeData()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      suspended = true
      stopDetached()
      detached = null
      pending = null
      stopActiveAndCleanupImage()
      removeData?.()
      removeData = null
      settleDrains(fatal ?? undefined)
    },
  }
  return controller
}
