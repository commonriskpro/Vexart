import { rm } from "node:fs/promises"

const PERF_LOG = "/tmp/lightcode-perf.log"
const CADENCE_LOG = "/tmp/tge-cadence.log"
const DEBUG_LOG = "/tmp/lightcode-debug.log"

type Profile = {
  name: string
  env: Record<string, string>
}

const baseEnv = {
  LIGHTCODE_STAGE: "1",
  LIGHTCODE_LOG_FPS: "1",
  LIGHTCODE_FORCE_REPAINT: "1",
  LIGHTCODE_FORCE_LAYER_REPAINT: "1",
  TGE_DEBUG_CADENCE: "1",
  LIGHTCODE_EXIT_AFTER_MS: process.env.LIGHTCODE_EXIT_AFTER_MS || "2600",
  LIGHTCODE_GRAPH_BG: "1",
  LIGHTCODE_GRAPH_NEBULA: "1",
  LIGHTCODE_GRAPH_EDGES: "0",
  LIGHTCODE_GRAPH_NODES: "0",
  LIGHTCODE_GRAPH_OVERLAY: "0",
}

const scaleVariants = [
  { name: "scale-default", nebula: "0.5", stars: "0.75" },
  { name: "scale-balanced", nebula: "0.4", stars: "0.6" },
  { name: "scale-aggressive", nebula: "0.33", stars: "0.5" },
]

const baseProfiles: Profile[] = [
  {
    name: "space-none",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "0",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "0",
      LIGHTCODE_SPACE_SHOW_STARS: "0",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "0",
    },
  },
  {
    name: "space-nebula-only",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "1",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "0",
      LIGHTCODE_SPACE_SHOW_STARS: "0",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "0",
    },
  },
  {
    name: "space-stars-only",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "0",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "0",
      LIGHTCODE_SPACE_SHOW_STARS: "1",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "0",
    },
  },
  {
    name: "space-atmosphere-only",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "0",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "1",
      LIGHTCODE_SPACE_SHOW_STARS: "0",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "0",
    },
  },
  {
    name: "space-sparkles-only",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "0",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "0",
      LIGHTCODE_SPACE_SHOW_STARS: "0",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "1",
    },
  },
  {
    name: "space-nebula+stars",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "1",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "0",
      LIGHTCODE_SPACE_SHOW_STARS: "1",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "0",
    },
  },
  {
    name: "space-nebula+atmosphere",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "1",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "1",
      LIGHTCODE_SPACE_SHOW_STARS: "0",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "0",
    },
  },
  {
    name: "space-full",
    env: {
      LIGHTCODE_SPACE_SHOW_NEBULA: "1",
      LIGHTCODE_SPACE_SHOW_ATMOSPHERE: "1",
      LIGHTCODE_SPACE_SHOW_STARS: "1",
      LIGHTCODE_SPACE_SHOW_SPARKLES: "1",
    },
  },
]

const profiles: Profile[] = baseProfiles.flatMap((profile) =>
  scaleVariants.map((scale) => ({
    name: `${profile.name}@${scale.name}`,
    env: {
      ...profile.env,
      LIGHTCODE_SPACE_NEBULA_SCALE: scale.nebula,
      LIGHTCODE_SPACE_STARS_SCALE: scale.stars,
    },
  })),
)

async function clearLogs() {
  await Promise.all([
    rm(PERF_LOG, { force: true }),
    rm(CADENCE_LOG, { force: true }),
    rm(DEBUG_LOG, { force: true }),
  ])
}

async function readText(path: string) {
  const file = Bun.file(path)
  if (!(await file.exists())) return ""
  return file.text()
}

function parsePerf(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean)
  const fpsLines = lines.filter((line) => line.startsWith("fps="))
  return fpsLines.at(-1) ?? ""
}

function parseCadence(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("[frame]"))
  const recent = lines.slice(-20)
  const values = recent.map((line) => {
    const pairs = [...line.matchAll(/([a-zA-Z]+)=(-?\d+(?:\.\d+)?)ms/g)]
    return Object.fromEntries(pairs.map((match) => [match[1], Number(match[2])]))
  })

  const avg = (key: string) => {
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + (value[key] ?? 0), 0) / values.length
  }

  return {
    samples: recent.length,
    avgDt: avg("dt"),
    avgTotal: avg("total"),
    avgPaint: avg("paint"),
    avgIo: avg("io"),
  }
}

async function runProfile(profile: Profile) {
  await clearLogs()
  const proc = Bun.spawn([
    "bun",
    "--conditions=browser",
    "run",
    "examples/lightcode.tsx",
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...baseEnv,
      ...profile.env,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const code = await proc.exited
  const perf = parsePerf(await readText(PERF_LOG))
  const cadence = parseCadence(await readText(CADENCE_LOG))
  return { code, perf, cadence }
}

for (const profile of profiles) {
  console.log(`\n=== ${profile.name} ===`)
  const result = await runProfile(profile)
  console.log(`exit=${result.code}`)
  console.log(`perf: ${result.perf || "no samples"}`)
  console.log(
    `cadence: samples=${result.cadence.samples} avgDt=${result.cadence.avgDt.toFixed(2)}ms avgTotal=${result.cadence.avgTotal.toFixed(2)}ms avgPaint=${result.cadence.avgPaint.toFixed(2)}ms avgIo=${result.cadence.avgIo.toFixed(2)}ms`,
  )
}
