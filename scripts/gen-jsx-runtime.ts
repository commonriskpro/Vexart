#!/usr/bin/env bun
/**
 * gen-jsx-runtime.ts
 *
 * Audits that types/jsx-runtime.d.ts BoxProps contains all top-level TGEProps
 * keys defined in packages/engine/src/ffi/node.ts.
 *
 * Usage:
 *   bun run gen:jsx-runtime              — audit mode (report drift, exit 1 if missing)
 *   bun run gen:jsx-runtime --update     — (no-op; file is hand-maintained)
 *
 * Only top-level TGEProps keys are checked. Nested object keys (e.g. inside
 * shadow/gradient/transform) are NOT checked because BoxProps may inline them
 * differently than the engine type.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const NODE_TS = join(ROOT, "packages/engine/src/ffi/node.ts")
const JSX_DTS = join(ROOT, "types/jsx-runtime.d.ts")

// ── Extract top-level TGEProps keys from node.ts ──────────────────────────────
// Strategy: find the TGEProps block and extract only lines with 2 spaces of
// indentation (top-level props), skipping nested object type lines.

function extractTGEPropsTopKeys(src: string): string[] {
  const match = src.match(/export type TGEProps = \{([\s\S]*?)\n\}/)
  if (!match) {
    console.error("ERROR: Could not find TGEProps type in node.ts")
    process.exit(1)
  }

  const body = match[1]
  const keys: string[] = []
  let depth = 0

  for (const line of body.split("\n")) {
    // Track brace depth to skip nested object properties
    depth += (line.match(/\{/g) ?? []).length
    depth -= (line.match(/\}/g) ?? []).length

    // Only parse top-level props (depth === 0 when we read the line)
    // A top-level prop line starts with exactly 2 spaces
    if (depth === 0 || (depth === 1 && line.trimStart() !== line)) {
      const propMatch = line.match(/^  (\w+)\??(\s*:|\s*\|)/)
      if (propMatch && !line.startsWith("   ")) {
        keys.push(propMatch[1])
      }
    }
  }

  return [...new Set(keys)] // deduplicate (shouldn't have duplicates, but just in case)
}

// ── Extract BoxProps keys from jsx-runtime.d.ts ───────────────────────────────

function extractBoxPropsTopKeys(src: string): Set<string> {
  const match = src.match(/interface BoxProps \{([\s\S]*?)\n\}/)
  if (!match) {
    console.error("ERROR: Could not find BoxProps interface in jsx-runtime.d.ts")
    process.exit(1)
  }

  const body = match[1]
  const keys = new Set<string>()
  let depth = 0

  for (const line of body.split("\n")) {
    depth += (line.match(/\{/g) ?? []).length
    depth -= (line.match(/\}/g) ?? []).length

    if (depth === 0 || (depth === 1 && !line.startsWith("   "))) {
      const propMatch = line.match(/^  (\w+)\??\s*[?:]/)
      if (propMatch) keys.add(propMatch[1])
    }
  }

  return keys
}

// ── Main ──────────────────────────────────────────────────────────────────────

const nodeSrc = readFileSync(NODE_TS, "utf8")
const jsxSrc = readFileSync(JSX_DTS, "utf8")

const tgeKeys = extractTGEPropsTopKeys(nodeSrc)
const boxKeys = extractBoxPropsTopKeys(jsxSrc)

// Keys intentionally omitted from BoxProps (internal engine props not needed in JSX,
// or element-specific props that belong on other intrinsics).
const INTENTIONALLY_OMITTED = new Set([
  // Internal engine props
  "debugName",         // internal engine debugging
  "interactionMode",   // managed by engine, not JSX consumers
  // Aliases (BoxProps uses the canonical name)
  "boxShadow",         // alias — BoxProps uses "shadow"
  "borderRadius",      // alias — BoxProps uses "cornerRadius"
  // Meta-props
  "style",             // meta-prop, not a direct JSX attribute
  // Element-specific props (declared on their own intrinsic, not <box>)
  "src",               // <img> only
  "objectFit",         // <img> only
  "onDraw",            // <canvas>/<surface> only
  "viewport",          // <canvas>/<surface> only
  "color",             // <text> only
  "fontSize",          // <text> only
  "fontId",            // <text> only
  "lineHeight",        // <text> only
  "wordBreak",         // <text> only
  "whiteSpace",        // <text> only
  "fontFamily",        // <text> only
  "fontWeight",        // <text> only
  "fontStyle",         // <text> only
])

const update = process.argv.includes("--update")

if (update) {
  console.log("ℹ️  jsx-runtime.d.ts is hand-maintained. Use audit mode to detect drift.")
  console.log("   Edit types/jsx-runtime.d.ts directly to add new props.")
  process.exit(0)
}

// Audit mode
const missing = tgeKeys.filter(k => !boxKeys.has(k) && !INTENTIONALLY_OMITTED.has(k))

let hasIssues = false

if (missing.length > 0) {
  console.error(`\n❌ TGEProps top-level keys missing from BoxProps (${missing.length}):`)
  for (const k of missing) console.error(`   - ${k}`)
  console.error("\nAdd these to the BoxProps interface in types/jsx-runtime.d.ts")
  hasIssues = true
} else {
  console.log(`✅ All ${tgeKeys.length} TGEProps top-level keys are present in BoxProps`)
  console.log(`   (${INTENTIONALLY_OMITTED.size} intentionally omitted: ${[...INTENTIONALLY_OMITTED].join(", ")})`)
}

if (hasIssues) process.exit(1)
console.log("jsx-runtime.d.ts is in sync with TGEProps.")
