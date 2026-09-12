import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPiController } from "./controller"
import { defaultSessionDirectory } from "./sessions"

const piAvailable = existsSync("/opt/homebrew/bin/pi")
const piSuite = piAvailable ? describe : describe.skip

piSuite("Pi controller integration", () => {
  test("stop cancels the actual Pi bash process and retires only that request", async () => {
    const root = await mkdtemp(join(tmpdir(), "vexart-pi-stop-"))
    const controller = createPiController({ cwd: root, agentDir: join(root, "agent"), executable: "/opt/homebrew/bin/pi", args: ["--no-extensions", "--no-skills", "--offline"] })
    let unsubscribe = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await controller.start()
      // With no user shell active, the same API uses Pi's agent abort route.
      await controller.stop()
      const started = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Pi bash did not start")), 5000)
        unsubscribe = controller.subscribe(() => {
          if (controller.snapshot().events.some((event) => event.type === "bash_execution_update" && event.delta === "STOP_READY")) resolve()
        })
      })
      const running = controller.command("bash", { command: "printf STOP_READY; sleep 30" })
      await started
      const before = Date.now()
      await controller.stop()
      expect(await running).toMatchObject({ cancelled: true })
      expect(Date.now() - before).toBeLessThan(5000)
      expect(controller.snapshot().busy).toBe(false)
      expect(controller.snapshot().events.filter((event) => event.type === "bash_execution_update").every((event) => event.reconciled === true)).toBe(true)
    } finally {
      if (timer) clearTimeout(timer)
      unsubscribe()
      await controller.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 10000)

  test("close and restart preserves ownership of subsequent bash cancellation", async () => {
    const root = await mkdtemp(join(tmpdir(), "vexart-pi-restart-"))
    const controller = createPiController({ cwd: root, agentDir: join(root, "agent"), executable: "/opt/homebrew/bin/pi", args: ["--no-extensions", "--no-skills", "--offline"], shutdownTimeoutMs: 100 })
    const wait = (text: string) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { stop(); reject(new Error(`Pi did not emit ${text}`)) }, 5000)
      const stop = controller.subscribe(() => {
        if (controller.snapshot().events.some((event) => event.type === "bash_execution_update" && event.delta === text)) { clearTimeout(timer); stop(); resolve() }
      })
    })
    try {
      await controller.start()
      const ready = wait("FIRST_READY")
      const first = controller.command("bash", { command: "printf FIRST_READY; sleep 30" }).then(() => "completed", () => "closed")
      await ready
      await controller.close()
      await controller.start()
      const again = wait("SECOND_READY")
      const second = controller.command("bash", { command: "printf SECOND_READY; sleep 30" })
      await again
      const before = Date.now()
      await controller.stop()
      expect(await second).toMatchObject({ cancelled: true })
      expect(Date.now() - before).toBeLessThan(5000)
      expect(controller.snapshot().busy).toBe(false)
      expect(await first).toBe("closed")
    } finally {
      await controller.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 10000)

  test("drives real state, tools, sessions, tree, fork, and model enumeration", async () => {
    const root = await mkdtemp(join(tmpdir(), "vexart-pi-integration-"))
    const cwd = join(root, "workspace")
    const agentDir = join(root, "agent")
    await mkdir(cwd)
    const controller = createPiController({ cwd, agentDir, executable: "/opt/homebrew/bin/pi", args: ["--no-extensions", "--no-skills", "--offline"] })
    try {
      await controller.start()
      expect(controller.snapshot().connected).toBe(true)
      expect(controller.snapshot().state?.sessionId).toEqual(expect.any(String))
      expect(controller.snapshot().models).toEqual([])

      const bash = await controller.command("bash", { command: "printf pi-backend" })
      expect(bash).toMatchObject({ output: "pi-backend", exitCode: 0, cancelled: false })
      await controller.refresh()
      expect(controller.snapshot().events.some((event) => event.type === "bash_execution_update")).toBe(true)
      expect(controller.snapshot().stats?.totalMessages).toBe(1)
      expect(controller.snapshot().tree).not.toBeNull()

      const sessionPath = await writeSyntheticSession(cwd, agentDir)
      const summaries = await controller.listSessions()
      expect(summaries.some((session) => session.path === sessionPath && session.name === "RPC fixture" && session.messageCount === 1)).toBe(true)

      const switched = await controller.command("switch_session", { sessionPath })
      expect(switched).toEqual({ cancelled: false })
      const forkMessages = await controller.command("get_fork_messages")
      expect(forkMessages).toEqual({ messages: [{ entryId: "user0001", text: "branch me" }] })
      const forked = await controller.command("fork", { entryId: "user0001" })
      expect(forked).toMatchObject({ text: "branch me", cancelled: false })
      const fresh = await controller.command("new_session")
      expect(fresh).toEqual({ cancelled: false })
      expect(controller.snapshot().connected).toBe(true)
      expect(controller.snapshot().tree).not.toBeNull()
    } finally {
      await controller.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})

async function writeSyntheticSession(cwd: string, agentDir: string): Promise<string> {
  const dir = defaultSessionDirectory(cwd, agentDir)
  await mkdir(dir, { recursive: true })
  const path = join(dir, "fixture.jsonl")
  const timestamp = new Date().toISOString()
  const header = { type: "session", version: 3, id: "fixture-session", timestamp, cwd }
  const info = { type: "session_info", id: "info0001", parentId: null, timestamp, name: "RPC fixture" }
  const message = { type: "message", id: "user0001", parentId: "info0001", timestamp, message: { role: "user", content: "branch me", timestamp: Date.now() } }
  await writeFile(path, [header, info, message].map((entry) => JSON.stringify(entry)).join("\n") + "\n")
  return path
}
