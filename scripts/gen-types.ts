/**
 * Generate dist type declarations automatically from source.
 *
 * Steps:
 *   1. tsc → .api-extractor-temp/ (declaration files)
 *   2. api-extractor → types/engine.d.ts (from @vexart/engine public surface)
 *   3. api-extractor → types/vexart.d.ts (from barrel, re-exports everything)
 *   4. Copy jsx-runtime.d.ts from reconciler/jsx.d.ts + augmentation
 *
 * Run: bun run scripts/gen-types.ts
 */

import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const ROOT = resolve(import.meta.dir, "..")
const TYPES = resolve(ROOT, "types")

mkdirSync(TYPES, { recursive: true })

// ── 1. Generate .d.ts with tsc ──
console.log("📝 Generating declaration files...")
await $`tsc -p tsconfig.api.json`.quiet()

// ── 2. api-extractor → engine.d.ts ──
console.log("📦 Rolling up engine.d.ts...")
await $`bunx api-extractor run --local --config packages/engine/api-extractor.json`.quiet().catch((e) => {
  // api-extractor returns non-zero on warnings — we still get the output
  if (!existsSync(resolve(TYPES, "engine.d.ts"))) {
    console.error("  ❌ engine.d.ts generation failed")
    process.exit(1)
  }
})
console.log("  ✅ types/engine.d.ts")

// ── 3. api-extractor → vexart.d.ts (barrel) ──
console.log("📦 Rolling up vexart.d.ts...")
await $`bunx api-extractor run --local --config packages/app/api-extractor-barrel.json`.quiet().catch((e) => {
  if (!existsSync(resolve(TYPES, "vexart.d.ts"))) {
    console.error("  ❌ vexart.d.ts generation failed")
    process.exit(1)
  }
})
console.log("  ✅ types/vexart.d.ts")

// ── 4. Generate jsx-runtime.d.ts from source ──
console.log("📝 Generating jsx-runtime.d.ts...")

// Read the monorepo jsx.d.ts which has the intrinsic elements
const jsxSource = readFileSync(resolve(ROOT, "packages/engine/src/reconciler/jsx.d.ts"), "utf-8")

// Build the public jsx-runtime.d.ts
const jsxRuntime = `/**
 * Vexart JSX runtime type declarations.
 * AUTO-GENERATED — do not edit manually.
 * Source: packages/engine/src/reconciler/jsx.d.ts
 *
 * When tsconfig has jsxImportSource: "vexart", TypeScript resolves
 * JSX types from vexart/jsx-runtime.
 */

import type { CanvasContext, PressEvent, NodeMouseEvent, NodeHandle } from "./engine"

type Children = any
type ColorValue = string | number

${jsxSource
  // Remove the original imports (they reference internal paths)
  .replace(/^import.*$/gm, "")
  // Remove the "export {}" at the end
  .replace(/^export \{\}.*$/gm, "")
  // Remove the "declare module" block (we'll add our own)
  .replace(/declare module "solid-js"[\s\S]*$/m, "")
  .trim()}

export namespace JSX {
  type Element = any
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements {
    box: BoxIntrinsicProps
    text: TextIntrinsicProps
    image: ImgIntrinsicProps
    img: ImgIntrinsicProps
    canvas: CanvasIntrinsicProps
  }
}

export function jsx(type: any, props: any): any
export function jsxs(type: any, props: any): any
export function jsxDEV(type: any, props: any): any

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      box: BoxIntrinsicProps
      text: TextIntrinsicProps
      image: ImgIntrinsicProps
      img: ImgIntrinsicProps
      canvas: CanvasIntrinsicProps
    }
  }
}
`

writeFileSync(resolve(TYPES, "jsx-runtime.d.ts"), jsxRuntime)
console.log("  ✅ types/jsx-runtime.d.ts")

// ── 5. Copy sub-module type stubs (headless components, styled/void) ──
// These are extracted from the api-extractor temp but simplified for consumers
console.log("📝 Generating component type stubs...")

// components.d.ts — headless component types referenced by vexart.d.ts
const componentsDts = resolve(TYPES, "components.d.ts")
if (!existsSync(componentsDts)) {
  writeFileSync(componentsDts, `// Auto-stub — headless component types are inlined in vexart.d.ts\nexport {}\n`)
}

// void.d.ts — styled component types referenced by vexart.d.ts
const voidDts = resolve(TYPES, "void.d.ts")
if (!existsSync(voidDts)) {
  writeFileSync(voidDts, `// Auto-stub — styled/void component types are inlined in vexart.d.ts\nexport {}\n`)
}

console.log("  ✅ types/components.d.ts + void.d.ts")

console.log("")
console.log("✅ All type declarations generated!")
console.log("   Run 'bun run build:dist' to package them for npm.")
