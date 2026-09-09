/**
 * G-035 — independent CSS Grid oracle.
 *
 * This module deliberately does not import Vexart, Flexily, the layout adapter,
 * or any incremental layout state. It asks a real browser for DOM geometry and
 * compares that observation with the hand-authored G-034 expected values. CSS
 * uses a quantized device pixel grid, so browser checks use a separate 1/64 px
 * comparison tolerance; solver expectations remain 1e-6 in the fixture catalog.
 */

import { arch, platform, release } from "node:os"
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const SPEC_URL = "https://www.w3.org/TR/2025/CRD-css-grid-1-20250326/"
const SPEC_REVISION = "2025-03-26"
const BROWSER_FIXTURES = ["F-02", "F-03", "F-06", "F-07", "F-08", "F-09", "F-10", "F-14"] as const
const DEFERRED_FIXTURES = ["F-01", "F-04", "F-05", "F-11", "F-12", "F-13", "F-15", "F-16"] as const
const BROWSER_QUANTIZATION_PX = 1 / 64
const BROWSER_TOLERANCE_PX = BROWSER_QUANTIZATION_PX + 0.000001
const PINNED_ORACLE_BROWSER = "external CSS Grid implementation"

type JsonObject = Record<string, unknown>
type FixtureCatalog = { fixtures: JsonObject[]; expectedPolicy: JsonObject }
type BrowserRect = { x: number; y: number; width: number; height: number }
type BrowserCase = { id: string; columns: number[]; rows: number[]; items: Record<string, BrowserRect>; grid: BrowserRect }
type FixtureResult = {
  fixtureId: string
  status: "checked" | "deferred"
  oracle: string
  comparisons?: string[]
  observed?: BrowserCase
  observedVariants?: Record<string, BrowserCase>
  reason?: string
}

export type OracleReport = {
  schemaVersion: 1
  runId: string
  status: "PASS" | "FAIL" | "BLOCKED"
  spec: { url: string; revision: string; sections: string[] }
  environment: { os: string; arch: string; browser: string; browserPath: string }
  policy: { solverTolerancePx: number; browserTolerancePx: number; incrementalIsOracle: false; vexartImports: false }
  results: FixtureResult[]
  reportPath: string
  blocker?: { code: "BROWSER_UNAVAILABLE" | "BROWSER_FAILED"; message: string }
  failures?: string[]
}

export type OracleOptions = {
  runId?: string
  outputRoot?: string
}

function asObject(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as JsonObject
}

function fixture(catalog: FixtureCatalog, id: string): JsonObject {
  const value = catalog.fixtures.find((entry) => entry.id === id)
  if (!value) throw new Error(`missing fixture ${id}`)
  return value
}

function isExecutable(path: string): Promise<boolean> {
  return access(path, constants.X_OK).then(() => true).catch(() => false)
}

export async function findBrowser(): Promise<string | null> {
  const candidates = [
    process.env.GRID_ORACLE_BROWSER,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/opt/homebrew/bin/chromium",
    "/opt/homebrew/bin/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Users/saturno/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
  for (const candidate of candidates) if (await isExecutable(candidate)) return candidate
  return null
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function browserCase(id: string): string {
  switch (id) {
    case "F-02":
      return '<section data-case="F-02"><div class="grid f02"><i data-item="a"></i><i data-item="b"></i></div></section>'
    case "F-03":
      return '<section data-case="F-03"><div class="grid f03"><i data-item="a"></i><i data-item="b"></i></div></section>'
    case "F-06":
      return '<section data-case="F-06"><div class="grid f06"><i data-item="a"></i><i data-item="b"></i><i data-item="c"></i></div></section>'
    case "F-07":
      return '<section data-case="F-07"><div class="grid f07-fill"><i data-item="a"></i><i data-item="b"></i></div><div class="grid f07-fit"><i data-item="a"></i><i data-item="b"></i></div></section>'
    case "F-08":
      return '<section data-case="F-08"><div class="grid f08"><i data-item="span"></i><i data-item="negative"></i></div></section>'
    case "F-09":
      return '<section data-case="F-09"><div class="grid f09"><i data-item="header"></i><i data-item="nav"></i><i data-item="content"></i></div></section>'
    case "F-10":
      return '<section data-case="F-10"><div class="grid f10"><i data-item="A"></i><i data-item="B"></i><i data-item="C"></i></div></section>'
    case "F-14":
      return '<section data-case="F-14"><div class="grid f14"><i data-item="a"></i><i data-item="b"></i></div></section>'
    default:
      throw new Error(`no browser case for ${id}`)
  }
}

function oracleHtml(): string {
  const cases = BROWSER_FIXTURES.map(browserCase).join("")
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  section { position: absolute; left: 0; top: 0; }
  .grid { display: grid; box-sizing: border-box; }
  .grid > i { display: block; min-width: 0; min-height: 0; background: #111; }
  .f02 { width: 300px; grid-template-columns: 1fr 2fr; column-gap: 10px; }
  .f02 > i { height: 10px; }
  .f03 { width: 300px; padding: 0 20px; box-sizing: content-box; grid-template-columns: 50% 50%; gap: 10px; }
  .f03 > i { height: 10px; }
  .f06 { width: 145px; grid-template-columns: repeat(3, 40px); gap: 5px; }
  .f06 > i { height: 10px; }
  .f07-fill, .f07-fit { width: 300px; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; }
  .f07-fit { grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); top: 20px; }
  .f07-fill > i, .f07-fit > i { height: 10px; }
  .f08 { width: 170px; grid-template-columns: 50px 50px 50px; gap: 10px; }
  .f08 > i { height: 10px; }
  .f08 [data-item="span"] { grid-column: 1 / span 2; }
  .f08 [data-item="negative"] { grid-column: -2 / -1; }
  .f09 { width: 310px; height: 75px; grid-template-columns: 100px 80px 120px; grid-template-rows: 30px 40px; gap: 5px; grid-template-areas: "header header header" "nav . content"; }
  .f09 [data-item="header"] { grid-area: header; }
  .f09 [data-item="nav"] { grid-area: nav; }
  .f09 [data-item="content"] { grid-area: content; }
  .f10 { width: 170px; grid-template-columns: 50px 50px 50px; grid-template-rows: 30px 30px; grid-auto-flow: row dense; gap: 10px; }
  .f10 > i { height: 30px; }
  .f10 [data-item="A"] { grid-row: 1; grid-column: 1 / span 2; }
  .f10 [data-item="B"] { grid-column: span 2; }
  .f10 [data-item="C"] { grid-column: span 1; }
  .f14 { width: 300px; grid-template-columns: 50px 50px; gap: 10px; justify-content: center; }
  .f14 > i { height: 10px; }
</style>
${cases}
<script>
(() => {
  const rect = (element, root) => {
    const value = element.getBoundingClientRect();
    const origin = root.getBoundingClientRect();
    return { x: value.x - origin.x, y: value.y - origin.y, width: value.width, height: value.height };
  };
  const numbers = (value) => [...value.matchAll(/-?[0-9]+(?:\\.[0-9]+)?px/g)].map((match) => Number.parseFloat(match[0]));
  const output = {};
  for (const section of document.querySelectorAll("[data-case]")) {
    const roots = [...section.querySelectorAll(":scope > .grid")];
    for (const root of roots) {
      const id = root.className.split(" ")[1];
      const caseId = section.dataset.case;
      const items = {};
      for (const item of root.querySelectorAll("[data-item]")) items[item.dataset.item] = rect(item, root);
      const style = getComputedStyle(root);
      output[id === "f07-fill" ? "F-07-fill" : id === "f07-fit" ? "F-07-fit" : caseId] = {
        id: id === "f07-fill" ? "F-07-fill" : id === "f07-fit" ? "F-07-fit" : caseId,
        grid: rect(root, root),
        columns: numbers(style.gridTemplateColumns),
        rows: numbers(style.gridTemplateRows),
        items,
      };
    }
  }
  document.documentElement.setAttribute("data-grid-oracle", JSON.stringify(output));
})();
</script>`
}

function htmlDecode(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&")
}

function parseBrowserOutput(output: string): Record<string, BrowserCase> {
  const match = output.match(/data-grid-oracle="([^"]*)"/)
  if (!match) throw new Error("browser output did not contain data-grid-oracle")
  return JSON.parse(htmlDecode(match[1])) as Record<string, BrowserCase>
}

async function browserVersion(browserPath: string): Promise<string> {
  const result = Bun.spawnSync([browserPath, "--version"], { stdout: "pipe", stderr: "pipe" })
  const value = new TextDecoder().decode(result.stdout).trim()
  if (result.exitCode !== 0 || !value) throw new Error("browser --version failed")
  return value
}

async function executeBrowser(browserPath: string, tempDir: string): Promise<Record<string, BrowserCase>> {
  const htmlPath = join(tempDir, "oracle.html")
  await writeFile(htmlPath, oracleHtml(), "utf8")
  const args = [
    browserPath,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--virtual-time-budget=1000",
    "--dump-dom",
    `file://${htmlPath}`,
  ]
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" })
  const stdout = new TextDecoder().decode(result.stdout)
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim().slice(-1000)
    throw new Error(`browser exited ${result.exitCode}: ${stderr}`)
  }
  return parseBrowserOutput(stdout)
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} is not a finite number`)
  return value
}

function compareNumber(actual: number, expected: number, path: string, failures: string[]): void {
  if (Math.abs(actual - expected) > BROWSER_TOLERANCE_PX) failures.push(`${path}: browser=${actual} expected=${expected} tolerance=${BROWSER_TOLERANCE_PX}`)
}

function compareRect(actual: BrowserRect | undefined, expected: JsonObject, path: string, failures: string[]): void {
  if (!actual) {
    failures.push(`${path}: browser item missing`)
    return
  }
  for (const key of ["x", "y", "width", "height"] as const) compareNumber(numberAt(actual[key], `${path}.${key}`), numberAt(expected[key], `${path}.${key}`), `${path}.${key}`, failures)
}

function expectedObject(catalog: FixtureCatalog, fixtureId: string): JsonObject {
  return asObject(fixture(catalog, fixtureId).expected, `${fixtureId}.expected`)
}

function expectedRects(value: unknown, path: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value.map((entry, index) => asObject(entry, `${path}[${index}]`))
}

function compareBrowserFixture(catalog: FixtureCatalog, id: string, observed: Record<string, BrowserCase>): FixtureResult {
  const failures: string[] = []
  const expected = expectedObject(catalog, id)
  const solver = asObject(expected.solver, `${id}.solver`)
  const actual = observed[id]
  if (!actual && id !== "F-07") failures.push(`${id}: browser result missing`)

  if (id === "F-02" && actual) {
    if (!Array.isArray(solver.trackSizes)) throw new Error(`${id}.trackSizes must be an array`)
    for (const [index, item] of ["a", "b"].entries()) compareNumber(actual.items[item]?.width ?? NaN, numberAt(solver.trackSizes[index], `${id}.trackSizes[${index}]`), `${id}.items.${item}.width`, failures)
  }
  if (id === "F-03" && actual) {
    compareNumber(actual.items.a?.x ?? NaN, 20, `${id}.items.a.x`, failures)
    compareNumber(actual.items.a?.width ?? NaN, 150, `${id}.items.a.width`, failures)
    compareNumber(actual.items.b?.x ?? NaN, 180, `${id}.items.b.x`, failures)
    compareNumber(actual.items.b?.width ?? NaN, 150, `${id}.items.b.width`, failures)
  }
  if (id === "F-06" && actual) {
    const expectedRectsValue = expectedRects(asObject(expected.flexily, `${id}.flexily`).trackRects, `${id}.trackRects`)
    for (const [index, item] of ["a", "b", "c"].entries()) {
      const expectedRect = expectedRectsValue[index]
      compareNumber(actual.items[item]?.x ?? NaN, numberAt(expectedRect.x, `${id}.trackRects[${index}].x`), `${id}.items.${item}.x`, failures)
      compareNumber(actual.items[item]?.width ?? NaN, numberAt(expectedRect.width, `${id}.trackRects[${index}].width`), `${id}.items.${item}.width`, failures)
      compareNumber(actual.items[item]?.y ?? NaN, 0, `${id}.items.${item}.y`, failures)
      compareNumber(actual.items[item]?.height ?? NaN, 10, `${id}.items.${item}.height`, failures)
    }
  }
  if (id === "F-07") {
    const fill = observed["F-07-fill"]
    const fit = observed["F-07-fit"]
    const solverFill = asObject(solver.autoFill, `${id}.autoFill`)
    const solverFit = asObject(solver.autoFit, `${id}.autoFit`)
    for (const [index, size] of (solverFill.trackSizes as number[]).entries()) compareNumber(numberAt(fill?.columns[index], `${id}.fill.columns[${index}]`), numberAt(size, `${id}.autoFill.trackSizes[${index}]`), `${id}.autoFill.columns[${index}]`, failures)
    for (const [index, size] of (solverFit.trackSizes as number[]).entries()) if (size > 0) compareNumber(numberAt(fit?.columns[index], `${id}.fit.columns[${index}]`), numberAt(size, `${id}.autoFit.trackSizes[${index}]`), `${id}.autoFit.columns[${index}]`, failures)
    if ((fit?.columns.length ?? 0) > 2 && fit?.columns.slice(2).some((size) => size > BROWSER_TOLERANCE_PX)) failures.push(`${id}.autoFit: browser did not collapse the empty third track; columns=${JSON.stringify(fit.columns)}`)
  }
  if (id === "F-08" && actual) {
    const items = expectedRects(solver.placements, `${id}.placements`)
    compareNumber(actual.items.span?.x ?? NaN, 0, `${id}.span.x`, failures)
    compareNumber(actual.items.span?.width ?? NaN, numberAt(items[0].width, `${id}.placements[0].width`), `${id}.span.width`, failures)
    compareNumber(actual.items.negative?.x ?? NaN, 120, `${id}.negative.x`, failures)
    compareNumber(actual.items.negative?.width ?? NaN, numberAt(items[1].width, `${id}.placements[1].width`), `${id}.negative.width`, failures)
  }
  if (id === "F-09" && actual) {
    const expectedItems = expectedRects(solver.placements, `${id}.placements`)
    const values = { header: expectedItems[0], nav: expectedItems[1], content: expectedItems[2] }
    for (const key of ["header", "nav", "content"] as const) {
      const item = values[key]
      const expectedRect = {
        x: key === "content" ? 190 : 0,
        y: key === "header" ? 0 : 35,
        width: key === "header" ? 310 : key === "nav" ? 100 : 120,
        height: key === "header" ? 30 : 40,
      }
      compareRect(actual.items[key], expectedRect, `${id}.${key}`, failures)
      void item
    }
  }
  if (id === "F-10" && actual) {
    const expectedRectsValue = asObject(expected.node, `${id}.node`)
    const rects = expectedRects(expectedRectsValue.rowDenseRects, `${id}.rowDenseRects`)
    for (const [index, item] of ["A", "B", "C"].entries()) compareRect(actual.items[item], rects[index], `${id}.items.${item}`, failures)
  }
  if (id === "F-14" && actual) {
    const expectedLines = solver.lines as number[]
    compareNumber(actual.items.a?.x ?? NaN, expectedLines[0], `${id}.items.a.x`, failures)
    compareNumber(actual.items.b?.x ?? NaN, expectedLines[2], `${id}.items.b.x`, failures)
    compareNumber(actual.items.a?.width ?? NaN, 50, `${id}.items.a.width`, failures)
    compareNumber(actual.items.b?.width ?? NaN, 50, `${id}.items.b.width`, failures)
  }

  return {
    fixtureId: id,
    status: "checked",
    oracle: PINNED_ORACLE_BROWSER,
    comparisons: id === "F-07" ? ["auto-fill track expansion", "auto-fit empty-track collapse"] : ["external DOM rects against independent expected values"],
    ...(actual ? { observed: actual } : {}),
    ...(id === "F-07" ? { observedVariants: { "auto-fill": observed["F-07-fill"], "auto-fit": observed["F-07-fit"] } } : {}),
    ...(failures.length > 0 ? { reason: failures.join("; ") } : {}),
  }
}

function deferredResult(id: string): FixtureResult {
  return {
    fixtureId: id,
    status: "deferred",
    oracle: "non-browser independent contract",
    reason: id === "F-12" ? "terminal font measurement requires the real native/profile runner" : "validated by manual/spec or Node-real oracle in its owning task; CSS browser geometry is not the oracle",
  }
}

function safeRunId(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("runId must contain only letters, numbers, dot, underscore or hyphen")
  return value
}

async function writeReport(report: OracleReport, outputRoot: string): Promise<string> {
  const path = join(outputRoot, report.runId, "report.json")
  await mkdir(join(outputRoot, report.runId), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return path
}

export async function runOracle(options: OracleOptions = {}): Promise<OracleReport> {
  const runId = safeRunId(options.runId ?? `run-${Date.now()}`)
  const outputRoot = options.outputRoot ?? join(process.cwd(), "artifacts/grid/oracle")
  const fixturePath = join(import.meta.dir, "../fixtures/grid-contract-fixtures.json")
  const catalog = JSON.parse(await readFile(fixturePath, "utf8")) as FixtureCatalog
  const browserPath = await findBrowser()
  const base = {
    schemaVersion: 1 as const,
    runId,
    spec: { url: SPEC_URL, revision: SPEC_REVISION, sections: ["7", "8", "10", "11"] },
    policy: { solverTolerancePx: 0.000001, browserTolerancePx: BROWSER_TOLERANCE_PX, incrementalIsOracle: false as const, vexartImports: false as const },
    reportPath: join(outputRoot, runId, "report.json"),
  }
  if (!browserPath) {
    const report: OracleReport = {
      ...base,
      status: "BLOCKED",
      environment: { os: `${platform()} ${release()}`, arch: arch(), browser: "not found", browserPath: "" },
      results: DEFERRED_FIXTURES.map(deferredResult),
      blocker: { code: "BROWSER_UNAVAILABLE", message: "A real Chromium/Chrome executable is required; no skip-pass is allowed." },
    }
    await writeReport(report, outputRoot)
    throw new Error(`BLOCKED: ${report.blocker?.message}`)
  }

  let version = "unknown"
  let results: FixtureResult[] = []
  try {
    version = await browserVersion(browserPath)
    const tempDir = await Bun.$`mktemp -d ${join(tmpdir(), "vexart-grid-oracle-XXXXXX")}`.text()
    try {
      const observed = await executeBrowser(browserPath, tempDir.trim())
      results = BROWSER_FIXTURES.map((id) => compareBrowserFixture(catalog, id, observed)).concat(DEFERRED_FIXTURES.map(deferredResult))
    } finally {
      await rm(tempDir.trim(), { recursive: true, force: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const report: OracleReport = {
      ...base,
      status: "BLOCKED",
      environment: { os: `${platform()} ${release()}`, arch: arch(), browser: version, browserPath },
      results: DEFERRED_FIXTURES.map(deferredResult),
      blocker: { code: "BROWSER_FAILED", message },
    }
    await writeReport(report, outputRoot)
    throw new Error(`BLOCKED: ${message}`)
  }

  const failures = results.flatMap((result) => result.reason && result.status === "checked" ? [result.reason] : [])
  const report: OracleReport = {
    ...base,
    status: failures.length > 0 ? "FAIL" : "PASS",
    environment: { os: `${platform()} ${release()}`, arch: arch(), browser: version, browserPath },
    results,
    ...(failures.length > 0 ? { failures } : {}),
  }
  await writeReport(report, outputRoot)
  if (failures.length > 0) throw new Error(`Oracle mismatch: ${failures.join("; ")}`)
  return report
}

if (import.meta.main) {
  runOracle({ runId: process.env.GRID_ORACLE_RUN_ID ?? `run-${Date.now()}` })
    .then((report) => {
      console.log(JSON.stringify({ status: report.status, reportPath: report.reportPath, browser: report.environment.browser, checked: BROWSER_FIXTURES, deferred: DEFERRED_FIXTURES }, null, 2))
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
