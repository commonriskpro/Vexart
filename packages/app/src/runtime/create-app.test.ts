import { describe, expect, test } from "bun:test"

describe("createApp terminal teardown protection", () => {
  test("terminal.destroy is guaranteed to run even if handle.destroy throws", () => {
    const createAppPath = `${import.meta.dir}/create-app.ts`
    const script = `
      import { mock } from "bun:test"

      let terminalDestroyed = false
      const fakeTerminal = {
        destroy: () => {
          terminalDestroyed = true
          process.stdout.write("terminal:destroyed\\n")
        },
      }
      const fakeHandle = {
        destroy: () => {
          throw new Error("teardown error in solid component")
        },
        root: null,
        dispose: () => {},
        update: () => {},
      }

      mock.module("@vexart/engine", () => ({
        createTerminal: async () => fakeTerminal,
        mount: () => fakeHandle,
        onInput: () => () => {},
      }))

      const { createApp } = await import("${createAppPath.replaceAll('"', '\\"')}")
      const app = await createApp(() => null as any, { quit: [] })

      try {
        app.destroy()
        process.exit(1)
      } catch (err: any) {
        if (err?.message === "teardown error in solid component" && terminalDestroyed) {
          process.stdout.write("teardown:verified\\n")
          process.exit(0)
        }
        process.stderr.write(String(err?.message ?? err) + "\\n")
        process.exit(2)
      }
    `

    const child = Bun.spawnSync([process.execPath, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(child.exitCode).toBe(0)
    const stdout = child.stdout.toString()
    expect(stdout).toContain("terminal:destroyed")
    expect(stdout).toContain("teardown:verified")
  })
})

