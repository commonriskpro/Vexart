import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs"
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

  test("dev runs a finite explicit entry without watch mode", async () => {
    const prev = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "vexart-dev-entry-test-"))
    try {
      process.chdir(dir)
      mkdirSync(join(dir, "app"), { recursive: true })
      await Bun.write(join(dir, "app", "main.ts"), "process.exit(0)\n")

      const result = await runCli(["dev", "--no-watch", "--entry", "app/main.ts"])

      expect(result.code).toBe(0)
    } finally {
      process.chdir(prev)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("build writes a bundle for an explicit entry", async () => {
    const prev = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "vexart-build-test-"))
    try {
      process.chdir(dir)
      mkdirSync(join(dir, "app"), { recursive: true })
      mkdirSync(join(dir, "node_modules"), { recursive: true })
      symlinkSync(join(prev, "node_modules", "solid-js"), join(dir, "node_modules", "solid-js"), "dir")
      await Bun.write(join(dir, "app", "main.ts"), [
        'import { createEffect, createSignal } from "solid-js"',
        "",
        "const [value, setValue] = createSignal(0)",
        "let observed = 0",
        "createEffect(() => { observed = value() })",
        "setValue(1)",
        "setTimeout(() => process.exit(observed === 1 ? 0 : 1), 0)",
        "",
      ].join("\n"))
      const outdir = join(dir, "out")

      const result = await runCli(["build", "--entry", "app/main.ts", "--outdir", outdir])

      expect(result.code).toBe(0)
      expect(existsSync(join(outdir, "main.js"))).toBe(true)

      const proc = Bun.spawn(["bun", join(outdir, "main.js")], { stdout: "pipe", stderr: "pipe" })
      expect(await proc.exited).toBe(0)
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

  test("create accepts an absolute target and uses its basename", async () => {
    const prev = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), "vexart-absolute-app-test-"))
    const target = join(dir, "nested", "demo")
    try {
      process.chdir(dir)
      const result = await runCli(["create", target])
      const packageJson = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
        name: string
        dependencies: Record<string, string>
      }

      expect(result.code).toBe(0)
      expect(result.output).toContain(`Created ${target}`)
      expect(packageJson.name).toBe("demo")
      expect(packageJson.dependencies.vexart).toBe("latest")
      expect(existsSync(join(target, "bunfig.toml"))).toBe(true)
      expect(await Bun.file(join(target, "bunfig.toml")).text()).toContain("vexart/solid-plugin")
      expect(await Bun.file(join(target, "tsconfig.json")).text()).toContain('"jsxImportSource": "vexart"')
      expect(await Bun.file(join(target, "app", "page.tsx")).text()).not.toContain("@vexart/app")
    } finally {
      process.chdir(prev)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
