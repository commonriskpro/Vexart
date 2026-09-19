import { vexartGetLastError } from "./vexart-functions"
import type { NativePresentationStats } from "./native-presentation-stats"
import {
  allocateImageId,
  validateImageId,
  createTmuxShmLeaseManager,
  type TmuxShmNativeAdapter,
  type ShmSymbols,
  type PlaceholderSymbols,
} from "./tmux-shm-lease"
import { subscribeApcResponses } from "./tmux-shm-apc"
import {
  discoverTmuxClientState,
  validateClientRecovery,
  validateClientAtTimeout,
  type TmuxClientInfo,
  type TmuxClientState,
} from "./tmux-shm-client"

/** Metadata retained for one complete tmux SHM frame. */
export type TmuxShmFrame = {
  context: bigint
  target: bigint
  width: number
  height: number
  cols: number
  rows: number
  transmissionMode: "direct" | "shm"
}

export type { TmuxShmNativeAdapter }

export type TmuxShmPresentationOptions = {
  /** Internal transport label; mechanics are shared with regular Kitty SHM. */
  label?: string
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

export type TmuxShmPresentation = {
  present: (frame: TmuxShmFrame) => NativePresentationStats | null
  waitForDrain: () => Promise<void>
  invalidate: () => void
  forgetTarget: (target: bigint) => void
  suspend: () => void
  resume: () => void
  destroy: () => void
  readonly imageId: number
  readonly fatalError: Error | null
  /** Internal telemetry hook; not part of the public renderer backend. */
  setOnPresented: (callback: (stats: NativePresentationStats | null) => void) => void
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

/**
 * Present complete frames through the native tmux SHM placeholder ABI.
 *
 * The native call copies the GPU readback into POSIX SHM and writes the Kitty
 * `a=T,t=s,U=1,q=1` upload.  Consumption is detected by the SHM name being
 * unlinked, not by a Kitty ACK: ACKs can be routed to a different tmux pane.
 */
export function createTmuxShmPresentationPipeline(options: TmuxShmPresentationOptions = {}): TmuxShmPresentation {
  return createShmPresentation(options)
}

export const createTmuxShmPresentation = createTmuxShmPresentationPipeline

/** Same bounded active/latest controller, with ordinary Kitty wire commands. */
export function createKittyShmPresentation(options: Pick<TmuxShmPresentationOptions, "onData" | "onError" | "imageId"> = {}): TmuxShmPresentation {
  return createShmPresentation({
    ...options,
    label: "Kitty SHM",
    // Time is not proof of consumption. Retain a bounded transfer until the
    // terminal consumes/rejects it or its owner explicitly cancels the session.
    timeoutMs: Infinity,
  })
}

function createShmPresentation(options: TmuxShmPresentationOptions): TmuxShmPresentation {
  const label = options.label ?? "tmux SHM"
  const isPlaceholder = (options.label ?? "tmux SHM") !== "Kitty SHM"
  const useRing = options.native === undefined
  const pollIntervalMs = Math.max(1, Math.floor(options.pollIntervalMs ?? 4))
  const timeoutMs = Math.max(pollIntervalMs, Math.floor(options.timeoutMs ?? 1000))
  const detachedPollIntervalMs = Math.max(250, Math.min(500, Math.floor(options.detachedPollIntervalMs ?? 350)))
  const now = options.now ?? (() => performance.now())
  const getLastError = options.getLastError ?? vexartGetLastError
  const imageId = options.imageId ?? allocateImageId()
  validateImageId(imageId, label)

  const actionable = (message: string, cause?: unknown) => {
    const detail = cause instanceof Error ? ` (${cause.message})` : cause ? ` (${String(cause)})` : ""
    return new Error(`[vexart] ${label} presentation failed: ${message}${detail}`)
  }

  const reportedErrors = new Set<Error>()
  const reportError = (error: Error) => {
    if (reportedErrors.has(error)) return
    reportedErrors.add(error)
    if (options.onError) options.onError(error)
    else console.error(error.message)
  }

  const lease = createTmuxShmLeaseManager({
    label,
    isPlaceholder,
    useRing,
    imageId,
    native: options.native,
    getSymbols: options.getSymbols,
    getPlaceholderSymbols: options.getPlaceholderSymbols,
    getLastError,
    actionable,
    toError,
    reportError,
  })

  let active: ActiveShmFrame | null = null
  let lastUpload: { placement: number; emittedAt: number } | null = null
  let pending: TmuxShmFrame | null = null
  let detached: DetachedShmFrame | null = null
  let detachedTimer: ReturnType<typeof setTimeout> | null = null
  let drainTimer: ReturnType<typeof setTimeout> | null = null
  let gridGeometry: string | null = null
  let suspended = false
  let destroyed = false
  let fatal: Error | null = null
  let onPresented = options.onPresented ?? (() => {})
  let unsubscribeApc: (() => void) | null = null
  const drains = new Set<{ resolve: () => void; reject: (error: Error) => void }>()
  const expectedClient = options.expectedClient ?? null
  const getClientState = options.getClientState

  const settleDrains = (error?: Error) => {
    if (active || pending || detached) return
    for (const wait of drains) error ? wait.reject(error) : wait.resolve()
    drains.clear()
  }

  const stopDrainPoll = () => {
    if (drainTimer !== null) clearTimeout(drainTimer)
    drainTimer = null
  }

  const stopDetached = () => {
    if (detachedTimer !== null) clearTimeout(detachedTimer)
    detachedTimer = null
  }

  const fail = (error: Error) => {
    if (fatal) return
    fatal = error
    stopDetached()
    stopDrainPoll()
    detached = null
    pending = null
    const current = active
    if (current && current.timer !== null) clearTimeout(current.timer)
    const handle = current?.handle ?? 0n
    active = null
    if (handle !== 0n) {
      try { lease.releaseHandle(handle) } catch (cleanupError) {
        // Keep the actionable original error; cleanup has already been tried.
        reportError(toError(cleanupError, "shared-memory cleanup failed"))
      }
    }
    lease.cleanupAll()
    const imageCleanupError = lease.deleteOwnedImage(imageId, false)
    if (imageCleanupError) reportError(imageCleanupError)
    reportError(error)
    settleDrains(error)
  }

  const stopActive = (): Error | null => {
    const current = active
    if (current && current.timer !== null) clearTimeout(current.timer)
    const handle = current?.handle ?? 0n
    active = null
    if (handle === 0n) return null
    try {
      lease.releaseHandle(handle)
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
    const imageError = lease.deleteOwnedImage(imageId)
    if (imageError) fatal ??= imageError
  }

  const scheduleDetachedPoll = () => {
    if (!detached || suspended || destroyed || fatal || detachedTimer !== null) return
    detachedTimer = setTimeout(checkDetached, detachedPollIntervalMs)
  }

  const checkDetached = () => {
    detachedTimer = null
    if (!detached || suspended || destroyed || fatal) return
    const state = discoverTmuxClientState(getClientState)
    const validation = validateClientRecovery(state, expectedClient, label)
    if (validation.status === "detached") {
      scheduleDetachedPoll()
      return
    }
    if (validation.status === "failed") {
      fail(validation.error)
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
    if (!lease.hasSymbols()) {
      fail(actionable("native SHM symbols became unavailable while polling"))
      return
    }
    let consumed: number
    try {
      consumed = lease.isConsumed(current.handle)
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
        lease.releaseHandle(current.handle)
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
        lease.releaseHandle(current.handle)
      } catch (error) {
        fail(toError(error, "shared-memory cleanup failed"))
        return
      }
      const timeoutError = actionable(`timed out after ${timeoutMs}ms waiting for terminal consumption (SHM handle ${current.handle})`)
      const state = getClientState ? discoverTmuxClientState(getClientState) : null
      const validation = validateClientAtTimeout(state, expectedClient, label, timeoutError)
      if (validation.status === "detached") {
        detached = { frame: pending ?? current.frame }
        pending = null
        lastUpload = null
        gridGeometry = null
        scheduleDetachedPoll()
        return
      }
      fail(validation.error)
      return
    }
    current.timer = setTimeout(poll, pollIntervalMs)
  }

  const scheduleDrainPoll = () => {
    if (drainTimer !== null || suspended || destroyed || fatal) return
    drainTimer = setTimeout(checkDrain, pollIntervalMs)
  }

  const checkDrain = () => {
    drainTimer = null
    if (!useRing || fatal || destroyed || suspended) return
    if (!lease.hasSymbols()) return

    const isDrained = lease.isDrained()
    if (isDrained) {
      active = null
      if (pending && !suspended && !destroyed && !fatal) {
        const next = pending
        pending = null
        try {
          startRing(next)
        } catch {
          // startRing records and reports the fatal error
        }
      }
      settleDrains(fatal ?? undefined)
      if (drains.size > 0 && active) {
        scheduleDrainPoll()
      }
      return
    }

    if (active && timeoutMs !== Infinity && now() - active.startedAt >= timeoutMs) {
      const currentFrame = active.frame
      active = null
      const timeoutError = actionable(`timed out after ${timeoutMs}ms waiting for terminal consumption`)
      const state = getClientState ? discoverTmuxClientState(getClientState) : null
      const validation = validateClientAtTimeout(state, expectedClient, label, timeoutError)
      if (validation.status === "detached") {
        detached = { frame: pending ?? currentFrame }
        pending = null
        lastUpload = null
        gridGeometry = null
        scheduleDetachedPoll()
        return
      }
      fail(validation.error)
      return
    }

    scheduleDrainPoll()
  }

  function startRing(frame: TmuxShmFrame): NativePresentationStats | null {
    if (fatal) throw fatal
    if (suspended || destroyed) return null
    if (frame.transmissionMode !== "shm") {
      const error = actionable(`runtime transmissionMode must be "shm" (received "${frame.transmissionMode}")`)
      fail(error)
      throw error
    }
    try {
      const isNewGeometry = gridGeometry === null || gridGeometry !== frameGeometry(frame)
      const result = lease.emitRing(frame.context, frame.target, imageId, frame.cols, frame.rows, isNewGeometry)

      if (result.status === "full") {
        // ERR_SHM_RING_FULL: Ring is saturated awaiting terminal consumption.
        pending = frame
        scheduleDrainPoll()
        return null
      }

      gridGeometry = frameGeometry(frame)
      lastUpload = { placement: result.placement, emittedAt: now() }
      active = { handle: 0n, placement: result.placement, startedAt: now(), timer: null, frame }
      try { onPresented(result.stats) } catch { /* telemetry must not break presentation */ }
      return result.stats
    } catch (error) {
      const result = toError(error, "native emit failed")
      fail(result)
      throw result
    }
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
      const isNewGeometry = gridGeometry === null || gridGeometry !== frameGeometry(frame)
      const emitted = lease.emitFrame(frame.context, frame.target, imageId, frame.cols, frame.rows, isNewGeometry)
      gridGeometry = frameGeometry(frame)
      active = { handle: emitted.handle, placement: emitted.placement, startedAt: now(), timer: null, frame }
      lastUpload = { placement: emitted.placement, emittedAt: now() }
      active.timer = setTimeout(poll, pollIntervalMs)
      try { onPresented(emitted.stats) } catch { /* telemetry must not break presentation */ }
      return emitted.stats
    } catch (error) {
      const result = toError(error, "native emit failed")
      fail(result)
      throw result
    }
  }

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
    if (!options.onData || unsubscribeApc || fatal || suspended || destroyed) return
    unsubscribeApc = subscribeApcResponses(options.onData, observeResponse)
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
      if (useRing) {
        if (active) {
          const isDrained = lease.isDrained()
          if (isDrained) {
            active = null
            stopDrainPoll()
          } else {
            pending = frame
            scheduleDrainPoll()
            return null
          }
        }
        return startRing(frame)
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
      if (useRing) {
        const isDrained = lease.isDrained()
        if (isDrained && !pending && !detached) {
          active = null
          return Promise.resolve()
        }
        return new Promise<void>((resolve, reject) => {
          drains.add({ resolve, reject })
          scheduleDrainPoll()
        })
      }
      if (!active && !pending && !detached) return Promise.resolve()
      return new Promise<void>((resolve, reject) => drains.add({ resolve, reject }))
    },
    invalidate() {
      gridGeometry = null
    },
    forgetTarget(target) {
      // Active transfers own their copied pixels. Only queued metadata still
      // borrows the target and must be withdrawn before its owner frees it.
      if (pending?.target === target) pending = null
      if (detached?.frame.target === target) { detached = null; stopDetached() }
      settleDrains(fatal ?? undefined)
    },
    suspend() {
      if (destroyed) return
      suspended = true
      stopDetached()
      stopDrainPoll()
      detached = null
      pending = null
      stopActiveAndCleanupImage()
      lease.cleanupAll()
      lastUpload = null
      unsubscribeApc?.()
      unsubscribeApc = null
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
      stopDrainPoll()
      detached = null
      pending = null
      stopActiveAndCleanupImage()
      lease.cleanupAll()
      unsubscribeApc?.()
      unsubscribeApc = null
      settleDrains(fatal ?? undefined)
    },
  }
  return controller
}
