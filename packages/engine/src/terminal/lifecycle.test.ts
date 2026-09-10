import { describe, expect, test } from "bun:test"

describe("terminal process cleanup", () => {
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

  test("leave concatenates all escape sequences into a single write call", async () => {
    const { leave } = await import("./lifecycle")
    const { inferCaps } = await import("./caps")
    const writes: string[] = []
    const fakeStdin = { isTTY: false, isRaw: false, setRawMode: () => {} } as unknown as NodeJS.ReadStream
    const state = { active: true, rawModeWas: false }
    leave(fakeStdin, (data: string) => writes.push(data), inferCaps("xterm"), state)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain("\x1b[?25h") // cursorShow
    expect(writes[0]).toContain("\x1b[?1049l") // altScreenLeave
    expect(writes[0]).toContain("\x1b[0m") // reset
  })

  test("installExitHandlers invokes syncWrite when provided during exit cleanup", () => {
    const path = `${import.meta.dir}/lifecycle.ts`
    const capsPath = `${import.meta.dir}/caps.ts`
    const script = `
      import { inferCaps } from "${capsPath.replaceAll('"', '\\"')}"
      import { installExitHandlers } from "${path.replaceAll('"', '\\"')}"
      const state = { active: true, rawModeWas: false }
      installExitHandlers(
        process.stdin,
        () => process.stdout.write("async-write\\n"),
        inferCaps("unknown"),
        state,
        () => {},
        () => process.stdout.write("sync-write\\n"),
      )
      process.exit(0)
    `
    const child = Bun.spawnSync([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" })
    expect(child.exitCode).toBe(0)
    const out = child.stdout.toString()
    expect(out).toContain("sync-write")
    expect(out).not.toContain("async-write")
  })
})
