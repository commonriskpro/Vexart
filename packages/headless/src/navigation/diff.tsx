/**
 * Diff — unified diff viewer for Vexart.
 *
 * Renders a unified diff with per-line coloring.
 *
 * @public
 */

import { createMemo, Index, Show, type Accessor } from "solid-js"
import type { JSX } from "solid-js"
import type { SizingUnit } from "@vexart/engine"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

// ── Theme ──

/** @public */
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

export const DIFF_DEFAULTS: DiffTheme = {
  fg: "currentColor",
  muted: "transparent",
  bg: "transparent",
  radius: 0,
  addedBg: "transparent",
  removedBg: "transparent",
  contextBg: "transparent",
  addedSign: "currentColor",
  removedSign: "currentColor",
  lineNumberFg: "transparent",
  lineNumberBg: "transparent",
  headerBg: "transparent",
  headerFg: "currentColor",
  linePadding: 0,
}

// ── Types ──

/** @public */
export type DiffProps = {
  diff: string
  showLineNumbers?: boolean
  width?: SizingUnit
  /** Visual theme — all styling comes from here. */
  theme?: Partial<DiffTheme>
  /** Custom line renderer. */
  children?: (line: DiffLine) => JSX.Element
}

// ── Diff line types ──

/** @public */
export const LINE_TYPE = {
  CONTEXT: "context",
  ADDED: "added",
  REMOVED: "removed",
  HEADER: "header",
} as const

/** @public */
export type LineType = (typeof LINE_TYPE)[keyof typeof LINE_TYPE]

/** @public */
export type DiffLine = {
  type: LineType
  content: string
  oldLineNum: number | null
  newLineNum: number | null
}

// ── Parser & Stats ──

/** @public */
export type DiffStats = {
  added: number
  removed: number
  total: number
}

/** @public */
export function getDiffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === LINE_TYPE.ADDED) added++
    else if (line.type === LINE_TYPE.REMOVED) removed++
  }
  return { added, removed, total: added + removed }
}

/** @public */
export function createDiff(diffText: string | (() => string)): {
  lines: Accessor<DiffLine[]>
  stats: Accessor<DiffStats>
} {
  const textAccessor = typeof diffText === "function" ? diffText : () => diffText
  const lines = createMemo(() => parseDiff(textAccessor()))
  const stats = createMemo(() => getDiffStats(lines()))
  return { lines, stats }
}

/** @public */
export const useDiff = createDiff

/** @public */
export function parseDiff(diff: string): DiffLine[] {
  if (!diff || !diff.trim()) return []
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
      if (oldLine > 0 || newLine > 0) {
        result.push({ type: LINE_TYPE.CONTEXT, content: "", oldLineNum: oldLine, newLineNum: newLine }); oldLine++; newLine++
      }
    }
  }

  return result
}

// ── Component ──

/** @public */
export function Diff(props: DiffProps) {
  const th = () => ({ ...DIFF_DEFAULTS, ...props.theme })
  const showLineNumbers = () => props.showLineNumbers ?? true

  const { lines: diffLines } = createDiff(() => props.diff)

  const maxLineDigits = createMemo(() => {
    const maxLine = diffLines().reduce((max, l) => Math.max(max, l.oldLineNum ?? 0, l.newLineNum ?? 0), 0)
    return String(maxLine).length
  })

  const gutterWidth = () => {
    if (!showLineNumbers()) return 0
    return (maxLineDigits() * 2 + 3) * CHAR_WIDTH
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
      <Index each={diffLines()}>
        {(line) => (
          <Show
            when={!props.children}
            fallback={typeof props.children === "function" ? props.children(line()) : null}
          >
          <Show
            when={line().type === LINE_TYPE.HEADER}
            fallback={
              <box height={LINE_HEIGHT} width="100%" direction="row" backgroundColor={bgForType(line().type)}>
                {showLineNumbers() ? (
                  <box width={gutterWidth()} backgroundColor={th().lineNumberBg} paddingX={4}>
                    <text color={th().lineNumberFg} fontSize={14} whiteSpace="pre-wrap">
                      {(line().oldLineNum !== null ? String(line().oldLineNum).padStart(maxLineDigits()) : " ".repeat(maxLineDigits())) +
                       " " +
                       (line().newLineNum !== null ? String(line().newLineNum).padStart(maxLineDigits()) : " ".repeat(maxLineDigits()))}
                    </text>
                  </box>
                ) : null}
                <box width={CHAR_WIDTH * 2} alignX="center">
                  <Show
                    when={signForType(line().type)}
                    fallback={<text color={th().muted} fontSize={14} whiteSpace="pre-wrap"> </text>}
                  >
                    {(sign) => (
                      <text color={sign().color} fontSize={14} whiteSpace="pre-wrap">{sign().char}</text>
                    )}
                  </Show>
                </box>
                <text color={th().fg} fontSize={14} whiteSpace="pre-wrap">{line().content}</text>
              </box>
            }
          >
            <box height={LINE_HEIGHT} width="100%" direction="row" backgroundColor={bgForType(line().type)} paddingX={th().linePadding}>
              <text color={th().headerFg} fontSize={14} whiteSpace="pre-wrap">{line().content}</text>
            </box>
          </Show>
          </Show>
        )}
      </Index>
    </box>
  )
}
