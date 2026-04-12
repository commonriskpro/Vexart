/**
 * Build script — creates a distributable npm package.
 *
 * Output: dist/
 *   tge.js              ← single minified bundle (all @tge/* packages)
 *   tge.d.ts            ← public API type declarations (TODO)
 *   solid-plugin.js     ← babel preload for JSX transform
 *   vendor/
 *     tge/
 *       arm64-darwin/libtge.dylib
 *     clay/
 *       arm64-darwin/libclay.dylib
 *   tree-sitter/
 *     assets/            ← grammar .wasm + .scm files
 *   package.json
 *
 * Run: bun run scripts/build-dist.ts
 */

import { build } from "esbuild"
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import { resolve, join } from "path"

const ROOT = resolve(import.meta.dir, "..")
const DIST = resolve(ROOT, "dist")

// ── Clean ──
console.log("🧹 Cleaning dist/...")
try { cpSync(DIST, DIST + ".bak", { recursive: true }) } catch {}
mkdirSync(DIST, { recursive: true })

// ── 1. Bundle TypeScript ──
console.log("📦 Bundling TypeScript...")

await build({
  entryPoints: [resolve(ROOT, "packages/renderer/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  minify: true,
  outfile: resolve(DIST, "tge.js"),
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
    "@tge/terminal": resolve(ROOT, "packages/terminal/src/index.ts"),
    "@tge/input": resolve(ROOT, "packages/input/src/index.ts"),
    "@tge/pixel": resolve(ROOT, "packages/pixel/src/index.ts"),
    "@tge/output": resolve(ROOT, "packages/output/src/index.ts"),
    "@tge/tokens": resolve(ROOT, "packages/tokens/src/index.ts"),
  },
  // Inject FFI path override — tell the bundle to look in vendor/ next to itself
  define: {
    "process.env.TGE_DIST": '"true"',
  },
  banner: {
    js: `/* TGE — Terminal Graphics Engine | Closed Source | (c) ${new Date().getFullYear()} */`,
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
          ["babel-preset-solid", { generate: "universal", moduleName: "tge" }],
          ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
        ],
      })
      return { contents: result?.code ?? source, loader: "js" }
    })
  },
}

await build({
  entryPoints: [resolve(ROOT, "packages/components/src/index.ts")],
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
    "tge",
  ],
  alias: {
    "@tge/renderer": resolve(ROOT, "packages/renderer/src/index.ts"),
    "@tge/renderer/scroll": resolve(ROOT, "packages/renderer/src/scroll.ts"),
    "@tge/tokens": resolve(ROOT, "packages/tokens/src/index.ts"),
  },
  plugins: [solidPlugin],
})

// ── 2b. Bundle void (design system — pre-transform JSX with Babel) ──
console.log("📦 Bundling void...")

await build({
  entryPoints: [resolve(ROOT, "packages/void/src/index.ts")],
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
    "tge",
  ],
  plugins: [solidPlugin],
})

// ── 3. Copy native binaries ──
console.log("🔧 Copying native binaries...")

const arch = process.arch === "arm64" ? "arm64" : "x64"
const platform = process.platform as string
const target = `${arch}-${platform}`

const vendorDir = resolve(DIST, "vendor")

// Zig shared lib
const zigDir = resolve(vendorDir, "tge", target)
mkdirSync(zigDir, { recursive: true })
const zigLib = resolve(ROOT, "zig/zig-out/lib", process.platform === "darwin" ? "libtge.dylib" : "libtge.so")
if (existsSync(zigLib)) {
  cpSync(zigLib, resolve(zigDir, process.platform === "darwin" ? "libtge.dylib" : "libtge.so"))
  console.log(`  ✅ libtge → vendor/tge/${target}/`)
} else {
  console.log(`  ⚠️ libtge not found at ${zigLib}`)
}

// Clay shared lib
const clayDir = resolve(vendorDir, "clay", target)
mkdirSync(clayDir, { recursive: true })
const clayLib = resolve(ROOT, "vendor/libclay.dylib")
if (existsSync(clayLib)) {
  cpSync(clayLib, resolve(clayDir, process.platform === "darwin" ? "libclay.dylib" : "libclay.so"))
  console.log(`  ✅ libclay → vendor/clay/${target}/`)
} else {
  console.log(`  ⚠️ libclay not found at ${clayLib}`)
}

// ── 4. Copy tree-sitter assets ──
console.log("🌳 Copying tree-sitter assets...")

const assetsDir = resolve(ROOT, "packages/renderer/src/tree-sitter/assets")
const distAssets = resolve(DIST, "tree-sitter/assets")
cpSync(assetsDir, distAssets, { recursive: true })
console.log(`  ✅ tree-sitter assets → tree-sitter/assets/`)

// ── 5. Copy parser worker ──
console.log("👷 Copying parser worker...")
cpSync(
  resolve(ROOT, "packages/renderer/src/tree-sitter/parser.worker.ts"),
  resolve(DIST, "tree-sitter/parser.worker.ts")
)
console.log(`  ✅ parser.worker.ts → tree-sitter/`)

// ── 6. Copy solid plugin (dist version with moduleName: "tge") ──
console.log("🔌 Copying solid plugin...")
cpSync(resolve(ROOT, "scripts/solid-plugin-dist.ts"), resolve(DIST, "solid-plugin.ts"))
console.log(`  ✅ solid-plugin.ts (moduleName: "tge")`)

// ── 7. Copy type declarations ──
console.log("📝 Copying type declarations...")
cpSync(resolve(ROOT, "types/tge.d.ts"), resolve(DIST, "tge.d.ts"))
cpSync(resolve(ROOT, "types/components.d.ts"), resolve(DIST, "components.d.ts"))
cpSync(resolve(ROOT, "types/jsx-runtime.d.ts"), resolve(DIST, "jsx-runtime.d.ts"))
cpSync(resolve(ROOT, "types/void.d.ts"), resolve(DIST, "void.d.ts"))
console.log(`  ✅ tge.d.ts + components.d.ts + jsx-runtime.d.ts + void.d.ts`)

// ── 8. Copy font atlas ──
console.log("🔤 Copying font atlas...")
const atlasDir = resolve(ROOT, "zig/src")
const distFontDir = resolve(DIST, "fonts")
mkdirSync(distFontDir, { recursive: true })
const atlasFile = resolve(atlasDir, "font_atlas.zig")
if (existsSync(atlasFile)) {
  // The atlas is compiled into libtge — no separate file needed
  console.log(`  ℹ️ Font atlas is compiled into libtge (no copy needed)`)
}

// ── 8. Create package.json ──
console.log("📋 Creating package.json...")

const pkg = {
  name: "tge",
  version: "0.0.1",
  description: "Pixel-native terminal rendering engine. Write JSX, get browser-quality UI in your terminal.",
  type: "module",
  main: "tge.js",
  types: "tge.d.ts",
  exports: {
    ".": {
      types: "./tge.d.ts",
      default: "./tge.js",
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
    "tge.js",
    "tge.d.ts",
    "components.js",
    "components.d.ts",
    "void.js",
    "void.d.ts",
    "jsx-runtime.d.ts",
    "solid-plugin.ts",
    "vendor/",
    "tree-sitter/",
    "fonts/",
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
console.log("  bun add ../tge/dist/tge-0.0.1.tgz")
