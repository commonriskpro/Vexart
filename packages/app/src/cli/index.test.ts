import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCli } from "./index"

describe("vexart cli", () => {
  test("prints help", async () => {
    const result = await runCli(["--help"])

    expect(result.code).toBe(0)
    expect(result.output).toContain("Vexart App Framework")
  })

  test("reports unknown commands", async () => {
    const result = await runCli(["wat"])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Unknown command: wat")
  })

  test("doctor reports Bun", async () => {
    const result = await runCli(["doctor"])

    expect(result.code).toBe(0)
    expect(result.output).toContain("Bun:")
  })

  test("dev reports missing default entry", async () => {
    const result = await runCli(["dev", "--entry", "missing-entry.tsx"])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Dev entry not found")
  })

  test("dev generates an entry from app routes", async () => {
    const prev = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "vexart-dev-test-"))
    try {
      process.chdir(dir)
      mkdirSync(join(dir, "app"), { recursive: true })
      await Bun.write(join(dir, "app", "page.tsx"), "export default function Page() { return null }\n")

      const result = await runCli(["dev", "--dry-run", "--no-watch"])

      expect(result.code).toBe(0)
      expect(result.output).toContain("bun --conditions=browser run .vexart/dev.tsx")
      expect(existsSync(join(dir, ".vexart", "routes.ts"))).toBe(true)
    } finally {
      process.chdir(prev)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("prints discovered routes", async () => {
    const prev = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "vexart-routes-cli-test-"))
    try {
      process.chdir(dir)
      mkdirSync(join(dir, "app", "projects", "[id]"), { recursive: true })
      await Bun.write(join(dir, "app", "page.tsx"), "export default function Page() { return null }\n")
      await Bun.write(join(dir, "app", "projects", "[id]", "page.tsx"), "export default function Page() { return null }\n")

      const result = await runCli(["routes"])

      expect(result.code).toBe(0)
      expect(result.output).toContain("/                        app/page.tsx")
      expect(result.output).toContain("/projects/[id]")
    } finally {
      process.chdir(prev)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("create writes a starter app", async () => {
    const prev = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "vexart-app-test-"))
    try {
      process.chdir(dir)
      const result = await runCli(["create", "demo"])

      expect(result.code).toBe(0)
      expect(existsSync(join(dir, "demo", "package.json"))).toBe(true)
      expect(existsSync(join(dir, "demo", "app", "layout.tsx"))).toBe(true)
      expect(existsSync(join(dir, "demo", "app", "page.tsx"))).toBe(true)
      expect(existsSync(join(dir, "demo", "app", "projects", "[id]", "page.tsx"))).toBe(true)
    } finally {
      process.chdir(prev)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
