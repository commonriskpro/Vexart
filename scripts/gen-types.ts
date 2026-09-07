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

// ── 3b. Post-process .d.ts — clean up leaked internals ──
console.log("🧹 Post-processing type declarations...")

for (const name of ["engine.d.ts", "vexart.d.ts"] as const) {
  const file = resolve(TYPES, name)
  let content = readFileSync(file, "utf-8")

  // Remove flexily import — _flexNode is an internal field that leaks through TGENode
  content = content.replace(/^import \{ Node as Node_2 \} from 'flexily';\n?/m, "")
  // Replace Node_2 references with opaque type
  content = content.replace(/Node_2/g, "unknown")

  // Fix JSX return types — api-extractor sometimes emits `: JSX` instead of `: JSX.Element`
  content = content.replace(/\): JSX;/g, "): JSX.Element;")

  writeFileSync(file, content)
}
console.log("  ✅ Removed flexily leak, fixed JSX return types")

// ── 4. Generate jsx-runtime.d.ts ──
console.log("📝 Generating jsx-runtime.d.ts...")

const jsxRuntime = `/**
 * Vexart JSX runtime type declarations.
 * AUTO-GENERATED — do not edit manually.
 *
 * When tsconfig has jsxImportSource: "vexart", TypeScript resolves
 * JSX types from vexart/jsx-runtime.
 */

import type { TGEProps, NodeMouseEvent, NodeHandle } from "./engine"

type Children = JSX.Element | JSX.Element[] | string | number | boolean | null | undefined
type RefCallback = (handle: NodeHandle) => void
type ColorValue = string | number
type ShadowDef = { x: number; y: number; blur: number; color: ColorValue }
type CornerRadii = { tl: number; tr: number; br: number; bl: number }

type BoxIntrinsicProps = TGEProps & {
  ref?: RefCallback
  layer?: boolean
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  shadow?: ShadowDef | ShadowDef[]
  glow?: { radius: number; color: ColorValue; intensity?: number }
  onMouseDown?: (evt: NodeMouseEvent) => void
  onMouseUp?: (evt: NodeMouseEvent) => void
  onMouseOver?: (evt: NodeMouseEvent) => void
  onMouseOut?: (evt: NodeMouseEvent) => void
  onMouseMove?: (evt: NodeMouseEvent) => void
  focusStyle?: {
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    cornerRadius?: number
    shadow?: ShadowDef | ShadowDef[]
    glow?: { radius: number; color: ColorValue; intensity?: number }
    gradient?: { type: "linear"; from: ColorValue; to: ColorValue; angle?: number } | { type: "radial"; from: ColorValue; to: ColorValue }
    backdropBlur?: number
    opacity?: number
  }
  opacity?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
  children?: Children
}

type TextIntrinsicProps = {
  ref?: RefCallback
  color?: ColorValue
  fontSize?: number
  fontId?: number
  lineHeight?: number
  wordBreak?: "normal" | "keep-all"
  whiteSpace?: "normal" | "pre-wrap"
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  children?: Children
}

type ImgIntrinsicProps = {
  src: string
  objectFit?: "contain" | "cover" | "fill" | "none"
  width?: number | string
  height?: number | string
  cornerRadius?: number
  cornerRadii?: CornerRadii
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  flexGrow?: number
  flexShrink?: number
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  zIndex?: number
  layer?: boolean
  opacity?: number
}

type CanvasIntrinsicProps = TGEProps & {
  ref?: RefCallback
  onDraw?: TGEProps["onDraw"]
  drawCacheKey?: string | number
  viewport?: TGEProps["viewport"]
  children?: Children
}

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
