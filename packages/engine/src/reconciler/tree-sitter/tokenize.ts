/**
 * Tokenize — convert SimpleHighlight[] into colored Token[][] (per line).
 *
 * Implements a boundary-sweep algorithm (same as opentui's treeSitterToTextChunks):
 *   1. Collect all highlight start/end positions as boundaries
 *   2. Sort by offset (ends before starts at same position)
 *   3. Walk boundaries, maintaining active highlight set
 *   4. For each text segment, resolve highest-specificity group → color
 *
 * Output: Token[][] — outer array = lines, inner array = tokens.
 * Each token has text + color (packed RGBA u32).
 *
 * Usage:
 *   const highlights = await client.highlightOnce(code, "typescript")
 *   const tokens = highlightsToTokens(code, highlights, syntaxStyle)
 *   // tokens[0] = [{ text: "const", color: 0xc678ddff }, { text: " x ", color: 0xe0e0e0ff }, ...]
 */

import type { SimpleHighlight } from "./types"
import type { SyntaxStyle } from "./syntax-style"

/** @public */
export type Token = {
  text: string
  color: number
}

type Boundary = {
  offset: number
  type: "start" | "end"
  index: number
}

function specificity(group: string): number {
  return group.split(".").length
}

/**
 * Convert tree-sitter highlights to per-line colored tokens.
 *
 * @public
 * @param source - Full source text.
 * @param highlights - Highlight ranges from the worker.
 * @param style - Scope-to-color style mapping.
 * @returns One token array per line.
 */
export function highlightsToTokens(
  source: string,
  highlights: SimpleHighlight[],
  style: SyntaxStyle,
): Token[][] {
  const lines = source.split("\n")
  const defaultColor = style.getDefaultColor()

  // No highlights — return each line as a single default token
  if (highlights.length === 0) {
    return lines.map((line) => [{ text: line, color: defaultColor }])
  }

  // Build boundaries
  const boundaries: Boundary[] = []
  for (let i = 0; i < highlights.length; i++) {
    const [start, end] = highlights[i]
    if (start === end) continue
    boundaries.push({ offset: start, type: "start", index: i })
    boundaries.push({ offset: end, type: "end", index: i })
  }

  // Sort: by offset, ends before starts at same position
  boundaries.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset
    if (a.type === "end" && b.type === "start") return -1
    if (a.type === "start" && b.type === "end") return 1
    return 0
  })

  // Sweep and build flat token array
  const flatTokens: Token[] = []
  const active = new Set<number>()
  let pos = 0

  for (const boundary of boundaries) {
    // Emit text between pos and boundary
    if (pos < boundary.offset) {
      const text = source.slice(pos, boundary.offset)
      if (text.length > 0) {
        if (active.size === 0) {
          flatTokens.push({ text, color: defaultColor })
        } else {
          // Find highest specificity active group
          let bestGroup = ""
          let bestSpec = -1
          for (const idx of active) {
            const group = highlights[idx][2]
            const spec = specificity(group)
            if (spec > bestSpec) {
              bestSpec = spec
              bestGroup = group
            }
          }
          flatTokens.push({ text, color: style.colorFor(bestGroup) })
        }
      }
    }

    // Update active set
    if (boundary.type === "start") {
      active.add(boundary.index)
    } else {
      active.delete(boundary.index)
    }
    pos = boundary.offset
  }

  // Trailing text after last boundary
  if (pos < source.length) {
    flatTokens.push({ text: source.slice(pos), color: defaultColor })
  }

  // Split flat tokens into per-line arrays
  const result: Token[][] = lines.map(() => [])
  let lineIdx = 0
  let lineCol = 0

  for (const token of flatTokens) {
    const parts = token.text.split("\n")

    for (let p = 0; p < parts.length; p++) {
      if (p > 0) {
        // Newline — advance to next line
        lineIdx++
        lineCol = 0
      }

      const part = parts[p]
      if (part.length > 0 && lineIdx < result.length) {
        result[lineIdx].push({ text: part, color: token.color })
        lineCol += part.length
      }
    }
  }

  // Ensure empty lines have at least one token
  for (let i = 0; i < result.length; i++) {
    if (result[i].length === 0) {
      result[i] = [{ text: "", color: defaultColor }]
    }
  }

  return result
}
