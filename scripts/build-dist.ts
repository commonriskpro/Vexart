/**
 * Build script — creates a distributable npm package.
 *
 * Output: dist/
 *   vexart.js           ← unified barrel: app + styled + headless + user-facing engine hooks
 *   engine.js           ← public @vexart/engine bundle
 *   jsx-runtime.js      ← reserved universal JSX compiler runtime
 *   solid-plugin.ts     ← babel preload for JSX transform
 *   jsx-runtime.d.ts    ← JSX intrinsic elements
 *   package.json        ← optionalDependencies for all supported platforms
 *   platform/
 *     darwin-arm64/     ← @vexart-native/darwin-arm64 package (libvexart.dylib + package.json)
 *     linux-x64/        ← @vexart-native/linux-x64 package (libvexart.so + package.json)
 *     (other platforms built via CI: see .github/workflows/build-native.yml)
 *
 * Run: bun run scripts/build-dist.ts
 */

import { build } from "esbuild"
import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs"
import { resolve } from "path"
import { resolveReleaseChannel } from "./release-verification.mjs"

const ROOT = resolve(import.meta.dir, "..")
// Set VEXART_OUTPUT_DIR for isolated verification builds. The default remains
// dist/ for release tooling, while scoped checks can avoid touching a user's
// existing distribution tree.
const outputDir = process.env.VEXART_OUTPUT_DIR
if (outputDir !== undefined && outputDir.trim() === "") {
  throw new Error("VEXART_OUTPUT_DIR must name a non-empty output directory")
}
const DIST = resolve(ROOT, outputDir ?? "dist")
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")) as { version: string }
const VERSION = rootPkg.version
const channel = resolveReleaseChannel(VERSION)

// ── Clean ──
console.log(`🧹 Cleaning ${DIST}/...`)
if (outputDir === undefined) {
  try { const { rmSync } = await import("fs"); rmSync(DIST, { recursive: true, force: true }) } catch {}
  mkdirSync(DIST, { recursive: true })
} else {
  if (existsSync(DIST) && readdirSync(DIST).length > 0) {
    throw new Error(`VEXART_OUTPUT_DIR must be new or empty: ${DIST}`)
  }
  mkdirSync(DIST, { recursive: true })
}

// ── 1. Solid JSX plugin for esbuild ──

// esbuild plugin that transforms .tsx through babel-preset-solid before bundling
const solidPlugin = {
  name: "solid-jsx-transform",
  setup(b: any) {
    const { transformSync } = require("@babel/core")

    b.onLoad({ filter: /\.tsx$/ }, async (args: any) => {
      const source = await Bun.file(args.path).text()
      const result = transformSync(source, {
        filename: args.path,
        presets: [
          ["babel-preset-solid", { generate: "universal", moduleName: "@vexart/engine/jsx-runtime" }],
          ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
        ],
      })
      return { contents: result?.code ?? source, loader: "js" }
    })
  },
}

// ── 2. Bundle the reconciler entrypoints together ──
//
// Building the public engine, compiler runtime, and unified barrel in one
// splitting graph gives them one copy of the universal renderer. The shared
// chunks stay at dist/ root because native resource lookup is relative to the
// bundle module directory.
console.log("📦 Bundling engine, JSX runtime, and unified barrel...")

await build({
  entryPoints: {
    engine: resolve(ROOT, "packages/engine/src/index.ts"),
    "jsx-runtime": resolve(ROOT, "packages/engine/src/jsx-runtime.ts"),
    vexart: resolve(ROOT, "packages/vexart/src/index.ts"),
  },
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: process.env.VEXART_DEBUG_BUNDLE !== "1",
  outdir: DIST,
  entryNames: "[name]",
  chunkNames: "chunk-[name]-[hash]",
  external: [
    "bun:ffi",
    "solid-js",
    "solid-js/universal",
    "marked",
    "@napi-rs/canvas",
    "@chenglou/pretext",
    "opentype.js",
  ],
  alias: {
    // Resolve both workspace engine entrypoints into this single graph. The
    // splitting build then shares reconciler modules instead of bundling an
    // isolated renderer into each entrypoint.
    "@vexart/engine": resolve(ROOT, "packages/engine/src/index.ts"),
    "@vexart/engine/jsx-runtime": resolve(ROOT, "packages/engine/src/jsx-runtime.ts"),
    "@vexart/engine/internal": resolve(ROOT, "packages/engine/src/internal.ts"),

    "@vexart-native/headless": resolve(ROOT, "packages/headless/src/index.ts"),
    "@vexart-native/styled": resolve(ROOT, "packages/styled/src/index.ts"),
    "@vexart-native/app": resolve(ROOT, "packages/app/src/index.ts"),

    "@vexart/headless": resolve(ROOT, "packages/headless/src/index.ts"),
    "@vexart/styled": resolve(ROOT, "packages/styled/src/index.ts"),
    "@vexart/app": resolve(ROOT, "packages/app/src/index.ts"),
    "vexart": resolve(ROOT, "packages/vexart/src/index.ts"),
  },
  plugins: [solidPlugin],
  define: {
    "process.env.VEXART_DIST": '"true"',
  },
  banner: {
    js: `/* Vexart — GPU-Accelerated Terminal UI Engine | Source-Available | (c) ${new Date().getFullYear()} */`,
  },
})

// ── 3. Bundle the published CLI ──
console.log("🛠️  Bundling CLI...")

await build({
  entryPoints: [resolve(ROOT, "packages/app/src/cli/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: process.env.VEXART_DEBUG_BUNDLE !== "1",
  outfile: resolve(DIST, "cli.js"),
  external: ["@babel/core", "@babel/preset-typescript", "babel-preset-solid"],
})

// ── 4. Build platform package (@vexart-native/darwin-arm64) ──
console.log("🔧 Building platform package...")

const vexartName = process.platform === "darwin" ? "libvexart.dylib" : process.platform === "win32" ? "vexart.dll" : "libvexart.so"
// Workspace root target dir is the canonical location (cargo builds there).
// The per-crate path native/libvexart/target/release/ may contain stale builds.
const vexartLibWorkspace = resolve(ROOT, "target/release", vexartName)
const vexartLibCrate = resolve(ROOT, "native/libvexart/target/release", vexartName)
const vexartLib = existsSync(vexartLibWorkspace) ? vexartLibWorkspace : vexartLibCrate
const arch = process.arch === "arm64" ? "arm64" : "x64"
const platformTag = `${process.platform}-${arch}`
const platformPkgName = `@vexart-native/${platformTag}`
const platformDir = resolve(DIST, "platform", platformTag)

mkdirSync(platformDir, { recursive: true })

if (existsSync(vexartLib)) {
  cpSync(vexartLib, resolve(platformDir, vexartName))
  console.log(`  ✅ ${vexartName} → platform/${platformTag}/`)
} else {
  if (process.env.VEXART_ALLOW_NO_NATIVE !== "1") {
    console.error(`ERROR: libvexart not found at ${vexartLib}`)
    console.error("Build the native library first: cargo build --release")
    console.error("Or set VEXART_ALLOW_NO_NATIVE=1 to skip")
    process.exit(1)
  }
  console.log(`  ⚠️ libvexart not found at ${vexartLib} (allowed by VEXART_ALLOW_NO_NATIVE=1)`)
}

const platformPkg = {
  name: platformPkgName,
  version: VERSION,
  description: `Vexart native binary for ${platformTag}`,
  repository: { type: "git", url: "https://github.com/commonriskpro/Vexart" },
  type: "module",
  os: [process.platform],
  cpu: [process.arch],
  files: [vexartName, "LICENSE"],
  license: "SEE LICENSE IN LICENSE",
}
if (existsSync(resolve(ROOT, "LICENSE"))) cpSync(resolve(ROOT, "LICENSE"), resolve(platformDir, "LICENSE"))
writeFileSync(resolve(platformDir, "package.json"), JSON.stringify(platformPkg, null, 2))
console.log(`  ✅ ${platformPkgName} package.json`)



// ── 7. Copy solid plugin (dist version with moduleName: "vexart/jsx-runtime") ──
console.log("🔌 Copying solid plugin...")
cpSync(resolve(ROOT, "scripts/solid-plugin-dist.ts"), resolve(DIST, "solid-plugin.ts"))
console.log(`  ✅ solid-plugin.ts (moduleName: "vexart/jsx-runtime")`)

// ── 8. Copy type declarations ──
console.log("📝 Copying type declarations...")
cpSync(resolve(ROOT, "types/engine.d.ts"), resolve(DIST, "engine.d.ts"))
cpSync(resolve(ROOT, "types/vexart.d.ts"), resolve(DIST, "vexart.d.ts"))
// Copy sub-module type declarations referenced by vexart.d.ts
for (const name of ["components", "void"] as const) {
  const src = resolve(ROOT, `types/${name}.d.ts`)
  if (existsSync(src)) {
    cpSync(src, resolve(DIST, `${name}.d.ts`))
  }
}
cpSync(resolve(ROOT, "types/jsx-runtime.d.ts"), resolve(DIST, "jsx-runtime.d.ts"))
console.log(`  ✅ engine.d.ts + vexart.d.ts + components.d.ts + void.d.ts + jsx-runtime.d.ts`)

// ── 9. Copy README + LICENSE ──
console.log("📄 Copying README and LICENSE...")
cpSync(resolve(ROOT, "README.md"), resolve(DIST, "README.md"))
if (existsSync(resolve(ROOT, "LICENSE"))) {
  cpSync(resolve(ROOT, "LICENSE"), resolve(DIST, "LICENSE"))
}
console.log(`  ✅ README.md + LICENSE`)

// ── 10. Create package.json ──
console.log("📋 Creating package.json...")

const pkg = {
  name: "vexart",
  version: VERSION,
  description: "GPU-accelerated terminal UI engine. Write JSX, get browser-quality UI in your terminal. Anti-aliased corners, shadows, gradients, glow, backdrop blur — real pixels, not ASCII.",
  keywords: ["terminal", "tui", "gpu", "wgpu", "jsx", "solidjs", "kitty", "ui", "rendering", "pixel", "cli", "components", "headless", "design-system"],
  repository: { type: "git", url: "https://github.com/commonriskpro/Vexart" },
  homepage: "https://github.com/commonriskpro/Vexart",
  type: "module",
  main: "vexart.js",
  types: "vexart.d.ts",
  bin: {
    vexart: "./cli.js",
  },
  exports: {
    ".": {
      types: "./vexart.d.ts",
      default: "./vexart.js",
    },
    "./engine": {
      types: "./engine.d.ts",
      default: "./engine.js",
    },
    "./jsx-runtime": {
      types: "./jsx-runtime.d.ts",
      default: "./jsx-runtime.js",
    },
    "./solid-plugin": "./solid-plugin.ts",
  },
  files: [
    "vexart.js",
    "vexart.d.ts",
    "components.d.ts",
    "void.d.ts",
    "engine.js",
    "engine.d.ts",
    "jsx-runtime.js",
    "cli.js",
    "jsx-runtime.d.ts",
    "chunk-*.js",
    "solid-plugin.ts",
  ],
  optionalDependencies: {
    "@vexart-native/darwin-arm64": VERSION,
    "@vexart-native/linux-x64": VERSION,
    "@vexart-native/linux-arm64": VERSION,
  },
  peerDependencies: {
    "solid-js": "^1.9.0",
  },
  dependencies: {
    "marked": "^18.0.0",
    "@babel/core": "^7.26.0",
    "@babel/preset-typescript": "^7.26.0",
    "babel-preset-solid": "^1.9.0",
  },
  engines: {
    bun: ">=1.1.0",
  },
  license: "SEE LICENSE IN LICENSE",
}

writeFileSync(resolve(DIST, "package.json"), JSON.stringify(pkg, null, 2))
console.log(`  ✅ package.json`)

// ── Done ──
console.log("")
console.log(`✅ Build complete! Output in ${DIST}/`)
console.log("")
console.log("To publish:")
console.log(`  cd ${DIST}/platform/${platformTag} && npm publish --access public --tag ${channel}`)
console.log(`  cd ${DIST} && npm publish --access public --tag ${channel}`)
console.log("")
console.log("To test locally:")
console.log(`  cd ${DIST}/platform/${platformTag} && bun pm pack --ignore-scripts`)
console.log(`  cd ${DIST} && bun pm pack --ignore-scripts`)
console.log("  # In another project:")
console.log(`  bun add ${DIST}/vexart-${VERSION}.tgz`)
console.log(`  bun add ${DIST}/platform/${platformTag}/vexart-${platformTag}-${VERSION}.tgz`)
