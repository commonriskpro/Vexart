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
const GRID_TYPES = [
  "GridAreaPlacement",
  "GridAutoFlow",
  "GridBreadth",
  "GridContentAlignment",
  "GridErrorCode",
  "GridFitContent",
  "GridFr",
  "GridItemAlignment",
  "GridLineRef",
  "GridLayoutError",
  "GridMaxBreadth",
  "GridMinMax",
  "GridPercent",
  "GridPlacement",
  "GridRepeatCount",
  "GridTrack",
  "GridTrackSize",
] as const
const GRID_PROPS = [
  "layout",
  "justifyContent",
  "alignItems",
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridAutoColumns",
  "gridAutoRows",
  "gridAutoFlow",
  "gridTemplateAreas",
  "gridColumn",
  "gridRow",
  "gridArea",
  "alignContent",
  "justifyItems",
  "justifySelf",
  "alignSelf",
] as const

/** Write generated text with one platform-independent newline convention. */
function writeLf(file: string, content: string): void {
  writeFileSync(file, content.replace(/\r\n?/g, "\n"))
}

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

// API Extractor defaults to CRLF. Keep the tracked Grid API report stable too;
// this runs after api:update and is part of the generator, not a manual file
// rewrite step.
const engineApiReport = resolve(ROOT, "packages/engine/etc/engine.api.md")
if (existsSync(engineApiReport)) writeLf(engineApiReport, readFileSync(engineApiReport, "utf8"))

// ── 3b. Post-process .d.ts — clean up leaked internals ──
console.log("🧹 Post-processing type declarations...")

for (const name of ["engine.d.ts", "vexart.d.ts"] as const) {
  const file = resolve(TYPES, name)
  let content = readFileSync(file, "utf-8")

  // Remove flexily import — _flexNode is an internal field that leaks through TGENode
  content = content.replace(/^import (?:type )?\{ Node as Node_2 \} from 'flexily';\r?\n?/m, "")
  // Replace Node_2 references with opaque type
  content = content.replace(/Node_2/g, "unknown")

  // Fix JSX return types — api-extractor sometimes emits `: JSX` instead of `: JSX.Element`
  content = content.replace(/\): JSX;/g, "): JSX.Element;")

  writeLf(file, content)
}
console.log("  ✅ Removed flexily leak, fixed JSX return types")

// API Extractor's public rollup trims @beta declarations. Grid is a supported
// beta surface in the v1.x profile, so retain its named exports and TGEProps
// fields in consumer declarations. The source d.ts files remain authoritative;
// this repairs only the generated public rollup boundary.
const gridDts = resolve(ROOT, ".api-extractor-temp/packages/engine/src/ffi/grid-types.d.ts")
const nodeTypesDts = resolve(ROOT, ".api-extractor-temp/packages/engine/src/ffi/node-types.d.ts")

function declaration(source: string, name: string): string | null {
  const marker = `export type ${name} =`
  const start = source.indexOf(marker)
  if (start < 0) return null
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "{") depth += 1
    else if (char === "}") depth -= 1
    else if (char === ";" && depth === 0) return source.slice(start, index + 1).trim()
  }
  return null
}

function property(source: string, name: string): string | null {
  const match = source.match(new RegExp(`^[ \\t]+${name}\\?:[^\\n;]+;`, "m"))
  return match?.[0].trim() ?? null
}

if (existsSync(gridDts) && existsSync(nodeTypesDts)) {
  const gridSource = readFileSync(gridDts, "utf8")
  const nodeSource = readFileSync(nodeTypesDts, "utf8")
  const gridDeclarations = new Map(
    GRID_TYPES.map((name) => [name, declaration(gridSource, name)] as const),
  )
  const gridProperties = new Map(
    GRID_PROPS.map((name) => [name, property(nodeSource, name)] as const),
  )

  for (const name of ["engine.d.ts", "vexart.d.ts"] as const) {
    const file = resolve(TYPES, name)
    let content = readFileSync(file, "utf8")
    const eol = "\n"
    for (const typeName of GRID_TYPES) {
      const marker = `/* Excluded from this release type: ${typeName} */`
      const value = gridDeclarations.get(typeName)
      if (value && content.includes(marker)) {
        const normalized = value
          .replace(/\r?\n/g, eol)
          .replace(/^export type /, "export declare type ")
        content = content.replace(marker, `/** @beta */${eol}${normalized}`)
      }
    }
    for (const propName of GRID_PROPS) {
      const value = gridProperties.get(propName)
      const marker = new RegExp(`^(\\s*)/\\* Excluded from this release type: ${propName} \\*/$`, "m")
      if (value && marker.test(content)) {
        const normalized = value.replace(/\r?\n/g, eol)
        content = content.replace(marker, (_match, indent: string) => `${indent}/** @beta */${eol}${indent}${normalized}`)
      }
    }
    writeLf(file, content)
  }
  console.log("  ✅ Preserved beta Grid types and TGEProps fields in rollups")
}

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

/** All engine layout props, including the Grid beta contract, are inherited. */
interface BoxProps extends TGEProps {
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

type BoxIntrinsicProps = BoxProps

type TextIntrinsicProps = TGEProps & {
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

type ImgIntrinsicProps = TGEProps & {
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

writeLf(resolve(TYPES, "jsx-runtime.d.ts"), jsxRuntime)
console.log("  ✅ types/jsx-runtime.d.ts")

// ── 5. Copy sub-module type stubs (headless components, styled/void) ──
// These are extracted from the api-extractor temp but simplified for consumers
console.log("📝 Generating component type stubs...")

// components.d.ts — headless component types referenced by vexart.d.ts
const componentsDts = resolve(TYPES, "components.d.ts")
if (!existsSync(componentsDts)) {
  writeLf(componentsDts, `// Auto-stub — headless component types are inlined in vexart.d.ts\nexport {}\n`)
}

// void.d.ts — styled component types referenced by vexart.d.ts
const voidDts = resolve(TYPES, "void.d.ts")
if (!existsSync(voidDts)) {
  writeLf(voidDts, `// Auto-stub — styled/void component types are inlined in vexart.d.ts\nexport {}\n`)
}

console.log("  ✅ types/components.d.ts + void.d.ts")

console.log("")
console.log("✅ All type declarations generated!")
console.log("   Run 'bun run build:dist' to package them for npm.")
