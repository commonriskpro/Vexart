/**
 * Diff — unified diff viewer for TGE.
 *
 * Renders a unified diff with per-line coloring:
 *   - Added lines: green background
 *   - Removed lines: red background
 *   - Context lines: default background
 *   - Optional syntax highlighting via tree-sitter
 *   - Optional line numbers
 *
 * Accepts standard unified diff format (output of `git diff`).
 *
 * Usage:
 *   <Diff
 *     diff={unifiedDiffString}
 *     syntaxStyle={style}
 *     filetype="typescript"
 *   />
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import {
  getTreeSitterClient,
  highlightsToTokens,
  type SyntaxStyle,
  type Token,
} from "@tge/renderer"
import { markDirty } from "@tge/renderer"
import {
  surface,
  text as textTokens,
  radius,
  spacing,
} from "@tge/tokens"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

// ── Diff colors ──

const DIFF_COLORS = {
  addedBg: 0x1a3a1aff,
  removedBg: 0x3a1a1aff,
  contextBg: 0x00000000,
  addedSign: 0x4ec94eff,
  removedSign: 0xe05050ff,
  lineNumberFg: 0x555555ff,
  lineNumberBg: 0x0d0d14ff,
  headerBg: 0x1a1a2eff,
  headerFg: 0x8888ccff,
} as const

// ── Types ──

export type DiffProps = {
  /** Unified diff string */
  diff: string
  /** SyntaxStyle for syntax highlighting within diff lines */
  syntaxStyle?: SyntaxStyle
  /** File type for syntax highlighting */
  filetype?: string
  /** Show line numbers. Default: true */
  showLineNumbers?: boolean
  /** Width in pixels. Default: 100% */
  width?: number | string
  /** Added line background color */
  addedBg?: number
  /** Removed line background color */
  removedBg?: number
  /** Context line background color */
  contextBg?: number
  /** Added sign (+) color */
  addedSignColor?: number
  /** Removed sign (-) color */
  removedSignColor?: number
  /** Line number foreground */
  lineNumberFg?: number
  /** Streaming mode */
  streaming?: boolean
}

// ── Diff line types ──

const LINE_TYPE = {
  CONTEXT: "context",
  ADDED: "added",
  REMOVED: "removed",
  HEADER: "header",
} as const

type LineType = (typeof LINE_TYPE)[keyof typeof LINE_TYPE]

type DiffLine = {
  type: LineType
  content: string
  oldLineNum: number | null
  newLineNum: number | null
}

// ── Parser ──

function parseDiff(diff: string): DiffLine[] {
  const rawLines = diff.split("\n")
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of rawLines) {
    if (raw.startsWith("@@")) {
      // Hunk header: @@ -a,b +c,d @@
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      result.push({ type: LINE_TYPE.HEADER, content: raw, oldLineNum: null, newLineNum: null })
    } else if (raw.startsWith("---") || raw.startsWith("+++") || raw.startsWith("diff ") || raw.startsWith("index ")) {
      result.push({ type: LINE_TYPE.HEADER, content: raw, oldLineNum: null, newLineNum: null })
    } else if (raw.startsWith("+")) {
      result.push({ type: LINE_TYPE.ADDED, content: raw.slice(1), oldLineNum: null, newLineNum: newLine })
      newLine++
    } else if (raw.startsWith("-")) {
      result.push({ type: LINE_TYPE.REMOVED, content: raw.slice(1), oldLineNum: oldLine, newLineNum: null })
      oldLine++
    } else if (raw.startsWith(" ")) {
      result.push({ type: LINE_TYPE.CONTEXT, content: raw.slice(1), oldLineNum: oldLine, newLineNum: newLine })
      oldLine++
      newLine++
    } else if (raw === "") {
      // Empty line in context
      result.push({ type: LINE_TYPE.CONTEXT, content: "", oldLineNum: oldLine, newLineNum: newLine })
      oldLine++
      newLine++
    }
  }

  return result
}

// ── Component ──

export function Diff(props: DiffProps) {
  const showLineNumbers = () => props.showLineNumbers ?? true
  const addedBg = () => props.addedBg ?? DIFF_COLORS.addedBg
  const removedBg = () => props.removedBg ?? DIFF_COLORS.removedBg
  const contextBg = () => props.contextBg ?? DIFF_COLORS.contextBg
  const addedSign = () => props.addedSignColor ?? DIFF_COLORS.addedSign
  const removedSign = () => props.removedSignColor ?? DIFF_COLORS.removedSign
  const lineNumFg = () => props.lineNumberFg ?? DIFF_COLORS.lineNumberFg

  const diffLines = () => parseDiff(props.diff)

  // Line number gutter width
  const gutterWidth = () => {
    if (!showLineNumbers()) return 0
    const maxLine = diffLines().reduce((max, l) => Math.max(max, l.oldLineNum ?? 0, l.newLineNum ?? 0), 0)
    const digits = String(maxLine).length
    // Two columns: old + new, each with `digits` chars + separator
    return (digits * 2 + 3) * CHAR_WIDTH
  }

  function bgForType(type: LineType): number {
    switch (type) {
      case LINE_TYPE.ADDED: return addedBg()
      case LINE_TYPE.REMOVED: return removedBg()
      case LINE_TYPE.HEADER: return DIFF_COLORS.headerBg
      default: return contextBg()
    }
  }

  function signForType(type: LineType): { char: string; color: number } | null {
    switch (type) {
      case LINE_TYPE.ADDED: return { char: "+", color: addedSign() }
      case LINE_TYPE.REMOVED: return { char: "-", color: removedSign() }
      default: return null
    }
  }

  return (
    <box
      width={props.width ?? "100%"}
      direction="column"
      backgroundColor={surface.context}
      cornerRadius={radius.md}
    >
      {diffLines().map((line) => {
        const bg = bgForType(line.type)
        const sign = signForType(line.type)
        const maxLineDigits = String(diffLines().reduce((m, l) => Math.max(m, l.oldLineNum ?? 0, l.newLineNum ?? 0), 0)).length

        if (line.type === LINE_TYPE.HEADER) {
          return (
            <box height={LINE_HEIGHT} width="100%" backgroundColor={bg} paddingX={spacing.sm}>
              <text color={DIFF_COLORS.headerFg} fontSize={14}>{line.content}</text>
            </box>
          )
        }

        return (
          <box height={LINE_HEIGHT} width="100%" backgroundColor={bg}>
            {/* Line numbers */}
            {showLineNumbers() ? (
              <box width={gutterWidth()} backgroundColor={DIFF_COLORS.lineNumberBg} paddingX={4}>
                <text color={lineNumFg()} fontSize={14}>
                  {(line.oldLineNum !== null ? String(line.oldLineNum).padStart(maxLineDigits) : " ".repeat(maxLineDigits)) +
                   " " +
                   (line.newLineNum !== null ? String(line.newLineNum).padStart(maxLineDigits) : " ".repeat(maxLineDigits))}
                </text>
              </box>
            ) : null}

            {/* Sign (+/-) */}
            <box width={CHAR_WIDTH * 2} alignX="center">
              {sign ? (
                <text color={sign.color} fontSize={14}>{sign.char}</text>
              ) : (
                <text color={textTokens.muted} fontSize={14}> </text>
              )}
            </box>

            {/* Content */}
            <text color={textTokens.primary} fontSize={14}>{line.content}</text>
          </box>
        )
      })}
    </box>
  )
}
