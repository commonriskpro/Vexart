import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { expect, test } from "bun:test"
import {
  generatedPhysicalFixture,
  bestEffortTmuxCleanup,
  formatPhysicalChildDiagnostic,
  formatTmuxChildFailure,
  inspectPhysicalTerminal,
  PHYSICAL_CHILD_SPAWN,
  physicalCaptureCommand,
  physicalChildIo,
  physicalTmuxConfig,
  physicalTmuxProducerCommand,
  physicalTranscriptPanic,
  physicalViewportFromDirect,
  parsePhysicalCapture,
  runPhysicalGridParity,
  scriptPtyArgs,
  waitForTmuxCompletion,
} from "./tmux-parity"

const root = resolve(import.meta.dir, "../..")

test("physical child inherits the Kitty tty and tees native output to its artifact", () => {
  expect(PHYSICAL_CHILD_SPAWN).toEqual({ stdin: "inherit", stdout: "inherit", stderr: "pipe" })
  const fixture = generatedPhysicalFixture({
    scene: join(root, "scripts/visual-test/scenes/grid-dashboard.tsx"),
    mode: "direct",
    raw: "/tmp/g037-direct.raw",
    metadata: "/tmp/g037-direct.metadata.json",
    rects: "/tmp/g037-direct.rects.json",
    status: "/tmp/g037-direct.exit",
  })
  expect(fixture).toContain("stdin: process.stdin")
  expect(fixture).toContain("stdout: appendOutput()")
  expect(fixture).toContain("appendFileSync(rawPath, bytes)")
  expect(fixture).toContain("physical child requires inherited stdin/stdout TTY")
  expect(fixture).toContain("kittyGraphics=false (Kitty probe returned no usable acknowledgement)")
  const io = physicalChildIo()
  expect(io.stdinTTY).toBe(!!process.stdin.isTTY)
  expect(io.stdoutTTY).toBe(!!process.stdout.isTTY)
  expect(scriptPtyArgs("/tmp/g037-capture.raw", ["tmux", "-V"])).toEqual([
    "-q",
    process.platform === "darwin" ? "-F" : "-f",
    "/tmp/g037-capture.raw",
    "tmux",
    "-V",
  ])
  expect(physicalCaptureCommand("/usr/bin/script", "/tmp/g037-capture.raw", ["bun", "fixture.ts"])).toEqual([
    "/usr/bin/script",
    "-q",
    process.platform === "darwin" ? "-F" : "-f",
    "/tmp/g037-capture.raw",
    "bun",
    "fixture.ts",
  ])
})

test("script PTY transcript captures fd writes outside the JS stdout proxy", async () => {
  const scriptResult = Bun.spawnSync(["sh", "-lc", "command -v script"])
  const scriptPath = new TextDecoder().decode(scriptResult.stdout).trim()
  if (scriptResult.exitCode !== 0 || !scriptPath) throw new Error("script(1) is required for the physical capture test")
  const out = join(root, "artifacts/grid-parity", `test-direct-capture-${Date.now()}-${process.pid}`)
  mkdirSync(out, { recursive: true })
  const raw = join(out, "direct.raw")
  const child = Bun.spawn(physicalCaptureCommand(scriptPath, raw, [
    process.execPath,
    "--eval",
    'process.stdout.write("js"); require("node:fs").writeSync(1, Buffer.from("native"))',
  ]), { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  const exitCode = await child.exited
  expect(exitCode).toBe(0)
  expect(stderr).toBe("")
  expect(stdout).toContain("jsnative")
  expect(readFileSync(raw, "utf8")).toContain("jsnative")
})

test("producer capture keeps the tmux DCS before outer forwarding", async () => {
  const scriptResult = Bun.spawnSync(["sh", "-lc", "command -v script"])
  const scriptPath = new TextDecoder().decode(scriptResult.stdout).trim()
  if (scriptResult.exitCode !== 0 || !scriptPath) throw new Error("script(1) is required for the producer capture test")
  const out = join(root, "artifacts/grid-parity", `test-tmux-producer-${Date.now()}-${process.pid}`)
  const producerRaw = join(out, "tmux.producer.raw")
  mkdirSync(out, { recursive: true })
  const esc = "\x1b"
  const dcs = `${esc}Ptmux;${esc}${esc}_Ga=T,s=1,v=1,i=1,m=0;producer${esc}${esc}\\${esc}\\`
  const command = physicalTmuxProducerCommand(scriptPath, producerRaw, [process.execPath, "--eval", `process.stdout.write(${JSON.stringify(dcs)})`])
  try {
    const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(await child.exited).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toContain(`${esc}Ptmux;`)
    const producer = parsePhysicalCapture(readFileSync(producerRaw), "tmux-producer")
    expect(producer.wrappedApcCount).toBe(1)
    expect(producer.bareApcCount).toBe(0)
    const outer = parsePhysicalCapture(Buffer.from(`${esc}_Ga=T,s=1,v=1,i=1,m=0;producer${esc}\\`), "tmux-outer")
    expect(outer.bareApcCount).toBe(1)
    expect(physicalTmuxProducerCommand(scriptPath, producerRaw, ["bun", "fixture.ts"])).toEqual([
      scriptPath,
      ...scriptPtyArgs(producerRaw, ["bun", "fixture.ts"]),
    ])
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test("physical parent preserves child caps, tty and probe diagnostics", () => {
  const diagnostic = formatPhysicalChildDiagnostic({
    version: 2,
    scene: "scenes/grid-dashboard",
    mode: "direct",
    physical: true,
    error: "kittyGraphics=false (Kitty probe returned no usable acknowledgement)",
    terminal: { kind: "kitty", caps: { kittyGraphics: false, transmissionMode: "direct" }, resolved: false },
    child: {
      io: { stdinTTY: true, stdoutTTY: true, stderrTTY: false, stdinFd: 0, stdoutFd: 1, stderrFd: 2 },
      capture: { rawPath: "/tmp/direct.child.raw", bytes: 407, forwardedTo: "stdout" },
      probe: { inputEvents: 3, inputBytes: 9, kittyResponses: 0 },
    },
    environment: { TERM: "xterm-kitty", TERM_PROGRAM: "kitty", KITTY_WINDOW_ID: "42", TMUX: false, TMUX_PANE: null },
  })
  expect(diagnostic).toContain("kittyGraphics=false")
  expect(diagnostic).toContain('terminal={"kind":"kitty"')
  expect(diagnostic).toContain('io={"stdinTTY":true,"stdoutTTY":true')
  expect(diagnostic).toContain('probe={"inputEvents":3')
})

test("physical preflight reports a non-tty capture as a blocker", () => {
  const evidence = inspectPhysicalTerminal({
    env: { TERM: "xterm-kitty", KITTY_WINDOW_ID: "42" },
    stdinTTY: false,
    stdoutTTY: false,
  })
  expect(evidence.available).toBe(false)
  expect(evidence.checks.find((check) => check.name === "stdin-tty")?.ok).toBe(false)
  expect(evidence.checks.find((check) => check.name === "stdout-tty")?.ok).toBe(false)
})

test("private tmux starts atomically with configured Kitty passthrough", async () => {
  const tmux = Bun.spawnSync(["sh", "-lc", "command -v tmux"])
  const tmuxPath = new TextDecoder().decode(tmux.stdout).trim()
  if (tmux.exitCode !== 0 || !tmuxPath) throw new Error("tmux is required for the private-server regression")
  const out = join(root, "artifacts/grid-parity", `test-tmux-config-${Date.now()}-${process.pid}`)
  const socket = join(out, "tmux.sock")
  const config = join(out, "tmux.conf")
  const paneEnvPath = join(out, "pane.env")
  const session = `g037-config-${process.pid}`
  mkdirSync(out, { recursive: true })
  writeFileSync(config, physicalTmuxConfig(), { flag: "wx" })
  const env = { ...process.env, TERM: "xterm-kitty", TERM_PROGRAM: "kitty", KITTY_WINDOW_ID: "g037-test", COLORTERM: "truecolor" }
  const command = (args: string[]) => Bun.spawnSync([tmuxPath, "-S", socket, "-f", config, ...args], { env })
  try {
    const paneCommand = `printf 'TERM=%s\\nTMUX=%s\\nKITTY_WINDOW_ID=%s\\n' "$TERM" "$TMUX" "$KITTY_WINDOW_ID" > ${paneEnvPath}; sleep 10`
    const created = command(["new-session", "-d", "-s", session, "-c", root, "/bin/sh", "-lc", paneCommand])
    expect(created.exitCode).toBe(0)
    expect(command(["has-session", "-t", session]).exitCode).toBe(0)
    expect(new TextDecoder().decode(command(["show-options", "-gv", "allow-passthrough"]).stdout).trim()).toBe("all")
    expect(new TextDecoder().decode(command(["show-options", "-gv", "status"]).stdout).trim()).toBe("off")
    expect(new TextDecoder().decode(command(["show-options", "-gv", "default-terminal"]).stdout).trim()).toBe("tmux-256color")
    expect(new TextDecoder().decode(command(["show-options", "-gv", "terminal-features"]).stdout).trim()).toContain("xterm-kitty:RGB")
    const deadline = Date.now() + 1000
    while (!existsSync(paneEnvPath) && Date.now() < deadline) await Bun.sleep(10)
    expect(existsSync(paneEnvPath)).toBe(true)
    const paneEnv = Object.fromEntries(readFileSync(paneEnvPath, "utf8").trim().split("\n").map((line) => {
      const separator = line.indexOf("=")
      return [line.slice(0, separator), line.slice(separator + 1)]
    })) as Record<string, string>
    expect(paneEnv.TERM).toBe("tmux-256color")
    expect(paneEnv.TMUX).toBeTruthy()
    expect(paneEnv.KITTY_WINDOW_ID).toBe("g037-test")
    const detectPath = join(root, "packages/engine/src/terminal/detect.ts")
    const capsPath = join(root, "packages/engine/src/terminal/caps.ts")
    const probeEnv = { ...process.env, ...paneEnv }
    delete probeEnv.GHOSTTY_RESOURCES_DIR
    if (probeEnv.TERM_PROGRAM?.toLowerCase() === "ghostty") {
      delete probeEnv.TERM_PROGRAM
    }
    const probe = Bun.spawnSync([process.execPath, "--eval", `const { detect } = await import(${JSON.stringify(detectPath)}); const { inferCaps } = await import(${JSON.stringify(capsPath)}); const kind = detect(); console.log(JSON.stringify({ kind, caps: inferCaps(kind) }))`], { env: probeEnv })
    expect(probe.exitCode).toBe(0)
    const observed = JSON.parse(new TextDecoder().decode(probe.stdout)) as { kind: string; caps: { tmux: boolean; parentKind: string | null; kittyPlaceholder: boolean } }
    expect(observed.kind).toBe("kitty")
    expect(observed.caps.tmux).toBe(true)
    expect(observed.caps.parentKind).toBe("kitty")
    expect(observed.caps.kittyPlaceholder).toBe(true)
  } finally {
    Bun.spawnSync([tmuxPath, "-S", socket, "-f", "/dev/null", "kill-server"], { env })
    rmSync(out, { recursive: true, force: true })
  }
  expect(existsSync(socket)).toBe(false)
})

test("tmux cleanup preserves child failure after the private server dies", async () => {
  const tmux = Bun.spawnSync(["sh", "-lc", "command -v tmux"])
  const tmuxPath = new TextDecoder().decode(tmux.stdout).trim()
  if (tmux.exitCode !== 0 || !tmuxPath) throw new Error("tmux is required for the cleanup regression")
  const out = join(root, "artifacts/grid-parity", `test-tmux-failure-${Date.now()}-${process.pid}`)
  const socket = join(out, "tmux.sock")
  const config = join(out, "tmux.conf")
  const statusPath = join(out, "tmux.exit")
  const metadataPath = join(out, "tmux.metadata.json")
  const session = `g037-failure-${process.pid}`
  mkdirSync(out, { recursive: true })
  writeFileSync(config, physicalTmuxConfig(), { flag: "wx" })
  writeFileSync(statusPath, "1\n", { flag: "wx" })
  writeFileSync(metadataPath, JSON.stringify({
    version: 2,
    scene: "scenes/grid-dashboard",
    mode: "tmux-shm",
    physical: true,
    error: "child native presentation failed",
    terminal: { kind: "kitty", caps: { tmux: true, parentKind: "kitty", kittyPlaceholder: true, transmissionMode: "shm" }, resolved: false },
    child: { io: { stdinTTY: true, stdoutTTY: true, stderrTTY: true, stdinFd: 0, stdoutFd: 1, stderrFd: 2 }, capture: { rawPath: "/tmp/tmux.child.raw", bytes: 0, forwardedTo: "stdout" }, probe: { inputEvents: 0, inputBytes: 0, kittyResponses: 0 } },
  }, null, 2) + "\n", { flag: "wx" })
  const env = { ...process.env, TERM: "xterm-kitty", TERM_PROGRAM: "kitty", KITTY_WINDOW_ID: "g037-test", COLORTERM: "truecolor" }
  const command = (args: string[]) => Bun.spawnSync([tmuxPath, "-S", socket, "-f", config, ...args], { env })
  try {
    const created = command(["new-session", "-d", "-s", session, "-c", root, "/bin/sh", "-lc", "exit 1"])
    expect(created.exitCode).toBe(0)
    await Bun.sleep(100)
    Bun.spawnSync([tmuxPath, "-S", socket, "-f", "/dev/null", "kill-server"], { env })
    expect(() => bestEffortTmuxCleanup(socket, session, env)).not.toThrow()
    const failure = formatTmuxChildFailure(statusPath, metadataPath, null, "no server running")
    expect(failure).toContain("child native presentation failed")
    expect(failure).toContain("status=1")
    expect(failure).toContain("no server running")
  } finally {
    bestEffortTmuxCleanup(socket, session, env)
    rmSync(out, { recursive: true, force: true })
  }
})

test("tmux uses the direct measured viewport before creating its render loop", () => {
  const viewport = physicalViewportFromDirect({
    terminal: { kind: "kitty", caps: { tmux: false }, size: { cols: 166, rows: 49, pixelWidth: 1162, pixelHeight: 637, cellWidth: 7, cellHeight: 13 } },
    viewport: { width: 1162, height: 637 },
  })
  expect(viewport).toEqual({ width: 1162, height: 637, cols: 166, rows: 49, cellWidth: 7, cellHeight: 13 })
  const fixture = generatedPhysicalFixture({ scene: join(root, "scripts/visual-test/scenes/grid-dashboard.tsx"), mode: "tmux-shm", raw: "/tmp/g037-tmux.raw", metadata: "/tmp/g037-tmux.metadata.json", rects: "/tmp/g037-tmux.rects.json", status: "/tmp/g037-tmux.exit", viewport })
  expect(fixture).toContain("pixelWidth: viewportOverride.width")
  expect(fixture).toContain("pixelHeight: viewportOverride.height")
  expect(fixture).not.toContain("Object.assign(terminal.size, viewportOverride)")
  const frame = { viewportWidth: viewport.width, viewportHeight: viewport.height }
  expect(frame.viewportWidth).toBeLessThanOrEqual(2048)
  expect({ width: frame.viewportWidth, height: frame.viewportHeight }).toEqual({ width: 1162, height: 637 })
  expect(fixture).toContain("viewportSource: viewportOverride ? \"direct-measured\"")
})

test("tmux panic detection is bounded and retains the real transcript", async () => {
  const out = join(root, "artifacts/grid-parity", `test-tmux-panic-${Date.now()}-${process.pid}`)
  const transcript = join(out, "tmux.outer.raw")
  const status = join(out, "tmux.exit")
  mkdirSync(out, { recursive: true })
  writeFileSync(transcript, "thread '<unnamed>' panicked at\nDimension X value 2656 exceeds the limit of 2048\n", { flag: "wx" })
  const detected = physicalTranscriptPanic(transcript)
  const started = Date.now()
  let error: unknown = null
  try {
    await waitForTmuxCompletion(status, transcript, { exited: Promise.resolve(0) }, 45_000)
  } catch (cause) {
    error = cause
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
  expect(String(error)).toContain("physical tmux child panic")
  expect(String(error)).toContain(transcript)
  expect(String(error)).toContain("Dimension X value 2656")
  expect(Date.now() - started).toBeLessThan(1000)
  expect(detected).toContain("Dimension X value 2656")
})

/**
 * G-037 is a physical gate, not an offscreen test. Missing Kitty/TTY/tmux is
 * a blocker and deliberately fails this test; it must never be converted to
 * skip/pass by CI or by a synthetic SHM receiver.
 */
test("Grid dashboard passes Kitty direct and tmux SHM physical parity", async () => {
  const artifactRoot = join(root, "artifacts/grid-parity")
  mkdirSync(artifactRoot, { recursive: true })
  const out = join(artifactRoot, `g037-${Date.now()}-${process.pid}`)
  const result = await runPhysicalGridParity({ out })
  if (result.status === "BLOCKED") throw new Error(`BLOCKED: ${result.error ?? "physical terminal unavailable"}; evidence=${JSON.stringify(result.evidence)}`)
  if (result.status === "FAILED") throw new Error(`physical parity failed: ${result.error ?? "unknown failure"}; out=${result.out}`)
  expect(result.status).toBe("PASS")
})
