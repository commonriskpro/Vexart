/**
 * Code — syntax-highlighted code block for TGE.
 *
 * Renders source code with per-token coloring via tree-sitter.
 * Each line is a row of <text> elements with individual colors.
 *
 * Usage:
 *   const style = SyntaxStyle.fromTheme(ONE_DARK)
 *
 *   <Code
 *     content={sourceCode}
 *     language="typescript"
 *     syntaxStyle={style}
 *     width={600}
 *   />
 *
 * The component is ASYNC — it spawns a tree-sitter worker on first render
 * and re-highlights when content or language changes.
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
  radius,
  spacing,
} from "@tge/tokens"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

export type CodeProps = {
  /** Source code string */
  content: string
  /** Language for syntax highlighting (e.g., "typescript", "javascript") */
  language: string
  /** SyntaxStyle for theme colors */
  syntaxStyle: SyntaxStyle
  /** Width in pixels. Default: fit to content. */
  width?: number | string
  /** Height in pixels. Default: fit to content. */
  height?: number | string
  /** Background color. Default: surface.context */
  backgroundColor?: string | number
  /** Corner radius. Default: radius.md */
  cornerRadius?: number
  /** Padding. Default: spacing.md */
  padding?: number
  /** Show line numbers. Default: false */
  lineNumbers?: boolean
  /** Streaming mode — debounces highlighting for rapid content updates (e.g. AI responses). */
  streaming?: boolean
}

export function Code(props: CodeProps) {
  const [tokens, setTokens] = createSignal<Token[][]>([])
  const [ready, setReady] = createSignal(false)

  const defaultColor = () => props.syntaxStyle.getDefaultColor()
  const bg = () => props.backgroundColor ?? surface.context
  const cr = () => props.cornerRadius ?? radius.md
  const pad = () => props.padding ?? spacing.md
  const showLineNumbers = () => props.lineNumbers ?? false

  // Highlight content asynchronously via worker
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  createEffect(() => {
    const content = props.content
    const language = props.language
    const style = props.syntaxStyle
    const isStreaming = props.streaming ?? false

    // Immediate fallback — show unhighlighted text
    const fallback = content.split("\n").map((line) => [{ text: line, color: style.getDefaultColor() }])
    setTokens(fallback)
    setReady(true)

    // Async highlight — debounced in streaming mode
    let cancelled = false
    const doHighlight = () => {
      const client = getTreeSitterClient()
      client.highlightOnce(content, language).then((highlights) => {
        if (cancelled) return
        const result = highlightsToTokens(content, highlights, style)
        setTokens(result)
        markDirty()
      })
    }

    if (isStreaming) {
      // Debounce: only highlight when content stops changing for 150ms
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

  // Line number gutter width
  const gutterWidth = () => {
    if (!showLineNumbers()) return 0
    const digits = String(tokens().length).length
    return (digits + 1) * CHAR_WIDTH
  }

  return (
    <box
      width={props.width ?? "fit"}
      height={props.height ?? "fit"}
      backgroundColor={bg()}
      cornerRadius={cr()}
      padding={pad()}
      direction="column"
    >
      {tokens().map((lineTokens, lineIdx) => (
        <box height={LINE_HEIGHT} width="100%">
          {/* Line number */}
          {showLineNumbers() ? (
            <box width={gutterWidth()}>
              <text color={0x555555ff} fontSize={14}>
                {String(lineIdx + 1).padStart(String(tokens().length).length)}
              </text>
            </box>
          ) : null}

          {/* Colored tokens */}
          {lineTokens.map((tok) => (
            <text color={tok.color} fontSize={14}>{tok.text}</text>
          ))}
        </box>
      ))}
    </box>
  )
}
