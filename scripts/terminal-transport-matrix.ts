import { existsSync, readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { detect } from "../packages/engine/src/terminal/detect"
import { inferCaps, type Capabilities } from "../packages/engine/src/terminal/caps"
import { createTerminal } from "../packages/engine/src/terminal/index"
import { createRenderLoop } from "../packages/engine/src/loop/loop"
import { getKittyTransportManagerState } from "../packages/engine/src/output/transport-manager"
import { getNativePresentationFallbackReason, isNativePresentationEnabled } from "../packages/engine/src/ffi/native-presentation-flags"

const TRANSPORT = {
  DIRECT: "direct",
  FILE: "file",
  SHM: "shm",
} as const

const DEFAULT_REPORT = join(dirname(fileURLToPath(import.meta.url)), "terminal-transport-report.json")

type Transport = (typeof TRANSPORT)[keyof typeof TRANSPORT]

interface CliOptions {
  output: string
  probeTimeoutMs: number
  skipProbe: boolean
  force: boolean
  bench: boolean
  frames: number
  warmup: number
}

interface EnvironmentReport {
  TERM: string | null
  TERM_PROGRAM: string | null
  COLORTERM: string | null
  KITTY_PID: string | null
  KITTY_WINDOW_ID: string | null
  GHOSTTY_RESOURCES_DIR: string | null
  WEZTERM_PANE: string | null
  TMUX: string | null
  SSH_CONNECTION: string | null
  SSH_CLIENT: string | null
  SSH_TTY: string | null
}

interface NativePresentationReport {
  beforeLoopEnabled: boolean
  afterLoopEnabled: boolean
  fallbackReason: string | null
}

interface BenchmarkScenarioSummary {
  name: string
  totalP95Ms: number
}

interface BenchmarkReportSummary {
  transport: Transport
  command: string[]
  scenarios: BenchmarkScenarioSummary[]
}

interface ValidationReport {
  version: 1
  generatedAt: string
  interactive: boolean
  activeProbe: boolean
  remote: boolean
  environment: EnvironmentReport
  terminalKind: string
  capabilities: Capabilities
  transportManager: ReturnType<typeof getKittyTransportManagerState>
  nativePresentation: NativePresentationReport
  benchmark: BenchmarkReportSummary | null
}

interface FrameBreakdownScenario {
  name: string
  summary: {
    totalMs: {
      p95: number
    }
  }
}

interface FrameBreakdownReport {
  transport?: Transport
  scenarios: FrameBreakdownScenario[]
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2)
  let output = DEFAULT_REPORT
  let probeTimeoutMs = 2000
  let skipProbe = false
  let force = false
  let bench = false
  let frames = 60
  let warmup = 5

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--output") output = args[++i] ?? output
    else if (arg.startsWith("--output=")) output = arg.slice("--output=".length)
    else if (arg === "--probe-timeout") probeTimeoutMs = Number(args[++i] ?? probeTimeoutMs)
    else if (arg.startsWith("--probe-timeout=")) probeTimeoutMs = Number(arg.slice("--probe-timeout=".length))
    else if (arg === "--skip-probe") skipProbe = true
    else if (arg === "--force") force = true
    else if (arg === "--bench") bench = true
    else if (arg === "--frames") frames = Number(args[++i] ?? frames)
    else if (arg.startsWith("--frames=")) frames = Number(arg.slice("--frames=".length))
    else if (arg === "--warmup") warmup = Number(args[++i] ?? warmup)
    else if (arg.startsWith("--warmup=")) warmup = Number(arg.slice("--warmup=".length))
  }

  return {
    output,
    probeTimeoutMs: Number.isFinite(probeTimeoutMs) && probeTimeoutMs > 0 ? probeTimeoutMs : 2000,
    skipProbe,
    force,
    bench,
    frames: Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : 60,
    warmup: Number.isFinite(warmup) && warmup >= 0 ? Math.floor(warmup) : 5,
  }
}

function envValue(key: string) {
  return process.env[key] ?? null
}

function collectEnvironment(): EnvironmentReport {
  return {
    TERM: envValue("TERM"),
    TERM_PROGRAM: envValue("TERM_PROGRAM"),
    COLORTERM: envValue("COLORTERM"),
    KITTY_PID: envValue("KITTY_PID"),
    KITTY_WINDOW_ID: envValue("KITTY_WINDOW_ID"),
    GHOSTTY_RESOURCES_DIR: envValue("GHOSTTY_RESOURCES_DIR"),
    WEZTERM_PANE: envValue("WEZTERM_PANE"),
    TMUX: envValue("TMUX"),
    SSH_CONNECTION: envValue("SSH_CONNECTION"),
    SSH_CLIENT: envValue("SSH_CLIENT"),
    SSH_TTY: envValue("SSH_TTY"),
  }
}

function isRemoteConnection() {
  return !!(process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION)
}

function isInteractiveTty() {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

function isFrameBreakdownReport(value: unknown): value is FrameBreakdownReport {
  if (typeof value !== "object" || value === null) return false
  if (!("scenarios" in value)) return false
  return Array.isArray(value.scenarios)
}

function toTransport(value: string): Transport {
  if (value === TRANSPORT.SHM || value === TRANSPORT.FILE || value === TRANSPORT.DIRECT) return value
  return TRANSPORT.DIRECT
}

function runBenchmark(transport: Transport, frames: number, warmup: number): BenchmarkReportSummary | null {
  const output = `/tmp/vexart-frame-breakdown-${transport}-${process.pid}.json`
  const command = [
    "bun",
    "--conditions=browser",
    "run",
    "scripts/frame-breakdown.tsx",
    `--frames=${frames}`,
    `--warmup=${warmup}`,
    `--transport=${transport}`,
    `--output=${output}`,
  ]
  const result = Bun.spawnSync(command, {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  })
  if (result.exitCode !== 0 || !existsSync(output)) return null
  const parsed = JSON.parse(readFileSync(output, "utf8")) as unknown
  if (!isFrameBreakdownReport(parsed)) return null
  return {
    transport: parsed.transport ?? transport,
    command,
    scenarios: parsed.scenarios.map((scenario) => ({
      name: scenario.name,
      totalP95Ms: scenario.summary.totalMs.p95,
    })),
  }
}

async function collectActiveReport(options: CliOptions): Promise<ValidationReport> {
  const beforeLoopEnabled = isNativePresentationEnabled()
  const term = await createTerminal({
    skipColors: true,
    skipProbe: options.skipProbe,
    probeTimeout: options.probeTimeoutMs,
  })
  let afterLoopEnabled = beforeLoopEnabled
  try {
    if (term.caps.kittyGraphics) {
      const loop = createRenderLoop(term, { experimental: { nativePresentation: true } })
      afterLoopEnabled = isNativePresentationEnabled()
      loop.destroy()
    }
    const transport = toTransport(term.caps.transmissionMode)
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      interactive: true,
      activeProbe: !options.skipProbe,
      remote: isRemoteConnection(),
      environment: collectEnvironment(),
      terminalKind: term.kind,
      capabilities: term.caps,
      transportManager: getKittyTransportManagerState(),
      nativePresentation: {
        beforeLoopEnabled,
        afterLoopEnabled,
        fallbackReason: getNativePresentationFallbackReason(),
      },
      benchmark: options.bench ? runBenchmark(transport, options.frames, options.warmup) : null,
    }
  } finally {
    term.destroy()
  }
}

function collectStaticReport(options: CliOptions): ValidationReport {
  const kind = detect()
  const caps = inferCaps(kind)
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    interactive: false,
    activeProbe: false,
    remote: isRemoteConnection(),
    environment: collectEnvironment(),
    terminalKind: kind,
    capabilities: caps,
    transportManager: getKittyTransportManagerState(),
    nativePresentation: {
      beforeLoopEnabled: isNativePresentationEnabled(),
      afterLoopEnabled: isNativePresentationEnabled(),
      fallbackReason: getNativePresentationFallbackReason(),
    },
    benchmark: options.bench ? runBenchmark(toTransport(caps.transmissionMode), options.frames, options.warmup) : null,
  }
}

function printReport(report: ValidationReport, output: string) {
  console.log("\n🧭 Vexart terminal transport matrix")
  console.log(`  terminal        : ${report.terminalKind}`)
  console.log(`  interactive     : ${report.interactive ? "yes" : "no"}`)
  console.log(`  active probe    : ${report.activeProbe ? "yes" : "no"}`)
  console.log(`  remote          : ${report.remote ? "yes" : "no"}`)
  console.log(`  kitty graphics  : ${report.capabilities.kittyGraphics ? "yes" : "no"}`)
  console.log(`  tmux            : ${report.capabilities.tmux ? "yes" : "no"}`)
  console.log(`  transport       : ${report.capabilities.transmissionMode}`)
  console.log(`  manager active  : ${report.transportManager.activeMode}`)
  console.log(`  native present  : ${report.nativePresentation.afterLoopEnabled ? "on" : "off"}`)
  if (report.nativePresentation.fallbackReason) console.log(`  native fallback : ${report.nativePresentation.fallbackReason}`)
  if (report.benchmark) {
    console.log("  benchmark p95:")
    for (const scenario of report.benchmark.scenarios) {
      console.log(`    ${scenario.name.padEnd(18)} ${scenario.totalP95Ms.toFixed(2)}ms`)
    }
  }
  console.log(`\n✅ wrote ${output}`)
}

const options = parseCli()
const canProbe = options.force || isInteractiveTty()
const report = canProbe ? await collectActiveReport(options) : collectStaticReport(options)
await mkdir(dirname(options.output), { recursive: true })
await writeFile(options.output, JSON.stringify(report, null, 2) + "\n")
printReport(report, options.output)
