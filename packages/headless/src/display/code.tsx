/**
 * Code — syntax-highlighted code block for Vexart.
 *
 * Renders source code with pluggable token coloring (via optional Highlighter).
 *
 * @public
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import type { SizingUnit } from "@vexart/engine"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

// ── Types ──

/**
 * Individual token with text and color for syntax highlighting.
 *
 * @public
 */
export type HighlightToken = {
  text: string
  color: string | number
}

/**
 * Backward compatibility alias for HighlightToken.
 *
 * @public
 */
export type Token = HighlightToken

/**
 * Pluggable syntax highlighting function.
 *
 * Accepts source code and an optional language identifier, and returns an array
 * of lines where each line is an array of HighlightTokens (or a Promise resolving to it).
 *
 * @public
 */
export type Highlighter = (
  content: string,
  language?: string,
) => Promise<HighlightToken[][]> | HighlightToken[][]

// ── Theme ──

/** @public */
export type CodeTheme = {
  /** Background color. */
  bg: string | number
  /** Default text foreground color. */
  fg: string | number
  /** Line number foreground color. */
  lineNumberFg: string | number
  /** Corner radius. */
  radius: number
  /** Inner padding. */
  padding: number
}

const CODE_DEFAULTS: CodeTheme = {
  bg: 0x1a1a2eff,
  fg: 0xe0e0e0ff,
  lineNumberFg: 0x555555ff,
  radius: 4,
  padding: 8,
}

// ── Component Props ──

/** @public */
export type CodeProps = {
  content: string
  language?: string
  /** Pluggable syntax highlighter. When omitted, renders plain monospaced lines. */
  highlighter?: Highlighter
  width?: SizingUnit
  height?: SizingUnit
  /** Visual theme — all styling comes from here. */
  theme?: Partial<CodeTheme>
  lineNumbers?: boolean
  streaming?: boolean
}

/** @public */
export function Code(props: CodeProps) {
  const t = () => ({ ...CODE_DEFAULTS, ...props.theme })
  const [tokens, setTokens] = createSignal<HighlightToken[][]>([])

  const showLineNumbers = () => props.lineNumbers ?? false

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  createEffect(() => {
    const content = props.content
    const language = props.language
    const highlighter = props.highlighter
    const isStreaming = props.streaming ?? false

    const defaultFg = t().fg
    const fallback: HighlightToken[][] = content.split("\n").map((line) => [{ text: line, color: defaultFg }])

    if (!highlighter) {
      setTokens(fallback)
      return
    }

    // Set immediate fallback so content is visible right away
    setTokens(fallback)

    let cancelled = false
    const doHighlight = () => {
      try {
        const res = highlighter(content, language)
        if (res instanceof Promise) {
          res.then(
            (result) => {
              if (!cancelled && Array.isArray(result)) {
                setTokens(result)
              }
            },
            () => {
              // On error, keep fallback
            },
          )
        } else if (Array.isArray(res)) {
          if (!cancelled) {
            setTokens(res)
          }
        }
      } catch {
        // On error, keep fallback
      }
    }

    if (isStreaming) {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(doHighlight, 150)
    } else {
      doHighlight()
    }

    onCleanup(() => {
      cancelled = true
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    })
  })

  const gutterWidth = () => {
    if (!showLineNumbers()) return 0
    const digits = String(tokens().length).length
    return (digits + 1) * CHAR_WIDTH
  }

  return (
    <box
      width={props.width ?? "fit"}
      height={props.height ?? "fit"}
      backgroundColor={t().bg}
      cornerRadius={t().radius}
      padding={t().padding}
      direction="column"
    >
      {tokens().map((lineTokens, lineIdx) => (
        <box height={LINE_HEIGHT} width="100%" direction="row">
          {showLineNumbers() ? (
            <box width={gutterWidth()}>
              <text color={t().lineNumberFg} fontSize={14} whiteSpace="pre-wrap">
                {String(lineIdx + 1).padStart(String(tokens().length).length)}
              </text>
            </box>
          ) : null}
          {lineTokens.map((tok) => (
            <text color={tok.color} fontSize={14} whiteSpace="pre-wrap">{tok.text}</text>
          ))}
        </box>
      ))}
    </box>
  )
}
