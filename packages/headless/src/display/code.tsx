/**
 * Code — syntax-highlighted code block for Vexart.
 *
 * Renders source code with tree-sitter token coloring.
 *
 * @public
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import {
  getTreeSitterClient,
  highlightsToTokens,
  type SyntaxStyle,
  type Token,
} from "@vexart/engine"
import { markDirty } from "@vexart/engine"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

// ── Theme ──

/** @public */
export type CodeTheme = {
  /** Background color. */
  bg: string | number
  /** Line number foreground color. */
  lineNumberFg: string | number
  /** Corner radius. */
  radius: number
  /** Inner padding. */
  padding: number
}

const CODE_DEFAULTS: CodeTheme = {
  bg: 0x1a1a2eff,
  lineNumberFg: 0x555555ff,
  radius: 4,
  padding: 8,
}

// ── Types ──

/** @public */
export type CodeProps = {
  content: string
  language: string
  syntaxStyle: SyntaxStyle
  width?: number | string
  height?: number | string
  /** Visual theme — all styling comes from here. */
  theme?: Partial<CodeTheme>
  lineNumbers?: boolean
  streaming?: boolean
}

/** @public */
export function Code(props: CodeProps) {
  const t = () => ({ ...CODE_DEFAULTS, ...props.theme })
  const [tokens, setTokens] = createSignal<Token[][]>([])
  const [ready, setReady] = createSignal(false)

  const showLineNumbers = () => props.lineNumbers ?? false

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  createEffect(() => {
    const content = props.content
    const language = props.language
    const style = props.syntaxStyle
    const isStreaming = props.streaming ?? false

    const fallback = content.split("\n").map((line) => [{ text: line, color: style.getDefaultColor() }])
    setTokens(fallback)
    setReady(true)

    let cancelled = false
    const doHighlight = () => {
      const client = getTreeSitterClient()
      client.highlightOnce(content, language).then((highlights) => {
        if (cancelled) return
        setTokens(highlightsToTokens(content, highlights, style))
        markDirty()
      })
    }

    if (isStreaming) {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(doHighlight, 150)
    } else {
      doHighlight()
    }

    onCleanup(() => {
      cancelled = true
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
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
        <box height={LINE_HEIGHT} width="100%">
          {showLineNumbers() ? (
            <box width={gutterWidth()}>
              <text color={t().lineNumberFg} fontSize={14}>
                {String(lineIdx + 1).padStart(String(tokens().length).length)}
              </text>
            </box>
          ) : null}
          {lineTokens.map((tok) => (
            <text color={tok.color} fontSize={14}>{tok.text}</text>
          ))}
        </box>
      ))}
    </box>
  )
}
