/**
 * Code — syntax-highlighted code block for Vexart.
 *
 * Renders source code with pluggable token coloring (via optional Highlighter).
 *
 * @public
 */

import { createSignal, createComputed, createMemo, onCleanup, Index, type Accessor } from "solid-js"
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

/** @public */
export const CODE_DEFAULTS: CodeTheme = {
  bg: "transparent",
  fg: "currentColor",
  lineNumberFg: "currentColor",
  radius: 0,
  padding: 0,
}

// ── Reactive Helper ──

/**
 * Options for `createCode` reactive helper.
 *
 * @public
 */
export type CreateCodeOptions = {
  content: string | (() => string)
  language?: string | (() => string | undefined)
  highlighter?: Highlighter | (() => Highlighter | undefined)
  defaultFg?: string | number | (() => string | number)
  streaming?: boolean | (() => boolean | undefined)
}

/**
 * Result of `createCode` reactive helper.
 *
 * @public
 */
export type CreateCodeResult = {
  tokens: Accessor<HighlightToken[][]>
  lineCount: Accessor<number>
}

/**
 * Reactive syntax highlighting helper.
 *
 * Accepts source code options and returns reactive line tokens and line count.
 * Handles synchronous and asynchronous highlighters, streaming debouncing,
 * and fallback token generation.
 *
 * @public
 */
export function createCode(
  options: CreateCodeOptions | string | (() => string),
): CreateCodeResult {
  const opts: CreateCodeOptions =
    typeof options === "string" || typeof options === "function"
      ? { content: options }
      : options

  const getContent = (): string => {
    if (typeof opts.content === "function") {
      const res = opts.content()
      return typeof res === "string" ? res : ""
    }
    return typeof opts.content === "string" ? opts.content : ""
  }
  const getLanguage = (): string | undefined => {
    if (typeof opts.language === "function") return opts.language()
    return opts.language
  }
  const getHighlighter = (): Highlighter | undefined => {
    if (typeof opts.highlighter !== "function") return undefined
    if (opts.highlighter.length === 0) {
      const res = (opts.highlighter as () => unknown)()
      if (typeof res === "function") return res as Highlighter
      return undefined
    }
    return opts.highlighter as Highlighter
  }
  const getDefaultFg = (): string | number => {
    if (typeof opts.defaultFg === "function") return opts.defaultFg()
    return opts.defaultFg ?? "currentColor"
  }
  const getStreaming = (): boolean => {
    if (typeof opts.streaming === "function") return !!opts.streaming()
    return !!opts.streaming
  }

  const getFallback = (): HighlightToken[][] => {
    const content = getContent() ?? ""
    const defaultFg = getDefaultFg()
    return content.split("\n").map((line) => [{ text: line, color: defaultFg }])
  }

  const getInitialTokens = (): HighlightToken[][] => {
    const highlighter = getHighlighter()
    const content = getContent() ?? ""
    const language = getLanguage()
    if (highlighter) {
      try {
        const res = highlighter(content, language)
        if (Array.isArray(res)) return res
      } catch {
        // Fall back
      }
    }
    return getFallback()
  }

  const [tokens, setTokens] = createSignal<HighlightToken[][]>(getInitialTokens())

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  createComputed(() => {
    const content = getContent() ?? ""
    const language = getLanguage()
    const highlighter = getHighlighter()
    const isStreaming = getStreaming()
    const defaultFg = getDefaultFg()

    const fallback: HighlightToken[][] = content.split("\n").map((line) => [{ text: line, color: defaultFg }])

    if (!highlighter) {
      setTokens(fallback)
      return
    }

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
      setTokens(fallback)
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

  const lineCount = createMemo(() => tokens().length)

  return { tokens, lineCount }
}

/** @public */
export const useCodeTokens = createCode

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
  const { tokens } = createCode({
    content: () => props.content,
    language: () => props.language,
    highlighter: () => props.highlighter,
    defaultFg: () => t().fg,
    streaming: () => props.streaming,
  })

  const showLineNumbers = () => props.lineNumbers ?? false

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
      <Index each={tokens()}>
        {(lineTokens, lineIdx) => (
          <box height={LINE_HEIGHT} width="100%" direction="row">
            {showLineNumbers() ? (
              <box width={gutterWidth()}>
                <text color={t().lineNumberFg} fontSize={14} whiteSpace="pre-wrap">
                  {String(lineIdx + 1).padStart(String(tokens().length).length)}
                </text>
              </box>
            ) : null}
            <Index each={lineTokens()}>
              {(tok) => (
                <text color={tok().color} fontSize={14} whiteSpace="pre-wrap">{tok().text}</text>
              )}
            </Index>
          </box>
        )}
      </Index>
    </box>
  )
}
