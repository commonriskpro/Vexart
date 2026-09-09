import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

type JsonObject = Record<string, unknown>
type FixtureCatalog = {
  schemaVersion: number
  catalogTask: string
  expectedPolicy: JsonObject
  fixtures: JsonObject[]
}
type FeatureMatrix = {
  schemaVersion: number
  catalogTask: string
  policy: JsonObject
  features: JsonObject[]
}

const fixturePath = join(import.meta.dir, "grid-contract-fixtures.json")
const matrixPath = join(import.meta.dir, "feature-matrix.json")

async function loadCatalog(): Promise<FixtureCatalog> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as FixtureCatalog
}

async function loadMatrix(): Promise<FeatureMatrix> {
  return JSON.parse(await readFile(matrixPath, "utf8")) as FeatureMatrix
}

function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as JsonObject
}

function required(value: JsonObject, key: string, path: string): unknown {
  const result = value[key]
  if (result === undefined) throw new Error(`${path}.${key} is required`)
  return result
}

function assertFiniteNumbers(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${path} must be finite`).toBe(true)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteNumbers(entry, `${path}[${index}]`))
    return
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) assertFiniteNumbers(entry, `${path}.${key}`)
  }
}

function byId(catalog: FixtureCatalog, id: string): JsonObject {
  const fixture = catalog.fixtures.find((entry) => entry.id === id)
  if (!fixture) throw new Error(`missing fixture ${id}`)
  return fixture
}

const stableFixtureIds = Array.from({ length: 16 }, (_, index) => `F-${String(index + 1).padStart(2, "0")}`)

const requiredCoveredFeatures = [
  "explicit tracks", "implicit rows and columns", "pixel track sizes", "percentage track sizes",
  "auto tracks", "min-content tracks", "max-content tracks", "fractional fr tracks",
  "minmax tracks", "fit-content tracks", "fixed repeat", "auto-fill repeat",
  "auto-fit repeat and collapsed empty tracks", "numeric line placement", "negative line placement",
  "named line placement", "span placement", "named grid areas", "row auto-placement",
  "column auto-placement", "dense auto-placement", "gap and gutters", "numeric padding",
  "numeric borders", "numeric margins", "track alignment and stretch", "item alignment",
  "intrinsic text and wrapping", "viewport resize", "Flex parent with Grid child",
  "Grid parent with Flex child", "Grid parent with Grid child", "box grid item", "text grid item",
  "image grid item", "canvas grid item", "floating outside grid flow", "scroll offsets",
  "scroll clipping", "focus state", "hover state", "click and press dispatch",
  "transformed hit-testing", "layout damage", "typed errors and atomic geometry",
  "array replacement invalidation", "cache and no-op revisions", "horizontal LTR profile",
  "current normal and keep-all text rules",
]

const requiredExcludedFeatures = [
  "subgrid", "masonry", "writing modes and non-LTR axes", "baseline alignment and auto margins",
  "CSS absolute-positioned grid placement algorithm", "DOM, CSSOM, selectors and cascade",
]

describe("G-034 Grid contract catalog", () => {
  test("has all stable F-01..F-16 records with separate expected layers", async () => {
    const catalog = await loadCatalog()
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.catalogTask).toBe("G-034")
    expect(catalog.fixtures.map((fixture) => fixture.id)).toEqual(stableFixtureIds)
    expect(catalog.expectedPolicy.generatedFromCurrentSolver).toBe(false)
    expect(catalog.expectedPolicy.incrementalIsOracle).toBe(false)

    for (const fixture of catalog.fixtures) {
      const path = `fixtures.${fixture.id}`
      for (const key of ["title", "taskIds", "reference", "oracle", "tolerance", "status", "input", "expected"]) required(fixture, key, path)
      expect(fixture.status, `${path}.status`).toBe("ready")
      expect(fixture.taskIds).toSatisfy((value: unknown) => Array.isArray(value) && value.length > 0)
      const expected = object(fixture.expected, `${path}.expected`)
      for (const layer of ["solver", "flexily", "node"]) required(expected, layer, `${path}.expected`)
      assertFiniteNumbers(fixture)
    }
  })

  test("keeps the independently authored numeric sentinels exact", async () => {
    const catalog = await loadCatalog()
    const f02 = object(byId(catalog, "F-02").expected, "F-02.expected")
    expect(object(f02.solver, "F-02.solver").trackSizes).toEqual([96.66666666666667, 193.33333333333334])
    expect(object(f02.solver, "F-02.solver").lines).toEqual([0, 96.66666666666667, 106.66666666666667, 300])
    expect((object(f02.node, "F-02.node").trackRects as unknown[])[1]).toEqual({ x: 107, width: 193 })

    const f07 = object(byId(catalog, "F-07").expected, "F-07.expected")
    const f07Solver = object(f07.solver, "F-07.solver")
    const autoFit = object(f07Solver.autoFit, "F-07.solver.autoFit")
    expect(autoFit.collapsedTrackIndexes).toEqual([2])
    expect(autoFit.trackSizes).toEqual([145, 145, 0])
    expect(autoFit.collapsedGutters).toEqual([2])

    const f08 = object(byId(catalog, "F-08").expected, "F-08.expected")
    expect(object(f08.solver, "F-08.solver").placements).toEqual([
      { nodeId: 1, start: 0, end: 2, width: 110 },
      { nodeId: 2, start: 2, end: 3, width: 50 },
    ])

    const f09 = object(byId(catalog, "F-09").expected, "F-09.expected")
    expect((object(f09.solver, "F-09.solver").placements as unknown[])[0]).toEqual({ nodeId: 1, rows: [0, 1], columns: [0, 3] })

    const f11 = object(byId(catalog, "F-11").expected, "F-11.expected")
    expect(object(f11.solver, "F-11.solver").trackSizes).toEqual([40, 100, 60])
    expect(object(f11.solver, "F-11.solver").minimumTrackTwo).toBe(60)

    const f12 = object(byId(catalog, "F-12").expected, "F-12.expected")
    const f12Solver = object(f12.solver, "F-12.solver")
    expect(object(f12Solver.normal, "F-12.normal")).toMatchObject({ lineWidths: [36, 36], lines: 2, height: 24 })
    expect(object(f12Solver.keepAll, "F-12.keepAll")).toMatchObject({ unwrappedWidth: 72, lines: 1, height: 12, overflow: true })
  })

  test("covers every supported inventory item and records exclusions explicitly", async () => {
    const [catalog, matrix] = await Promise.all([loadCatalog(), loadMatrix()])
    const fixtureIds = new Set<string>(catalog.fixtures.map((fixture) => String(fixture.id)))
    const rows = matrix.features
    expect(matrix.schemaVersion).toBe(1)
    expect(matrix.catalogTask).toBe("G-034")
    expect(matrix.policy.generatedFromCurrentSolver).toBe(false)
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)

    for (const row of rows) {
      const path = `features.${String(row.id)}`
      for (const key of ["id", "feature", "fixtureIds", "tasks", "reference", "oracle", "tolerance", "status"]) required(row, key, path)
      expect(row.tasks).toSatisfy((value: unknown) => Array.isArray(value) && value.length > 0)
      const ids = row.fixtureIds
      expect(ids).toSatisfy((value: unknown) => Array.isArray(value))
      if (row.status === "covered") expect((ids as unknown[]).length, `${path} has a fixture`).toBeGreaterThan(0)
      if (row.status === "excluded") expect(typeof row.exclusion, `${path}.exclusion`).toBe("string")
      for (const fixtureId of ids as unknown[]) expect(fixtureIds.has(String(fixtureId)), `${path} references ${String(fixtureId)}`).toBe(true)
      const tolerance = object(row.tolerance, `${path}.tolerance`)
      expect(tolerance.solverPx).toBeDefined()
      expect(tolerance.flexilyPx).toBeDefined()
      expect(tolerance.nodePx).toBeDefined()
    }

    for (const feature of requiredCoveredFeatures) {
      expect(rows.some((row) => row.feature === feature && row.status === "covered"), `missing coverage: ${feature}`).toBe(true)
    }
    for (const feature of requiredExcludedFeatures) {
      expect(rows.some((row) => row.feature === feature && row.status === "excluded"), `missing exclusion: ${feature}`).toBe(true)
    }

    const referencedFixtures = new Set<string>()
    for (const row of rows) {
      if (row.status !== "covered") continue
      for (const fixtureId of row.fixtureIds as string[]) referencedFixtures.add(fixtureId)
    }
    expect(referencedFixtures).toEqual(fixtureIds)
  })

  test("preserves typed atomic errors and cache-only observability", async () => {
    const catalog = await loadCatalog()
    const f15 = object(byId(catalog, "F-15").expected, "F-15.expected")
    expect(f15.solver).toEqual({ error: { code: "GRID_INVALID_VALUE", path: "gridTemplateColumns[0].percent", nodeId: 1 } })
    expect(f15.flexily).toEqual({ writeback: "not called", framePublished: false })
    expect(object(f15.node, "F-15.node")).toMatchObject({ partialFrame: false, rectBefore: { x: 0, y: 0, width: 100, height: 20 }, rectAfter: { x: 0, y: 0, width: 100, height: 20 } })

    const f16 = object(byId(catalog, "F-16").expected, "F-16.expected")
    const solver = object(f16.solver, "F-16.solver")
    expect(solver.sameReference).toMatchObject({ parse: 0, cacheHit: true, noOp: true })
    expect(solver.equivalentNewReference).toMatchObject({ parse: 1, cacheHit: false, geometryEquivalent: true })
    expect(solver.resized).toMatchObject({ measurePass: 1, noOp: false })
  })
})
