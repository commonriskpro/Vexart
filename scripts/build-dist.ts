/**
 * Build script — creates a distributable npm package.
 *
 * Output: dist/
 *   engine.js           ← @vexart/engine bundle
 *   engine.d.ts         ← public API type declarations
 *   solid-plugin.js     ← babel preload for JSX transform
 *   vendor/
 *     vexart/
 *       arm64-darwin/libvexart.dylib
 *   tree-sitter/
 *     assets/            ← grammar .wasm + .scm files
 *   package.json
 *
 * Run: bun run scripts/build-dist.ts
 */

import { build } from "esbuild"
import { cpSync, mkdirSync, writeFileSync, existsSync } from "fs"
import { resolve } from "path"

const ROOT = resolve(import.meta.dir, "..")
const DIST = resolve(ROOT, "dist")

// ── Clean ──
console.log("🧹 Cleaning dist/...")
try { cpSync(DIST, DIST + ".bak", { recursive: true }) } catch {}
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

// ── 2. Bundle components (pre-transform JSX with Babel, then esbuild minify) ──
console.log("📦 Bundling components...")

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

await build({
  entryPoints: [resolve(ROOT, "packages/headless/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: true,
  outfile: resolve(DIST, "components.js"),
  external: [
    "bun:ffi",
    "solid-js",
    "solid-js/universal",
    "web-tree-sitter",
    "marked",
    "@napi-rs/canvas",
    "@chenglou/pretext",
    "opentype.js",
    "@vexart/engine",
  ],
  alias: {
    "@vexart/engine": resolve(ROOT, "packages/engine/src/index.ts"),
    "@vexart/primitives": resolve(ROOT, "packages/primitives/src/index.ts"),
    "@vexart/headless": resolve(ROOT, "packages/headless/src/index.ts"),
  },
  plugins: [solidPlugin],
})

// ── 2b. Bundle void (design system — pre-transform JSX with Babel) ──
console.log("📦 Bundling void...")

await build({
  entryPoints: [resolve(ROOT, "packages/styled/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: true,
  outfile: resolve(DIST, "void.js"),
  external: [
    "bun:ffi",
    "solid-js",
    "solid-js/universal",
    "@napi-rs/canvas",
    "@vexart/engine",
  ],
  alias: {
    "@vexart/engine": resolve(ROOT, "packages/engine/src/index.ts"),
    "@vexart/primitives": resolve(ROOT, "packages/primitives/src/index.ts"),
    "@vexart/headless": resolve(ROOT, "packages/headless/src/index.ts"),
    "@vexart/styled": resolve(ROOT, "packages/styled/src/index.ts"),
  },
  plugins: [solidPlugin],
})

// ── 3. Copy native binaries ──
console.log("🔧 Copying native binaries...")

const arch = process.arch === "arm64" ? "arm64" : "x64"
const platform = process.platform as string
const target = `${arch}-${platform}`

const vendorDir = resolve(DIST, "vendor")

// libvexart shared lib
const vexartDir = resolve(vendorDir, "vexart", target)
mkdirSync(vexartDir, { recursive: true })
const vexartName = process.platform === "darwin" ? "libvexart.dylib" : process.platform === "win32" ? "vexart.dll" : "libvexart.so"
const vexartLib = resolve(ROOT, "native/libvexart/target/release", vexartName)
if (existsSync(vexartLib)) {
  cpSync(vexartLib, resolve(vexartDir, vexartName))
  console.log(`  ✅ libvexart → vendor/vexart/${target}/`)
} else {
  console.log(`  ⚠️ libvexart not found at ${vexartLib}`)
}

// ── 4. Copy tree-sitter assets ──
console.log("🌳 Copying tree-sitter assets...")

const assetsDir = resolve(ROOT, "packages/engine/src/reconciler/tree-sitter/assets")
const distAssets = resolve(DIST, "tree-sitter/assets")
cpSync(assetsDir, distAssets, { recursive: true })
console.log(`  ✅ tree-sitter assets → tree-sitter/assets/`)

// ── 5. Copy parser worker ──
console.log("👷 Copying parser worker...")
cpSync(
  resolve(ROOT, "packages/engine/src/reconciler/tree-sitter/parser.worker.ts"),
  resolve(DIST, "tree-sitter/parser.worker.ts")
)
console.log(`  ✅ parser.worker.ts → tree-sitter/`)

// ── 6. Copy solid plugin (dist version with moduleName: "@vexart/engine") ──
console.log("🔌 Copying solid plugin...")
cpSync(resolve(ROOT, "scripts/solid-plugin-dist.ts"), resolve(DIST, "solid-plugin.ts"))
console.log(`  ✅ solid-plugin.ts (moduleName: "@vexart/engine")`)

// ── 7. Copy type declarations ──
console.log("📝 Copying type declarations...")
cpSync(resolve(ROOT, "types/engine.d.ts"), resolve(DIST, "engine.d.ts"))
cpSync(resolve(ROOT, "types/components.d.ts"), resolve(DIST, "components.d.ts"))
cpSync(resolve(ROOT, "types/jsx-runtime.d.ts"), resolve(DIST, "jsx-runtime.d.ts"))
cpSync(resolve(ROOT, "types/void.d.ts"), resolve(DIST, "void.d.ts"))
console.log(`  ✅ engine.d.ts + components.d.ts + jsx-runtime.d.ts + void.d.ts`)

// ── 8. Create package.json ──
console.log("📋 Creating package.json...")

const pkg = {
  name: "vexart",
  version: "0.9.0-beta.0",
  description: "Vexart GPU-accelerated terminal UI engine. Write JSX, get browser-quality UI in your terminal.",
  type: "module",
  main: "engine.js",
  types: "engine.d.ts",
  exports: {
    ".": {
      types: "./engine.d.ts",
      default: "./engine.js",
    },
    "./components": {
      types: "./components.d.ts",
      default: "./components.js",
    },
    "./void": {
      types: "./void.d.ts",
      default: "./void.js",
    },
    "./jsx-runtime": {
      types: "./jsx-runtime.d.ts",
    },
    "./solid-plugin": "./solid-plugin.ts",
    "./tree-sitter/parser.worker.ts": "./tree-sitter/parser.worker.ts",
  },
  files: [
    "engine.js",
    "engine.d.ts",
    "components.js",
    "components.d.ts",
    "void.js",
    "void.d.ts",
    "jsx-runtime.d.ts",
    "solid-plugin.ts",
    "vendor/",
    "tree-sitter/",
  ],
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
console.log("  cd dist && npm publish")
console.log("")
console.log("To test locally:")
console.log("  cd dist && bun pack")
console.log("  # In another project:")
console.log("  bun add ../vexart/dist/vexart-0.9.0-beta.0.tgz")
