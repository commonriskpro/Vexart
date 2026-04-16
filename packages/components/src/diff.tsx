/**
 * Diff — unified diff viewer for TGE.
 *
 * Renders a unified diff with per-line coloring.
 *
 * Truly headless: all visual properties come from the `theme` prop.
 * Use @tge/void VoidDiff for a styled version.
 *
 * Usage:
 *   <Diff
 *     diff={unifiedDiffString}
 *     syntaxStyle={style}
 *     filetype="typescript"
 *     theme={{
 *       fg: 0xe0e0e0ff, muted: 0x888888ff,
 *       addedBg: 0x1a3a1aff, removedBg: 0x3a1a1aff,
 *       addedSign: 0x4ec94eff, removedSign: 0xe05050ff,
 *       bg: 0x1a1a2eff, radius: 4,
 *     }}
 *   />
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import {
  getTreeSitterClient,
  highlightsToTokens,
  type SyntaxStyle,
  type Token,
} from "@tge/renderer-solid"
import { markDirty } from "@tge/renderer-solid"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

// ── Theme ──

export type DiffTheme = {
  /** Default text color. */
  fg: string | number
  /** Muted text color (empty sign column). */
  muted: string | number
  /** Container background. */
  bg: string | number
  /** Container corner radius. */
  radius: number
  /** Added line background. */
  addedBg: string | number
  /** Removed line background. */
  removedBg: string | number
  /** Context line background. */
  contextBg: string | number
  /** Added sign (+) color. */
  addedSign: string | number
  /** Removed sign (-) color. */
  removedSign: string | number
  /** Line number foreground. */
  lineNumberFg: string | number
  /** Line number background. */
  lineNumberBg: string | number
  /** Hunk header background. */
  headerBg: string | number
  /** Hunk header foreground. */
  headerFg: string | number
  /** Horizontal padding for lines. */
  linePadding: number
}

const DIFF_DEFAULTS: DiffTheme = {
  fg: 0xe0e0e0ff,
  muted: 0x888888ff,
  bg: 0x1a1a2eff,
  radius: 4,
  addedBg: 0x1a3a1aff,
  removedBg: 0x3a1a1aff,
  contextBg: 0x00000000,
  addedSign: 0x4ec94eff,
  removedSign: 0xe05050ff,
  lineNumberFg: 0x555555ff,
  lineNumberBg: 0x0d0d14ff,
  headerBg: 0x1a1a2eff,
  headerFg: 0x8888ccff,
  linePadding: 4,
}

// ── Types ──

export type DiffProps = {
  diff: string
  syntaxStyle?: SyntaxStyle
  filetype?: string
  showLineNumbers?: boolean
  width?: number | string
  streaming?: boolean
  /** Visual theme — all styling comes from here. */
  theme?: Partial<DiffTheme>
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
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) { oldLine = parseInt(match[1], 10); newLine = parseInt(match[2], 10) }
      result.push({ type: LINE_TYPE.HEADER, content: raw, oldLineNum: null, newLineNum: null })
    } else if (raw.startsWith("---") || raw.startsWith("+++") || raw.startsWith("diff ") || raw.startsWith("index ")) {
      result.push({ type: LINE_TYPE.HEADER, content: raw, oldLineNum: null, newLineNum: null })
    } else if (raw.startsWith("+")) {
      result.push({ type: LINE_TYPE.ADDED, content: raw.slice(1), oldLineNum: null, newLineNum: newLine }); newLine++
    } else if (raw.startsWith("-")) {
      result.push({ type: LINE_TYPE.REMOVED, content: raw.slice(1), oldLineNum: oldLine, newLineNum: null }); oldLine++
    } else if (raw.startsWith(" ")) {
      result.push({ type: LINE_TYPE.CONTEXT, content: raw.slice(1), oldLineNum: oldLine, newLineNum: newLine }); oldLine++; newLine++
    } else if (raw === "") {
      result.push({ type: LINE_TYPE.CONTEXT, content: "", oldLineNum: oldLine, newLineNum: newLine }); oldLine++; newLine++
    }
  }

  return result
}

// ── Component ──

export function Diff(props: DiffProps) {
  const th = () => ({ ...DIFF_DEFAULTS, ...props.theme })
  const showLineNumbers = () => props.showLineNumbers ?? true

  const diffLines = () => parseDiff(props.diff)

  const gutterWidth = () => {
    if (!showLineNumbers()) return 0
    const maxLine = diffLines().reduce((max, l) => Math.max(max, l.oldLineNum ?? 0, l.newLineNum ?? 0), 0)
    const digits = String(maxLine).length
    return (digits * 2 + 3) * CHAR_WIDTH
  }

  function bgForType(type: LineType): string | number {
    const t = th()
    switch (type) {
      case LINE_TYPE.ADDED: return t.addedBg
      case LINE_TYPE.REMOVED: return t.removedBg
      case LINE_TYPE.HEADER: return t.headerBg
      default: return t.contextBg
    }
  }

  function signForType(type: LineType): { char: string; color: string | number } | null {
    const t = th()
    switch (type) {
      case LINE_TYPE.ADDED: return { char: "+", color: t.addedSign }
      case LINE_TYPE.REMOVED: return { char: "-", color: t.removedSign }
      default: return null
    }
  }

  return (
    <box
      width={props.width ?? "100%"}
      direction="column"
      backgroundColor={th().bg}
      cornerRadius={th().radius}
    >
      {diffLines().map((line) => {
        const t = th()
        const bg = bgForType(line.type)
        const sign = signForType(line.type)
        const maxLineDigits = String(diffLines().reduce((m, l) => Math.max(m, l.oldLineNum ?? 0, l.newLineNum ?? 0), 0)).length

        if (line.type === LINE_TYPE.HEADER) {
          return (
            <box height={LINE_HEIGHT} width="100%" backgroundColor={bg} paddingX={t.linePadding}>
              <text color={t.headerFg} fontSize={14}>{line.content}</text>
            </box>
          )
        }

        return (
          <box height={LINE_HEIGHT} width="100%" backgroundColor={bg}>
            {showLineNumbers() ? (
              <box width={gutterWidth()} backgroundColor={t.lineNumberBg} paddingX={4}>
                <text color={t.lineNumberFg} fontSize={14}>
                  {(line.oldLineNum !== null ? String(line.oldLineNum).padStart(maxLineDigits) : " ".repeat(maxLineDigits)) +
                   " " +
                   (line.newLineNum !== null ? String(line.newLineNum).padStart(maxLineDigits) : " ".repeat(maxLineDigits))}
                </text>
              </box>
            ) : null}
            <box width={CHAR_WIDTH * 2} alignX="center">
              {sign ? (
                <text color={sign.color} fontSize={14}>{sign.char}</text>
              ) : (
                <text color={t.muted} fontSize={14}> </text>
              )}
            </box>
            <text color={t.fg} fontSize={14}>{line.content}</text>
          </box>
        )
      })}
    </box>
  )
}
