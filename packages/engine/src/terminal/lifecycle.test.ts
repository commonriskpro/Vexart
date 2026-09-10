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
})
