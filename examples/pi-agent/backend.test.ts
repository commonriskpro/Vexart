import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPiController } from "./controller"
import { PiRpcClient } from "./rpc"
import { JsonlParser } from "./protocol"

const piAvailable = existsSync("/opt/homebrew/bin/pi")
const piSuite = piAvailable ? describe : describe.skip
const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("Pi RPC JSONL framing", () => {
  test("parses LF records across UTF-8 chunks without treating Unicode separators as framing", () => {
    const values: unknown[] = []
    const errors: Error[] = []
    const parser = new JsonlParser({ onValue: (value) => values.push(value), onError: (error) => errors.push(error) })
    const bytes = new TextEncoder().encode('{"text":"line break"}\r\n{"n":1}\n')
    parser.push(bytes.slice(0, 5))
    parser.push(bytes.slice(5, 12))
    parser.push(bytes.slice(12))
    parser.end()

    expect(values).toEqual([{ text: "line break" }, { n: 1 }])
    expect(errors).toHaveLength(0)
  })

  test("reports malformed records without swallowing the parser error", () => {
    const errors: Error[] = []
    const parser = new JsonlParser({ onValue: () => {}, onError: (error) => errors.push(error) })
    parser.push("not-json\n")
    parser.end()
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain("Invalid Pi JSONL record")
  })
})

piSuite("Pi RPC subprocess backend", () => {
  test("correlates concurrent real RPC responses by request id", async () => {
    const root = await isolatedWorkspace()
    const client = new PiRpcClient({ cwd: root.cwd, executable: "/opt/homebrew/bin/pi", agentDir: root.agent, args: ["--no-extensions", "--no-skills", "--offline"] })
    try {
      await client.start()
      const responses = await Promise.all([client.request("get_state"), client.request("get_available_models"), client.request("get_commands")])
      expect(responses.map((response) => response.command).sort()).toEqual(["get_available_models", "get_commands", "get_state"])
      expect(responses.every((response) => response.success)).toBe(true)
    } finally {
      await client.close()
    }
  })

  test("rejects pending requests and reports bounded process-exit diagnostics", async () => {
    const root = await isolatedWorkspace()
    const executable = join(root.root, "exit-agent")
    await writeFile(executable, "#!/bin/sh\nprintf '%s' 'agent failed' >&2\nsleep 0.1\nexit 7\n")
    await chmod(executable, 0o755)
    const client = new PiRpcClient({ cwd: root.cwd, executable, agentDir: root.agent })
    const records: string[] = []
    client.onRecord((record) => records.push(typeof record.type === "string" ? record.type : ""))
    try {
      await client.start()
      await expect(client.request("get_state")).rejects.toThrow("code 7")
      expect(records).toContain("process_exit")
      expect(client.stderr).toContain("agent failed")
    } finally {
      await client.close()
    }
  })
})

describe("Pi controller refresh lifecycle", () => {
  test("forces a fresh read after a session mutation races an earlier refresh", async () => {
    const root = await isolatedWorkspace()
    const script = join(root.root, "agent.mjs")
    const executable = join(root.root, "agent-runner")
    await writeFile(script, controllerFixtureScript)
    await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(script)}\n`)
    await chmod(executable, 0o755)
    const controller = createPiController({ cwd: root.cwd, executable })
    try {
      const starting = controller.start()
      await new Promise((resolve) => setTimeout(resolve, 20))
      const switching = controller.command("switch_session", { sessionPath: "/tmp/new-session.jsonl" })
      await Promise.all([starting, switching])
      expect(controller.snapshot().state?.sessionId).toBe("new")
      expect(controller.snapshot().messages[0]?.content).toBe("new transcript")
    } finally {
      await controller.close()
    }
  })

  test("rejects startup extension dialogs instead of advertising an unusable response path", async () => {
    const root = await isolatedWorkspace()
    const script = join(root.root, "startup-dialog.mjs")
    const executable = join(root.root, "startup-dialog-runner")
    await writeFile(script, startupDialogFixtureScript)
    await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(script)}\n`)
    await chmod(executable, 0o755)
    const controller = createPiController({ cwd: root.cwd, executable })
    try {
      await expect(controller.start()).rejects.toThrow("Pi 0.85.1 RPC cannot resolve startup extension dialogs")
      expect(controller.snapshot().connected).toBe(false)
      expect(controller.snapshot().error).toContain("Pi 0.85.1 RPC cannot resolve startup extension dialogs")
      expect(controller.snapshot().extensionRequests).toHaveLength(0)
    } finally {
      await controller.close()
    }
  })
})

async function isolatedWorkspace(): Promise<{ root: string; cwd: string; agent: string }> {
  const root = await mkdtemp(join(tmpdir(), "vexart-pi-backend-"))
  temps.push(root)
  const cwd = join(root, "workspace")
  const agent = join(root, "agent")
  await mkdir(cwd)
  return { root, cwd, agent }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

const controllerFixtureScript = `
import { createInterface } from "node:readline";
const input = createInterface({ input: process.stdin });
let session = "old";
let delayedState = true;
const respond = (request, data) => process.stdout.write(JSON.stringify({ id: request.id, type: "response", command: request.type, success: true, data }) + "\\n");
input.on("line", (line) => {
  const request = JSON.parse(line);
  const requestedSession = session;
  if (request.type === "switch_session") {
    session = "new";
    respond(request, { cancelled: false });
  } else if (request.type === "get_state") {
    const data = { sessionId: requestedSession, isStreaming: false, isCompacting: false };
    if (delayedState) {
      delayedState = false;
      setTimeout(() => respond(request, data), 100);
    } else respond(request, data);
  } else if (request.type === "get_messages") {
    respond(request, { messages: [{ role: "user", content: requestedSession === "new" ? "new transcript" : "old transcript" }] });
  } else if (request.type === "get_available_models") respond(request, { models: [] });
  else if (request.type === "get_commands") respond(request, { commands: [] });
  else if (request.type === "get_tree") respond(request, { tree: [], leafId: null });
  else if (request.type === "get_session_stats") respond(request, { sessionId: requestedSession, totalMessages: 1 });
  else respond(request, {});
});
`

const startupDialogFixtureScript = `
process.stdout.write(JSON.stringify({ type: "extension_ui_request", id: "startup", method: "select", title: "Choose" , options: ["one"] }) + "\\n");
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
await new Promise(() => {});
`
