import { ptr } from "bun:ffi"
import {
  openVexartLibrary,
  openKittyPlaceholderSymbols,
  openKittyShmSymbols,
} from "./vexart-bridge"
import { vexartGetLastError } from "./vexart-functions"
import {
  allocNativeStatsBuf,
  decodeNativePresentationStats,
  type NativePresentationStats,
} from "./native-presentation-stats"

export type ShmSymbols = ReturnType<typeof openKittyShmSymbols>
export type PlaceholderSymbols = ReturnType<typeof openKittyPlaceholderSymbols>

export type TmuxShmNativeAdapter = {
  emit: (context: bigint, target: bigint, params: Uint32Array) => { handle: bigint; stats: NativePresentationStats | null }
  isConsumed: (handle: bigint) => number
  release: (handle: bigint) => number
  deleteImage: (context: bigint, imageId: number) => number
}

export type TmuxShmLeaseOptions = {
  label?: string
  isPlaceholder?: boolean
  useRing?: boolean
  imageId?: number
  native?: TmuxShmNativeAdapter
  getSymbols?: () => ShmSymbols
  getPlaceholderSymbols?: () => PlaceholderSymbols
  getLastError?: () => string
  actionable: (message: string, cause?: unknown) => Error
  toError: (error: unknown, fallback: string) => Error
  reportError: (error: Error) => void
}

const imageIdSeed = (() => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return 0x80000000 + (values[0] % 0x3ffff000)
})()
let nextImageId = imageIdSeed

/** Allocate a process-global, monotonically increasing Kitty image ID. */
export function allocateImageId(): number {
  const id = nextImageId
  nextImageId = 0x80000000 + ((id - 0x80000000 + 1) % 0x3ffff000)
  return id >>> 0
}

/** Validate that an image ID is a positive safe u32. */
export function validateImageId(imageId: number, label: string): void {
  if (!Number.isSafeInteger(imageId) || imageId <= 0 || imageId > 0xffffffff) {
    throw new Error(`[vexart] ${label} presentation image id must be a positive u32 (received ${imageId})`)
  }
}

/** Manage POSIX SHM handle leasing, slot ring buffer emission, and image lifecycle. */
export function createTmuxShmLeaseManager(options: TmuxShmLeaseOptions) {
  const isPlaceholder = options.isPlaceholder ?? true
  const useRing = options.useRing ?? (options.native === undefined)
  const getLastError = options.getLastError ?? vexartGetLastError
  const actionable = options.actionable
  const toError = options.toError
  const reportError = options.reportError

  let symbols: ShmSymbols = null
  let native: TmuxShmNativeAdapter | null = options.native ?? null
  let placeholderSymbols: PlaceholderSymbols = null
  let imagePresented = false
  let lastContext: bigint | null = null
  let placement = 0

  const getSymbols = (): ShmSymbols => {
    if (!symbols) symbols = options.getSymbols?.() ?? openKittyShmSymbols()
    return symbols
  }

  const hasSymbols = (): boolean => {
    if (native) return true
    return getSymbols() !== null
  }

  const getPlaceholderSymbols = (): PlaceholderSymbols => {
    if (!placeholderSymbols) placeholderSymbols = options.getPlaceholderSymbols?.() ?? openKittyPlaceholderSymbols()
    return placeholderSymbols
  }

  const ensureNative = (): TmuxShmNativeAdapter => {
    if (native) return native
    const shmSymbols = getSymbols()
    if (!shmSymbols) {
      throw actionable(
        "native ABI is unavailable; rebuild native/libvexart with vexart_kitty_emit_placeholder_shm_frame and vexart_kitty_shm_is_consumed",
      )
    }
    native = {
      emit(context, target, params) {
        const statsBuf = allocNativeStatsBuf()
        const handleBuf = new BigUint64Array(1)
        const rc = shmSymbols.vexart_kitty_emit_placeholder_shm_frame(
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
        return shmSymbols.vexart_kitty_shm_is_consumed(handle) as number
      },
      release(handle) {
        return shmSymbols.vexart_kitty_shm_release(handle, 1) as number
      },
      deleteImage(context, id) {
        const phSymbols = getPlaceholderSymbols()
        if (!phSymbols) {
          throw actionable(
            "native cleanup ABI is unavailable; rebuild native/libvexart with vexart_kitty_delete_placeholder",
          )
        }
        return phSymbols.vexart_kitty_delete_placeholder(context, id) as number
      },
    }
    return native
  }

  const releaseHandle = (handle: bigint): void => {
    if (handle === 0n) return
    try {
      const shmSymbols = symbols ?? options.getSymbols?.() ?? null
      const rc = native
        ? native.release(handle)
        : shmSymbols
          ? shmSymbols.vexart_kitty_shm_release(handle, 1) as number
          : 0
      if (rc !== 0) throw actionable(`shared-memory cleanup returned ${rc}: ${getLastError()}`)
    } catch (error) {
      throw toError(error, "shared-memory cleanup failed")
    }
  }

  const deleteOwnedImage = (imageId: number, reportFailure = true): Error | null => {
    if (!imagePresented || lastContext === null) return null
    imagePresented = false
    try {
      const rc = native
        ? native.deleteImage(lastContext, imageId)
        : isPlaceholder
          ? (() => {
              const phSymbols = getPlaceholderSymbols()
              if (!phSymbols) {
                throw actionable(
                  "native cleanup ABI is unavailable; rebuild native/libvexart with vexart_kitty_delete_placeholder",
                )
              }
              return phSymbols.vexart_kitty_delete_placeholder(lastContext!, imageId) as number
            })()
          : (() => {
              const stats = allocNativeStatsBuf()
              return openVexartLibrary().symbols.vexart_kitty_delete_layer(lastContext!, imageId, ptr(stats)) as number
            })()
      if (rc !== 0) throw actionable(`owned image cleanup returned ${rc}: ${getLastError()}`)
    } catch (error) {
      const cleanupError = toError(error, "owned image cleanup failed")
      if (reportFailure) reportError(cleanupError)
      return cleanupError
    }
    return null
  }

  const isConsumed = (handle: bigint): number => {
    const shmSymbols = getSymbols()
    if (!native && !shmSymbols) {
      throw actionable("native SHM symbols became unavailable while polling")
    }
    return native
      ? native.isConsumed(handle)
      : shmSymbols!.vexart_kitty_shm_is_consumed(handle) as number
  }

  const isDrained = (): boolean => {
    const shmSymbols = getSymbols()
    if (!shmSymbols) return true
    return (shmSymbols.vexart_kitty_shm_is_drained() as number) === 1
  }

  const cleanupAll = (): void => {
    if (useRing) {
      const shmSymbols = getSymbols()
      if (shmSymbols) {
        try { shmSymbols.vexart_kitty_shm_cleanup_all() } catch { /* best-effort cleanup */ }
      }
    }
  }

  const emitRing = (
    context: bigint,
    target: bigint,
    imageId: number,
    cols: number,
    rows: number,
    isNewGeometry: boolean,
  ): { status: "emitted"; placement: number; stats: NativePresentationStats | null } | { status: "full" } => {
    const shmSymbols = getSymbols()
    if (!shmSymbols) {
      throw actionable(
        "native ABI is unavailable; rebuild native/libvexart with vexart_kitty_emit_placeholder_shm_ring and vexart_kitty_shm_is_drained",
      )
    }

    if (placement === 0xffffffff) {
      throw actionable("placement id exhausted; restart the renderer to allocate a fresh image id")
    }
    placement = (placement + 1) >>> 0

    const statsBuf = allocNativeStatsBuf()
    let rc: number
    if (isPlaceholder) {
      const params = new Uint32Array(5)
      params[0] = imageId >>> 0
      params[1] = placement
      params[2] = Math.max(0, Math.floor(cols)) >>> 0
      params[3] = Math.max(0, Math.floor(rows)) >>> 0
      params[4] = isNewGeometry ? 1 : 0
      rc = shmSymbols.vexart_kitty_emit_placeholder_shm_ring(
        context,
        target,
        ptr(params),
        params.byteLength,
        ptr(statsBuf),
      ) as number
    } else {
      rc = shmSymbols.vexart_kitty_emit_frame_shm_ring(
        context,
        target,
        imageId,
        ptr(statsBuf),
      ) as number
    }

    if (rc === -100) {
      return { status: "full" }
    }

    if (rc !== 0) {
      throw actionable(`native emit returned ${rc}: ${getLastError()}`)
    }

    lastContext = context
    imagePresented = true
    const stats = decodeNativePresentationStats(statsBuf)
    return { status: "emitted", placement, stats }
  }

  const emitFrame = (
    context: bigint,
    target: bigint,
    imageId: number,
    cols: number,
    rows: number,
    isNewGeometry: boolean,
  ): { placement: number; handle: bigint; stats: NativePresentationStats | null } => {
    const nativeAdapter = ensureNative()
    const params = new Uint32Array(5)
    if (placement === 0xffffffff) {
      throw actionable("placement id exhausted; restart the renderer to allocate a fresh image id")
    }
    params[0] = imageId >>> 0
    params[1] = (placement + 1) >>> 0
    params[2] = Math.max(0, Math.floor(cols)) >>> 0
    params[3] = Math.max(0, Math.floor(rows)) >>> 0
    params[4] = isNewGeometry ? 1 : 0
    placement = params[1]

    const emitted = nativeAdapter.emit(context, target, params)
    const handle = emitted.handle
    if (handle === 0n) {
      throw actionable("native emit succeeded without returning an SHM handle")
    }
    lastContext = context
    imagePresented = true
    return { handle, stats: emitted.stats, placement }
  }

  return {
    get placement() { return placement },
    get imagePresented() { return imagePresented },
    get lastContext() { return lastContext },
    get useRing() { return useRing },
    getSymbols,
    hasSymbols,
    ensureNative,
    emitRing,
    emitFrame,
    isConsumed,
    isDrained,
    releaseHandle,
    cleanupAll,
    deleteOwnedImage,
  }
}

export type TmuxShmLeaseManager = ReturnType<typeof createTmuxShmLeaseManager>
