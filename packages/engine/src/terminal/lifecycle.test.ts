import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { EventEmitter } from "node:events"
import { inferCaps } from "./caps"
import { createTerminal } from "./index"
import { installExitHandlers, setupExitHandlers, ProcessSignalHub, type LifecycleState } from "./lifecycle"

const signals = ["SIGINT", "SIGTERM", "SIGHUP", "exit", "uncaughtException", "unhandledRejection"] as const
type Signal = (typeof signals)[number]
const getCounts = (): Record<Signal, number> =>
  Object.fromEntries(signals.map((s) => [s, process.listenerCount(s)])) as Record<Signal, number>

describe("terminal process cleanup", () => {
  beforeEach(() => {
    ProcessSignalHub.resetForTesting()
  })

  afterEach(() => {
    ProcessSignalHub.resetForTesting()
  })

  test("runs transport cleanup before leave on process exit", () => {
    const path = `${import.meta.dir}/lifecycle.ts`
    const capsPath = `${import.meta.dir}/caps.ts`
    const script = `
      import { inferCaps } from "${capsPath.replaceAll('"', '\\"')}"
      import { installExitHandlers } from "${path.replaceAll('"', '\\"')}"
      const state = { active: true, rawModeWas: false }
      installExitHandlers(process.stdin, () => process.stdout.write("leave\\n"), inferCaps("unknown"), state, () => process.stdout.write("transport-cleanup\\n"))
      const signal = process.argv[1]
      if (signal === "exit") process.exit(0)
      process.kill(process.pid, signal)
    `
    const run = (signal: string) => Bun.spawnSync([process.execPath, "-e", script, signal], { stdout: "pipe", stderr: "pipe" })
    for (const [signal, code] of [["exit", 0], ["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const) {
      const child = run(signal)
      expect(child.exitCode).toBe(code)
      const lines = child.stdout.toString().trim().split("\n")
      expect(lines.length).toBeGreaterThan(1)
      expect(lines[0]).toBe("transport-cleanup")
      expect(lines.filter((line) => line === "transport-cleanup")).toHaveLength(1)
      expect(lines.slice(1).every((line) => line === "leave")).toBe(true)
    }
  })

  test("writes error to stderr and cleans up on uncaught exception", () => {
    const path = `${import.meta.dir}/lifecycle.ts`
    const capsPath = `${import.meta.dir}/caps.ts`
    const script = `
      import { inferCaps } from "${capsPath.replaceAll('"', '\\"')}"
      import { installExitHandlers } from "${path.replaceAll('"', '\\"')}"
      const state = { active: true, rawModeWas: false }
      installExitHandlers(process.stdin, () => process.stdout.write("leave\\n"), inferCaps("unknown"), state, () => process.stdout.write("transport-cleanup\\n"))
      throw new Error("fatal test crash")
    `
    const child = Bun.spawnSync([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" })
    expect(child.exitCode).toBe(1)
    const stderr = child.stderr.toString()
    expect(stderr).toContain("fatal test crash")
    const stdout = child.stdout.toString().trim().split("\n")
    expect(stdout[0]).toBe("transport-cleanup")
    expect(stdout.slice(1).every((line) => line === "leave")).toBe(true)
  })

  test("multiple registrations use a single set of listeners on process", () => {
    const fakeStdin = new EventEmitter() as any
    const fakeWrite = () => {}
    const caps = inferCaps("unknown")
    const state1: LifecycleState = { active: true, rawModeWas: false }
    const state2: LifecycleState = { active: true, rawModeWas: false }

    const base = getCounts()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }

    const teardown1 = installExitHandlers(fakeStdin, fakeWrite, caps, state1)
    expect(ProcessSignalHub.activeCount).toBe(1)
    expect(ProcessSignalHub.isAttached).toBe(true)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig] + 1)
    }

    const teardown2 = installExitHandlers(fakeStdin, fakeWrite, caps, state2)
    expect(ProcessSignalHub.activeCount).toBe(2)
    expect(ProcessSignalHub.isAttached).toBe(true)
    // Crucial invariant: Still exactly 1 listener per signal, no duplicate listeners!
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig] + 1)
    }

    teardown1()
    teardown2()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
  })

  test("when all registrations are removed, all listeners on process are detached", () => {
    const fakeStdin = new EventEmitter() as any
    const fakeWrite = () => {}
    const caps = inferCaps("unknown")
    const state1: LifecycleState = { active: true, rawModeWas: false }
    const state2: LifecycleState = { active: true, rawModeWas: false }

    const base = getCounts()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)

    const teardown1 = installExitHandlers(fakeStdin, fakeWrite, caps, state1)
    const teardown2 = installExitHandlers(fakeStdin, fakeWrite, caps, state2)
    expect(ProcessSignalHub.activeCount).toBe(2)
    expect(ProcessSignalHub.isAttached).toBe(true)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig] + 1)
    }

    teardown1()
    expect(ProcessSignalHub.activeCount).toBe(1)
    expect(ProcessSignalHub.isAttached).toBe(true)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig] + 1)
    }

    teardown2()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
  })

  test("manageProcessSignals: false bypasses process.on entirely", () => {
    const fakeStdin = new EventEmitter() as any
    const fakeWrite = () => {}
    const caps = inferCaps("unknown")
    const state: LifecycleState = { active: true, rawModeWas: false }

    const base = getCounts()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }

    const teardown = installExitHandlers(fakeStdin, fakeWrite, caps, state, {
      manageProcessSignals: false,
    })

    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }

    teardown()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
  })

  test("signal: AbortSignal triggers cleanup symmetrically", () => {
    const fakeStdin = new EventEmitter() as any
    let leaveCalled = false
    const fakeWrite = () => { leaveCalled = true }
    const caps = inferCaps("unknown")
    const state: LifecycleState = { active: true, rawModeWas: false }

    const base = getCounts()
    const controller = new AbortController()
    let beforeLeaveRan = false
    const teardown = installExitHandlers(
      fakeStdin,
      fakeWrite,
      caps,
      state,
      () => { beforeLeaveRan = true },
      { signal: controller.signal },
    )

    expect(state.active).toBe(true)
    expect(beforeLeaveRan).toBe(false)
    expect(ProcessSignalHub.activeCount).toBe(1)
    expect(ProcessSignalHub.isAttached).toBe(true)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig] + 1)
    }

    controller.abort()

    expect(beforeLeaveRan).toBe(true)
    expect(state.active).toBe(false)
    expect(leaveCalled).toBe(true)
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }

    // Teardown is safe and idempotent after abort
    expect(() => teardown()).not.toThrow()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
  })

  test("signal: AbortSignal with manageProcessSignals: false triggers cleanup symmetrically without touching process", () => {
    const fakeStdin = new EventEmitter() as any
    const fakeWrite = () => {}
    const caps = inferCaps("unknown")
    const state: LifecycleState = { active: true, rawModeWas: false }

    const base = getCounts()
    const controller = new AbortController()
    let beforeLeaveRan = false
    const teardown = installExitHandlers(
      fakeStdin,
      fakeWrite,
      caps,
      state,
      () => { beforeLeaveRan = true },
      { signal: controller.signal, manageProcessSignals: false },
    )

    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
    expect(state.active).toBe(true)

    controller.abort()

    expect(beforeLeaveRan).toBe(true)
    expect(state.active).toBe(false)
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }

    teardown()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
  })

  test("already-aborted signal triggers cleanup immediately", () => {
    const fakeStdin = new EventEmitter() as any
    const fakeWrite = () => {}
    const caps = inferCaps("unknown")
    const state: LifecycleState = { active: true, rawModeWas: false }

    const base = getCounts()
    const controller = new AbortController()
    controller.abort()

    let beforeLeaveRan = false
    const teardown = installExitHandlers(
      fakeStdin,
      fakeWrite,
      caps,
      state,
      () => { beforeLeaveRan = true },
      { signal: controller.signal },
    )

    expect(beforeLeaveRan).toBe(true)
    expect(state.active).toBe(false)
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
    teardown()
    expect(ProcessSignalHub.activeCount).toBe(0)
    expect(ProcessSignalHub.isAttached).toBe(false)
    for (const sig of signals) {
      expect(process.listenerCount(sig)).toBe(base[sig])
    }
  })

  test("setupExitHandlers alias behaves identically to installExitHandlers", () => {
    expect(setupExitHandlers).toBe(installExitHandlers)
  })

  test("createTerminal destroys terminal when opts.signal aborts", async () => {
    const origTmux = process.env.TMUX
    delete process.env.TMUX
    try {
      const fakeStdin = new EventEmitter() as any
      fakeStdin.isTTY = false
      fakeStdin.isRaw = false
      fakeStdin.setRawMode = () => {}

      const fakeStdout = new EventEmitter() as any
      fakeStdout.write = () => true
      fakeStdout.columns = 80
      fakeStdout.rows = 24

      const controller = new AbortController()
      const term = await createTerminal({
        stdin: fakeStdin,
        stdout: fakeStdout,
        skipProbe: true,
        skipColors: true,
        manageProcessSignals: false,
        signal: controller.signal,
      })

      let destroyCalled = false
      const origDestroy = term.destroy
      term.destroy = () => {
        destroyCalled = true
        origDestroy()
      }

      controller.abort()
      expect(destroyCalled).toBe(true)
    } finally {
      if (origTmux !== undefined) process.env.TMUX = origTmux
    }
  })
})
