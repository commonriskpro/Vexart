import { describe, expect, test } from "bun:test"
import { createTmuxShmPresentation, type TmuxShmNativeAdapter } from "./tmux-shm-presentation"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function makeNative(options: { releaseCode?: number; deleteCode?: number } = {}) {
  let nextHandle = 1n
  const consumed = new Set<bigint>()
  const emitted: { handle: bigint; context: bigint; target: bigint; params: Uint32Array }[] = []
  const released: bigint[] = []
  const deleted: number[] = []
  const native: TmuxShmNativeAdapter = {
    emit(context, target, params) {
      const handle = nextHandle++
      emitted.push({ handle, context, target, params: new Uint32Array(params) })
      return { handle, stats: null }
    },
    isConsumed(handle) {
      return consumed.has(handle) ? 1 : 0
    },
    release(handle) {
      released.push(handle)
      return options.releaseCode ?? 0
    },
    deleteImage(_context, imageId) {
      deleted.push(imageId)
      return options.deleteCode ?? 0
    },
  }
  return { native, consumed, emitted, released, deleted }
}

const client = {
  tty: "/dev/ttys001",
  termName: "xterm-ghostty",
  termFeatures: "256,RGB,focus",
  passthroughAll: true,
  rgb: true,
}

function frame(width = 80, height = 40, cols = 10, rows = 5, transmissionMode: "shm" | "direct" = "shm") {
  return { context: 1n, target: BigInt(width * 100 + height), width, height, cols, rows, transmissionMode }
}

describe("tmux SHM presentation controller", () => {
  test("coalesces frames and starts the latest frame after SHM consumption", async () => {
    const fake = makeNative()
    const controller = createTmuxShmPresentation({ native: fake.native, imageId: 9001, pollIntervalMs: 1, timeoutMs: 100 })
    try {
      controller.present(frame())
      controller.present(frame(81, 40))
      expect(fake.emitted).toHaveLength(1)
      expect(fake.emitted[0].params[1]).toBe(1)
      expect(fake.emitted[0].params[4]).toBe(1)

      fake.consumed.add(1n)
      await sleep(8)
      expect(fake.emitted).toHaveLength(2)
      expect(fake.emitted[1].params[1]).toBe(2)
      expect(fake.emitted[1].params[4]).toBe(1) // pixel geometry changed
      fake.consumed.add(2n)
      await controller.waitForDrain()
      expect(fake.released).toEqual([1n, 2n])
    } finally {
      controller.destroy()
    }
  })

  test("does not wait for an ACK and ignores a late success after consumption", async () => {
    const fake = makeNative()
    const dataState = { feed: null as ((data: Buffer) => void) | null }
    const errors: Error[] = []
    const controller = createTmuxShmPresentation({
      native: fake.native,
      imageId: 9002,
      pollIntervalMs: 1,
      timeoutMs: 100,
      onData(handler) {
        dataState.feed = handler
        return () => { dataState.feed = null }
      },
      onError: (error) => errors.push(error),
    })
    try {
      controller.present(frame())
      fake.consumed.add(1n)
      await controller.waitForDrain()
      dataState.feed?.(Buffer.from("\x1b_Gi=9002,p=1;OK\x1b\\"))
      expect(errors).toHaveLength(0)
      expect(() => controller.present(frame())).not.toThrow()
    } finally {
      controller.destroy()
    }
  })

  test("surfaces a terminal rejection once and makes future frames fail", async () => {
    const fake = makeNative()
    const dataState = { feed: null as ((data: Buffer) => void) | null }
    const errors: Error[] = []
    const controller = createTmuxShmPresentation({
      native: fake.native,
      imageId: 9003,
      pollIntervalMs: 1,
      timeoutMs: 100,
      onData(handler) {
        dataState.feed = handler
        return () => { dataState.feed = null }
      },
      onError: (error) => errors.push(error),
    })
    try {
      controller.present(frame())
      fake.consumed.add(1n)
      await controller.waitForDrain()
      dataState.feed?.(Buffer.from("\x1b_Gi=9003,p=1;ENOENT\x1b\\"))
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("rejected")
      expect(() => controller.present(frame())).toThrow(/tmux SHM presentation failed/)
      expect(fake.released).toEqual([1n])
    } finally {
      controller.destroy()
    }
  })

  test("times out with cleanup rather than retrying forever", async () => {
    const fake = makeNative()
    const errors: Error[] = []
    const controller = createTmuxShmPresentation({ native: fake.native, imageId: 9004, pollIntervalMs: 1, timeoutMs: 5, onError: (error) => errors.push(error) })
    try {
      controller.present(frame())
      await expect(controller.waitForDrain()).rejects.toThrow(/timed out after 5ms/)
      expect(fake.released).toEqual([1n])
      expect(errors).toHaveLength(1)
      expect(() => controller.present(frame())).toThrow()
    } finally {
      controller.destroy()
    }
  })

  test("pauses on zero clients, coalesces detached frames, and drains after reattach", async () => {
    const fake = makeNative()
    const states = [{ kind: "zero" as const }, { kind: "single" as const, client }]
    const errors: Error[] = []
    const dataState = { feed: null as ((data: Buffer) => void) | null }
    const controller = createTmuxShmPresentation({
      native: fake.native,
      imageId: 9010,
      pollIntervalMs: 1,
      timeoutMs: 5,
      detachedPollIntervalMs: 250,
      expectedClient: client,
      getClientState: () => states.shift() ?? { kind: "single" as const, client },
      onData: (handler) => {
        dataState.feed = handler
        return () => { dataState.feed = null }
      },
      onError: (error) => errors.push(error),
    })
    try {
      controller.present(frame())
      const drain = controller.waitForDrain()
      let drained = false
      drain.then(() => { drained = true })
      await sleep(12)
      expect(controller.fatalError).toBeNull()
      expect(fake.released).toEqual([1n])
      expect(drained).toBe(false)
      dataState.feed?.(Buffer.from("\x1b_Gi=9010,p=1;EIO:stale\x1b\\"))
      expect(errors).toHaveLength(0)

      controller.present(frame(81, 40))
      controller.present(frame(82, 40))
      while (fake.emitted.length < 2) await sleep(5)
      expect(fake.emitted).toHaveLength(2)
      expect(fake.emitted[1].target).toBe(frame(82, 40).target)
      expect(fake.emitted[1].params[1]).toBe(2)
      expect(fake.emitted[1].params[4]).toBe(1)
      fake.consumed.add(2n)
      await drain
      expect(errors).toHaveLength(0)
    } finally {
      controller.destroy()
    }
  })

  test("fails closed when a client remains attached at timeout", async () => {
    const fake = makeNative()
    const errors: Error[] = []
    const controller = createTmuxShmPresentation({
      native: fake.native,
      imageId: 9011,
      pollIntervalMs: 1,
      timeoutMs: 5,
      expectedClient: client,
      getClientState: () => ({ kind: "single", client }),
      onError: (error) => errors.push(error),
    })
    try {
      controller.present(frame())
      await expect(controller.waitForDrain()).rejects.toThrow(/timed out after 5ms/)
      expect(controller.fatalError).not.toBeNull()
      expect(errors).toHaveLength(1)
    } finally {
      controller.destroy()
    }
  })

  test("fails closed for multiple or unknown clients during recovery", async () => {
    for (const state of [
      { kind: "multiple" as const, count: 2 },
      { kind: "unknown" as const, reason: "query timeout" },
    ]) {
      const fake = makeNative()
      const errors: Error[] = []
      const controller = createTmuxShmPresentation({
        native: fake.native,
        imageId: state.kind === "multiple" ? 9012 : 9013,
        pollIntervalMs: 1,
        timeoutMs: 5,
        expectedClient: client,
        getClientState: () => state,
        onError: (error) => errors.push(error),
      })
      try {
        controller.present(frame())
        await expect(controller.waitForDrain()).rejects.toThrow(/attached client|could not verify|timed out/)
        expect(controller.fatalError).not.toBeNull()
        expect(errors).toHaveLength(1)
      } finally {
        controller.destroy()
      }
    }
  })

  test("rejects a different client identity or reduced graphics capacity", async () => {
    const cases = [
      {
        imageId: 9016,
        state: { kind: "single" as const, client: { ...client, tty: "/dev/ttys002" } },
        message: /identity changed/,
      },
      {
        imageId: 9017,
        state: { kind: "single" as const, client: { ...client, rgb: false } },
        message: /capability changed/,
      },
    ]
    for (const item of cases) {
      const fake = makeNative()
      let first = true
      const errors: Error[] = []
      const controller = createTmuxShmPresentation({
        native: fake.native,
        imageId: item.imageId,
        pollIntervalMs: 1,
        timeoutMs: 5,
        detachedPollIntervalMs: 250,
        expectedClient: client,
        getClientState: () => {
          if (first) {
            first = false
            return { kind: "zero" as const }
          }
          return item.state
        },
        onError: (error) => errors.push(error),
      })
      try {
        controller.present(frame())
        await expect(controller.waitForDrain()).rejects.toThrow(item.message)
        expect(controller.fatalError).not.toBeNull()
        expect(errors).toHaveLength(1)
      } finally {
        controller.destroy()
      }
    }
  })

  test("suspend and destroy clear a paused recovery state", async () => {
    for (const action of ["suspend", "destroy"] as const) {
      const fake = makeNative()
      const controller = createTmuxShmPresentation({
        native: fake.native,
        imageId: action === "suspend" ? 9014 : 9015,
        pollIntervalMs: 1,
        timeoutMs: 5,
        detachedPollIntervalMs: 250,
        expectedClient: client,
        getClientState: () => ({ kind: "zero" as const }),
      })
      try {
        controller.present(frame())
        const drain = controller.waitForDrain()
        await sleep(12)
        controller[action]()
        await drain
        expect(fake.released).toEqual([1n])
        expect(fake.deleted).toEqual([action === "suspend" ? 9014 : 9015])
        expect(controller.fatalError).toBeNull()
      } finally {
        controller.destroy()
      }
    }
  })

  test("rejects the drain and retains release failures during suspend and destroy", async () => {
    for (const action of ["suspend", "destroy"] as const) {
      const fake = makeNative({ releaseCode: -7 })
      const errors: Error[] = []
      const controller = createTmuxShmPresentation({
        native: fake.native,
        imageId: action === "suspend" ? 9018 : 9019,
        onError: (error) => errors.push(error),
      })
      try {
        controller.present(frame())
        const drain = controller.waitForDrain()
        controller[action]()
        await expect(drain).rejects.toThrow(/shared-memory cleanup returned -7/)
        expect(controller.fatalError?.message).toContain("shared-memory cleanup returned -7")
        expect(fake.released).toEqual([1n])
        expect(errors).toHaveLength(1)
      } finally {
        controller.destroy()
      }
    }
  })

  test("reports owned-image cleanup failure without replacing the original fatal", async () => {
    const fake = makeNative({ deleteCode: -9 })
    const errors: Error[] = []
    const dataState = { feed: null as ((data: Buffer) => void) | null }
    const controller = createTmuxShmPresentation({
      native: fake.native,
      imageId: 9020,
      pollIntervalMs: 1,
      timeoutMs: 100,
      onData(handler) {
        dataState.feed = handler
        return () => { dataState.feed = null }
      },
      onError: (error) => errors.push(error),
    })
    try {
      controller.present(frame())
      const drain = controller.waitForDrain()
      fake.consumed.add(1n)
      await drain
      dataState.feed?.(Buffer.from("\x1b_Gi=9020,p=1;ENOENT\x1b\\"))
      expect(controller.fatalError?.message).toContain("terminal rejected image")
      expect(errors).toHaveLength(2)
      expect(errors.map((error) => error.message)).toEqual(expect.arrayContaining([
        expect.stringContaining("terminal rejected image"),
        expect.stringContaining("owned image cleanup returned -9"),
      ]))
      expect(fake.deleted).toEqual([9020])
    } finally {
      controller.destroy()
    }
  })

  test("reports release cleanup and the later fatal as distinct errors", async () => {
    const fake = makeNative({ releaseCode: -7 })
    const errors: Error[] = []
    const controller = createTmuxShmPresentation({ native: fake.native, onError: (error) => errors.push(error) })
    try {
      controller.present(frame())
      const drain = controller.waitForDrain()
      expect(() => controller.present(frame(80, 40, 10, 5, "direct"))).toThrow(/transmissionMode/)
      await expect(drain).rejects.toThrow(/transmissionMode/)
      expect(controller.fatalError?.message).toContain("transmissionMode")
      expect(errors).toHaveLength(2)
      expect(errors.map((error) => error.message)).toEqual(expect.arrayContaining([
        expect.stringContaining("shared-memory cleanup returned -7"),
        expect.stringContaining("transmissionMode"),
      ]))
    } finally {
      controller.destroy()
    }
  })

  test("suspend releases the segment and owned image; resume emits a fresh grid", async () => {
    const fake = makeNative()
    const controller = createTmuxShmPresentation({ native: fake.native, imageId: 9005, pollIntervalMs: 1, timeoutMs: 100 })
    try {
      controller.present(frame())
      controller.suspend()
      expect(fake.released).toEqual([1n])
      expect(fake.deleted).toEqual([9005])
      controller.resume()
      controller.present(frame())
      expect(fake.emitted[1].params[1]).toBe(2)
      expect(fake.emitted[1].params[4]).toBe(1)
    } finally {
      controller.destroy()
    }
  })

  test("detaches stale response parsing while suspended and reattaches on resume", () => {
    const fake = makeNative()
    const feeds: Array<(data: Buffer) => void> = []
    const errors: Error[] = []
    let currentFeed: ((data: Buffer) => void) | null = null
    const readCurrentFeed = () => currentFeed
    const controller = createTmuxShmPresentation({
      native: fake.native,
      imageId: 9006,
      onData(handler) {
        feeds.push(handler)
        currentFeed = handler
        return () => {
          if (currentFeed === handler) currentFeed = null
        }
      },
      onError: (error) => errors.push(error),
    })
    try {
      controller.present(frame())
      const firstFeed = feeds[0]
      firstFeed(Buffer.from("\x1b_Gi=9006,p=1;ENO"))

      controller.suspend()
      firstFeed(Buffer.from("ENT\x1b\\"))
      expect(controller.fatalError).toBeNull()
      expect(errors).toHaveLength(0)
      expect(readCurrentFeed()).toBeNull()

      controller.resume()
      expect(readCurrentFeed()).toBe(feeds[1])
      feeds[1](Buffer.from("\x1b_Gi=9006,p=1;ENOENT\x1b\\"))
      expect(controller.fatalError).toBeNull()

      controller.present(frame())
      feeds[1](Buffer.from("\x1b_Gi=9006,p=2;ENOENT\x1b\\"))
      expect(controller.fatalError?.message).toContain("rejected")
      expect(errors).toHaveLength(1)
    } finally {
      controller.destroy()
    }
  })

  test("rejects non-SHM runtime modes without fallback", () => {
    const fake = makeNative()
    const errors: Error[] = []
    const controller = createTmuxShmPresentation({ native: fake.native, onError: (error) => errors.push(error) })
    try {
      expect(() => controller.present(frame(80, 40, 10, 5, "direct"))).toThrow(/transmissionMode/)
      expect(fake.emitted).toHaveLength(0)
      expect(errors).toHaveLength(1)
    } finally {
      controller.destroy()
    }
  })
})
