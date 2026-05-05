/**
 * Build script — creates a distributable npm package.
 *
 * Output: dist/
 *   vexart.js           ← unified barrel: app + styled + headless + user-facing engine hooks
 *   engine.js           ← @vexart/engine full bundle (power users)
 *   solid-plugin.ts     ← babel preload for JSX transform
 *   jsx-runtime.d.ts    ← JSX intrinsic elements
 *   tree-sitter/        ← grammar .wasm + .scm files
 *   package.json        ← optionalDependencies for all supported platforms
 *   platform/
 *     darwin-arm64/     ← @vxrt/darwin-arm64 package (libvexart.dylib + package.json)
 *     linux-x64/        ← @vxrt/linux-x64 package (libvexart.so + package.json)
 *     (other platforms built via CI: see .github/workflows/build-native.yml)
 *
 * Run: bun run scripts/build-dist.ts
 */

import { build } from "esbuild"
import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "fs"
import { resolve } from "path"

const ROOT = resolve(import.meta.dir, "..")
const DIST = resolve(ROOT, "dist")
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")) as { version: string }
const VERSION = rootPkg.version

// ── Clean ──
console.log("🧹 Cleaning dist/...")
try { const { rmSync } = await import("fs"); rmSync(DIST, { recursive: true, force: true }) } catch {}
mkdirSync(DIST, { recursive: true })

// ── 1. Bundle TypeScript ──
console.log("📦 Bundling TypeScript...")

await build({
  entryPoints: [resolve(ROOT, "packages/engine/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: true,
  outfile: resolve(DIST, "engine.js"),
  external: [
    "bun:ffi",
    "solid-js",
    "solid-js/universal",
    "@babel/core",
    "babel-preset-solid",
    "web-tree-sitter",
    "marked",
    "@chenglou/pretext",
    "@napi-rs/canvas",
    "opentype.js",
  ],
  // Replace monorepo workspace imports with relative paths
  alias: {
    "@vexart/engine": resolve(ROOT, "packages/engine/src/index.ts"),
  },
  // Inject FFI path override — tell the bundle to look in vendor/ next to itself
  define: {
    "process.env.VEXART_DIST": '"true"',
  },
  banner: {
    js: `/* Vexart — GPU-Accelerated Terminal UI Engine | Closed Source | (c) ${new Date().getFullYear()} */`,
  },
})

// ── 2. Solid JSX plugin for esbuild ──

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
          ["babel-preset-solid", { generate: "universal", moduleName: "@vexart/engine" }],
          ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
        ],
      })
      return { contents: result?.code ?? source, loader: "js" }
    })
  },
}

// ── 3. Bundle unified barrel (app + styled + headless + engine hooks) ──
console.log("📦 Bundling unified barrel...")

await build({
  entryPoints: [resolve(ROOT, "packages/app/src/barrel.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: true,
  outfile: resolve(DIST, "vexart.js"),
  external: [
    "bun:ffi",
    "solid-js",
    "solid-js/universal",
    "web-tree-sitter",
    "marked",
    "@napi-rs/canvas",
    "@chenglou/pretext",
    "opentype.js",
    // Engine is NOT inlined — imported from ./engine.js so vexart.js
    // and consumer JSX share the same reconciler instance.
    "./engine.js",
  ],
  alias: {
    // Rewrite @vexart/engine → ./engine.js (co-located dist bundle).
    // This prevents a duplicate reconciler that breaks intrinsic elements
    // rendered inside pre-compiled components (Input self-rendering, etc.).
    "@vexart/engine": "./engine.js",
    "@vexart/primitives": resolve(ROOT, "packages/primitives/src/index.ts"),
    "@vexart/headless": resolve(ROOT, "packages/headless/src/index.ts"),
    "@vexart/styled": resolve(ROOT, "packages/styled/src/index.ts"),
    "@vexart/app": resolve(ROOT, "packages/app/src/index.ts"),
  },
  plugins: [solidPlugin],
  define: {
    "process.env.VEXART_DIST": '"true"',
  },
  banner: {
    js: `/* Vexart — GPU-Accelerated Terminal UI Engine | Closed Source | (c) ${new Date().getFullYear()} */`,
  },
})

// ── 4. Build platform package (@vxrt/darwin-arm64) ──
console.log("🔧 Building platform package...")

const vexartName = process.platform === "darwin" ? "libvexart.dylib" : process.platform === "win32" ? "vexart.dll" : "libvexart.so"
// Workspace root target dir is the canonical location (cargo builds there).
// The per-crate path native/libvexart/target/release/ may contain stale builds.
const vexartLibWorkspace = resolve(ROOT, "target/release", vexartName)
const vexartLibCrate = resolve(ROOT, "native/libvexart/target/release", vexartName)
const vexartLib = existsSync(vexartLibWorkspace) ? vexartLibWorkspace : vexartLibCrate
const arch = process.arch === "arm64" ? "arm64" : "x64"
const platformTag = `${process.platform}-${arch}`
const platformPkgName = `@vxrt/${platformTag}`
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
  type: "module",
  os: [process.platform],
  cpu: [process.arch],
  files: [vexartName],
  license: "SEE LICENSE IN LICENSE.md",
}
writeFileSync(resolve(platformDir, "package.json"), JSON.stringify(platformPkg, null, 2))
console.log(`  ✅ ${platformPkgName} package.json`)

// ── 5. Copy tree-sitter assets ──
console.log("🌳 Copying tree-sitter assets...")

const assetsDir = resolve(ROOT, "packages/engine/src/reconciler/tree-sitter/assets")
const distAssets = resolve(DIST, "tree-sitter/assets")
cpSync(assetsDir, distAssets, { recursive: true })
console.log(`  ✅ tree-sitter assets → tree-sitter/assets/`)

// ── 6. Copy parser worker ──
console.log("👷 Copying parser worker...")
cpSync(
  resolve(ROOT, "packages/engine/src/reconciler/tree-sitter/parser.worker.ts"),
  resolve(DIST, "tree-sitter/parser.worker.ts")
)
console.log(`  ✅ parser.worker.ts → tree-sitter/`)

// ── 7. Copy solid plugin (dist version with moduleName: "@vexart/engine") ──
console.log("🔌 Copying solid plugin...")
cpSync(resolve(ROOT, "scripts/solid-plugin-dist.ts"), resolve(DIST, "solid-plugin.ts"))
console.log(`  ✅ solid-plugin.ts (moduleName: "@vexart/engine")`)

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

// ── 9. Create package.json ──
console.log("📋 Creating package.json...")

const pkg = {
  name: "vxrt",
  version: VERSION,
  description: "Vexart GPU-accelerated terminal UI engine. Write JSX, get browser-quality UI in your terminal.",
  type: "module",
  main: "vexart.js",
  types: "vexart.d.ts",
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
    },
    "./solid-plugin": "./solid-plugin.ts",
    "./tree-sitter/parser.worker.ts": "./tree-sitter/parser.worker.ts",
  },
  files: [
    "vexart.js",
    "vexart.d.ts",
    "components.d.ts",
    "void.d.ts",
    "engine.js",
    "engine.d.ts",
    "jsx-runtime.d.ts",
    "solid-plugin.ts",
    "tree-sitter/",
  ],
  optionalDependencies: {
    "@vxrt/darwin-arm64": VERSION,
    "@vxrt/darwin-x64": VERSION,
    "@vxrt/linux-x64": VERSION,
    "@vxrt/linux-arm64": VERSION,
  },
  peerDependencies: {
    "solid-js": "^1.9.0",
  },
  dependencies: {
    "web-tree-sitter": "^0.26.8",
    "marked": "^18.0.0",
    "@chenglou/pretext": "^0.0.5",
    "@napi-rs/canvas": "^0.1.97",
  },
  engines: {
    bun: ">=1.1.0",
  },
  license: "SEE LICENSE IN LICENSE.md",
}

writeFileSync(resolve(DIST, "package.json"), JSON.stringify(pkg, null, 2))
console.log(`  ✅ package.json`)

// ── Done ──
console.log("")
console.log("✅ Build complete! Output in dist/")
console.log("")
console.log("To publish:")
console.log(`  cd dist/platform/${platformTag} && npm publish --access public`)
console.log("  cd dist && npm publish")
console.log("")
console.log("To test locally:")
console.log(`  cd dist/platform/${platformTag} && bun pack`)
console.log("  cd dist && bun pack")
console.log("  # In another project:")
console.log(`  bun add ../vexart/dist/vxrt-core-${VERSION}.tgz`)
console.log(`  bun add ../vexart/dist/platform/${platformTag}/vexart-${platformTag}-${VERSION}.tgz`)
