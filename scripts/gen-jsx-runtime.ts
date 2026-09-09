#!/usr/bin/env bun
/**
 * gen-jsx-runtime.ts
 *
 * Audits that every layout-bearing intrinsic in types/jsx-runtime.d.ts
 * inherits the top-level TGEProps contract defined in
 * packages/engine/src/ffi/node-types.ts.
 *
 * Usage:
 *   bun run gen:jsx-runtime              — audit mode (report drift, exit 1 if missing)
 *   bun run gen:jsx-runtime --update     — (no-op; declarations are generated
 *                                           by gen-types.ts)
 *
 * Only top-level TGEProps keys are checked. Nested object keys (e.g. inside
 * shadow/gradient/transform) are NOT checked because BoxProps may inline them
 * differently than the engine type.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const NODE_TS = join(ROOT, "packages/engine/src/ffi/node-types.ts")
const JSX_DTS = join(ROOT, "types/jsx-runtime.d.ts")

function extractBlock(src: string, marker: string): { body: string; header: string } | null {
  const start = src.indexOf(marker)
  if (start < 0) return null
  const open = src.indexOf("{", start + marker.length)
  if (open < 0) return null

  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let index = open; index < src.length; index += 1) {
    const char = src[index]
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
    if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return { body: src.slice(open + 1, index), header: src.slice(start, open) }
      }
    }
  }
  return null
}

// ── Extract top-level TGEProps keys from node-types.ts ───────────────────────
// A brace-aware scan is used instead of a non-greedy regex: nested config
// objects and function imports are part of the public type.

function extractTGEPropsTopKeys(src: string): string[] {
  const block = extractBlock(src, "export type TGEProps =")
  if (!block) {
    console.error("ERROR: Could not find TGEProps type in node-types.ts")
    process.exit(1)
  }

  const keys: string[] = []
  let depth = 0

  for (const line of block.body.split("\n")) {
    if (depth === 0) {
      const propMatch = line.match(/^  ([A-Za-z_$][\w$]*)\??\s*:/)
      if (propMatch) keys.push(propMatch[1])
    }
    depth += (line.match(/\{/g) ?? []).length
    depth -= (line.match(/\}/g) ?? []).length
  }

  return [...new Set(keys)] // deduplicate (shouldn't have duplicates, but just in case)
}

// ── Extract intrinsic props from jsx-runtime.d.ts ────────────────────────────

function extractIntrinsicProps(src: string, marker: string, label: string): { keys: Set<string>; inheritsTGEProps: boolean } {
  const block = extractBlock(src, marker)
  if (!block) {
    console.error(`ERROR: Could not find ${label} in jsx-runtime.d.ts`)
    process.exit(1)
  }

  const keys = new Set<string>()
  let depth = 0

  for (const line of block.body.split("\n")) {
    if (depth === 0) {
      const propMatch = line.match(/^  ([A-Za-z_$][\w$]*)\??\s*[?:]/)
      if (propMatch) keys.add(propMatch[1])
    }
    depth += (line.match(/\{/g) ?? []).length
    depth -= (line.match(/\}/g) ?? []).length
  }

  return {
    keys,
    inheritsTGEProps: /\bextends\s+TGEProps\b/.test(block.header) || /\bTGEProps\s*&/.test(block.header),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const nodeSrc = readFileSync(NODE_TS, "utf8")
const jsxSrc = readFileSync(JSX_DTS, "utf8")

const tgeKeys = extractTGEPropsTopKeys(nodeSrc)
const intrinsics = [
  { label: "BoxProps", marker: "interface BoxProps" },
  { label: "TextIntrinsicProps", marker: "type TextIntrinsicProps" },
  { label: "ImgIntrinsicProps", marker: "type ImgIntrinsicProps" },
].map(({ label, marker }) => ({ label, ...extractIntrinsicProps(jsxSrc, marker, label) }))

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
  console.log("ℹ️  jsx-runtime.d.ts is generated by gen-types.ts; --update is audit-only.")
  process.exit(0)
}

// Audit mode
let hasIssues = false
for (const intrinsic of intrinsics) {
  const missing = intrinsic.inheritsTGEProps
    ? []
    : tgeKeys.filter(k => !intrinsic.keys.has(k) && !INTENTIONALLY_OMITTED.has(k))
  if (missing.length > 0) {
    console.error(`\n❌ TGEProps top-level keys missing from ${intrinsic.label} (${missing.length}):`)
    for (const k of missing) console.error(`   - ${k}`)
    console.error(`\nAdd TGEProps inheritance to ${intrinsic.label} in types/jsx-runtime.d.ts`)
    hasIssues = true
    continue
  }
  const inheritance = intrinsic.inheritsTGEProps ? " via TGEProps inheritance" : ""
  console.log(`✅ All ${tgeKeys.length} TGEProps top-level keys are present in ${intrinsic.label}${inheritance}`)
}

console.log(`   (${INTENTIONALLY_OMITTED.size} Box-only intentional omissions: ${[...INTENTIONALLY_OMITTED].join(", ")})`)

if (hasIssues) process.exit(1)
console.log("jsx-runtime.d.ts is in sync with TGEProps.")
