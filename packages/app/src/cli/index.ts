#!/usr/bin/env bun
import { existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { discoverAppRoutes, writeRouteManifestModule } from "../router/manifest"

/** @public */
export type CliResult = {
  code: number
  output: string
}

function usage(): CliResult {
  return {
    code: 0,
    output: [
      "Vexart App Framework",
      "",
      "Commands:",
      "  vexart create   Create a Bun-native Vexart app",
      "  vexart dev      Generate routes and run the app with Bun watch mode",
      "  vexart build    Generate routes and bundle the app",
      "  vexart doctor   Check Bun, package, and terminal capabilities",
      "  vexart routes   Print discovered app routes",
    ].join("\n"),
  }
}

function starterFiles(name: string): Record<string, string> {
  return {
    "package.json": JSON.stringify({
      name,
      type: "module",
      private: true,
      scripts: {
        dev: "vexart dev",
        build: "vexart build",
        routes: "vexart routes",
        doctor: "vexart doctor",
      },
      dependencies: {
        "@vexart/app": "latest",
      },
      devDependencies: {
        typescript: "^5.7.0",
      },
    }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "preserve",
        jsxImportSource: "solid-js",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["app/**/*.ts", "app/**/*.tsx", "vexart.config.ts"],
    }, null, 2) + "\n",
    "vexart.config.ts": [
      "import { defineConfig } from \"@vexart/app\"",
      "",
      "export default defineConfig({",
      `  app: { name: \"${name}\", defaultRoute: \"/\" },`,
      "  theme: { preset: \"void\" },",
      "})",
      "",
    ].join("\n"),
    "app/layout.tsx": [
      "import { Box } from \"@vexart/app\"",
      "import type { JSX } from \"solid-js\"",
      "",
      "export default function RootLayout(props: { children: JSX.Element }) {",
      "  return <Box className=\"bg-background p-6\">{props.children}</Box>",
      "}",
      "",
    ].join("\n"),
    "app/page.tsx": [
      "import { Box, Text, useRouter } from \"@vexart/app\"",
      "",
      "export default function HomePage() {",
      "  const router = useRouter()",
      "  return (",
      "    <Box className=\"rounded-xl border border-border bg-card p-4 shadow-lg\">",
      "        <Text className=\"text-xl font-semibold text-foreground\">Vexart App</Text>",
      "        <Text className=\"mt-2 text-sm text-muted-foreground\">Next-like DX, Bun runtime, Vexart renderer.</Text>",
      "        <Box focusable className=\"mt-4 rounded-md bg-primary px-4 py-2 focus:border-ring\" onPress={() => router.push(\"/projects/demo\")}> ",
      "          <Text className=\"text-sm font-medium text-primary-foreground\">Open demo route</Text>",
      "        </Box>",
      "      </Box>",
      "  )",
      "}",
      "",
    ].join("\n"),
    "app/projects/[id]/page.tsx": [
      "import { Box, Text, type RouteParams, useRouter } from \"@vexart/app\"",
      "",
      "export default function ProjectPage(props: { params: RouteParams }) {",
      "  const router = useRouter()",
      "  return (",
      "    <Box className=\"rounded-xl border border-border bg-card p-4 shadow-lg\">",
      "      <Text className=\"text-xl font-semibold text-foreground\">Project {props.params.id}</Text>",
      "      <Text className=\"mt-2 text-sm text-muted-foreground\">This route came from app/projects/[id]/page.tsx.</Text>",
      "      <Box focusable className=\"mt-4 rounded-md bg-secondary px-4 py-2 focus:border-ring\" onPress={() => router.push(\"/\")}> ",
      "        <Text className=\"text-sm font-medium text-secondary-foreground\">Back home</Text>",
      "      </Box>",
      "    </Box>",
      "  )",
      "}",
      "",
    ].join("\n"),
    "app/not-found.tsx": [
      "import { Box, Text } from \"@vexart/app\"",
      "",
      "export default function NotFoundPage() {",
      "  return (",
      "    <Box className=\"rounded-xl border border-destructive bg-card p-4\">",
      "      <Text className=\"text-lg font-semibold text-foreground\">Route not found</Text>",
      "      <Text className=\"mt-2 text-sm text-muted-foreground\">Add app/page.tsx files to create routes.</Text>",
      "    </Box>",
      "  )",
      "}",
      "",
    ].join("\n"),
  }
}

async function create(argv: string[]): Promise<CliResult> {
  const name = argv[0]
  if (!name) return { code: 1, output: "Usage: vexart create <app-name>" }
  const target = join(process.cwd(), name)
  if (existsSync(target)) return { code: 1, output: `Target already exists: ${name}` }
  for (const [file, content] of Object.entries(starterFiles(name))) {
    const path = join(target, file)
    mkdirSync(dirname(path), { recursive: true })
    await Bun.write(path, content)
  }
  return { code: 0, output: `Created ${name}\n\nNext steps:\n  cd ${name}\n  bun install\n  bun dev` }
}

function optionValue(argv: string[], name: string, fallback: string) {
  const index = argv.indexOf(name)
  if (index < 0) return fallback
  return argv[index + 1] ?? fallback
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(name)
}

async function writeGeneratedDevEntry(root = process.cwd()) {
  await writeRouteManifestModule({ root })
  const entry = join(root, ".vexart/dev.tsx")
  mkdirSync(dirname(entry), { recursive: true })
  await Bun.write(entry, [
    "// Generated by @vexart/app. Do not edit by hand.",
    "import { createAppRouter, mountApp, RouteOutlet, RouterProvider } from \"@vexart/app\"",
    "import { routes } from \"./routes\"",
    "",
    "const router = createAppRouter(routes)",
    "await mountApp(() => (",
    "  <RouterProvider router={router}>",
    "    <RouteOutlet />",
    "  </RouterProvider>",
    "))",
    "",
  ].join("\n"))
  return ".vexart/dev.tsx"
}

async function resolveEntry(argv: string[], purpose: "Dev" | "Build") {
  const explicit = optionValue(argv, "--entry", "")
  if (explicit) {
    if (!existsSync(join(process.cwd(), explicit))) return { code: 1, output: `${purpose} entry not found: ${explicit}` }
    await writeRouteManifestModule({ root: process.cwd() })
    return { code: 0, output: explicit }
  }
  const candidates = ["app/main.tsx", "app/main.ts"]
  const existing = candidates.find((candidate) => existsSync(join(process.cwd(), candidate)))
  if (existing) {
    await writeRouteManifestModule({ root: process.cwd() })
    return { code: 0, output: existing }
  }
  const manifest = await discoverAppRoutes({ root: process.cwd() })
  if (manifest.routes.length === 0) return { code: 1, output: `${purpose} entry not found. Add app/page.tsx or pass --entry <file>.` }
  return { code: 0, output: await writeGeneratedDevEntry(process.cwd()) }
}

async function routes(): Promise<CliResult> {
  const manifest = await discoverAppRoutes({ root: process.cwd() })
  if (manifest.routes.length === 0) return { code: 0, output: "No app routes found. Expected files like app/page.tsx." }
  return {
    code: 0,
    output: manifest.routes.map((route) => `${route.path.padEnd(24)} ${route.file}`).join("\n"),
  }
}

async function dev(argv: string[]): Promise<CliResult> {
  const entry = await resolveEntry(argv, "Dev")
  if (entry.code !== 0) return entry
  const args = ["bun"]
  if (!hasFlag(argv, "--no-watch")) args.push("--watch")
  args.push("--conditions=browser", "run", entry.output)
  if (hasFlag(argv, "--dry-run")) return { code: 0, output: args.join(" ") }
  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  })
  const code = await proc.exited
  return { code, output: "" }
}

async function build(argv: string[]): Promise<CliResult> {
  const outdir = optionValue(argv, "--outdir", "dist")
  const entry = await resolveEntry(argv, "Build")
  if (entry.code !== 0) return entry
  if (hasFlag(argv, "--dry-run")) return { code: 0, output: `bun build ${entry.output} --outdir ${outdir}` }
  const result = await Bun.build({
    entrypoints: [entry.output],
    outdir,
    target: "bun",
    format: "esm",
  })
  if (!result.success) {
    return { code: 1, output: result.logs.map((log) => log.message).join("\n") }
  }
  return { code: 0, output: `Built ${entry.output} to ${outdir}` }
}

function doctor(): CliResult {
  const bunVersion = typeof Bun !== "undefined" ? Bun.version : "unavailable"
  const appPackage = existsSync(join(process.cwd(), "package.json"))
  const appDir = existsSync(join(process.cwd(), "app"))
  const term = process.env.TERM ?? "unknown"
  const terminalProgram = process.env.TERM_PROGRAM ?? "unknown"
  const supportsKitty = term.includes("kitty") || terminalProgram.toLowerCase().includes("kitty") || terminalProgram.toLowerCase().includes("ghostty") || terminalProgram.toLowerCase().includes("wezterm")
  const lines = [
    "Vexart doctor",
    `Bun: ${bunVersion}`,
    `package.json: ${appPackage ? "ok" : "missing"}`,
    `app/: ${appDir ? "ok" : "missing"}`,
    `TERM: ${term}`,
    `TERM_PROGRAM: ${terminalProgram}`,
    `Kitty-compatible terminal hint: ${supportsKitty ? "yes" : "unknown"}`,
  ]
  if (!supportsKitty) lines.push("Hint: Vexart needs Kitty graphics support for pixel-native terminal rendering.")
  return { code: 0, output: lines.join("\n") }
}

/** @public */
export async function runCli(argv = process.argv.slice(2)): Promise<CliResult> {
  const command = argv[0]
  if (!command || command === "help" || command === "--help" || command === "-h") return usage()
  if (command === "create") return create(argv.slice(1))
  if (command === "dev") return dev(argv.slice(1))
  if (command === "build") return build(argv.slice(1))
  if (command === "doctor") return doctor()
  if (command === "routes") return routes()
  return { code: 1, output: `Unknown command: ${command}\n\n${usage().output}` }
}

if (import.meta.main) {
  const result = await runCli()
  console.log(result.output)
  process.exit(result.code)
}
