/**
 * Markdown — renders markdown content as TGE components.
 *
 * Uses `marked` (Lexer) to tokenize markdown, then maps tokens
 * to TGE JSX elements with full inline styling:
 *   - Headings → <text> with larger font / bold color
 *   - Paragraphs → inline spans with bold/italic/code colors
 *   - Code blocks → <Code> with syntax highlighting
 *   - Lists → indented <text> with bullet/number prefix
 *   - Blockquotes → indented <box> with left border
 *   - Horizontal rules → <box> with border
 *   - Links → <text> with link color
 *   - Bold → brighter text color
 *   - Italic → accent color
 *   - Code spans → surface background + monospace color
 *   - Strikethrough → muted color
 *
 * Usage:
 *   const style = SyntaxStyle.fromTheme(ONE_DARK)
 *
 *   <Markdown
 *     content={markdownString}
 *     syntaxStyle={style}
 *   />
 */

import type { JSX } from "solid-js"
import { Lexer, type MarkedToken, type Tokens } from "marked"
import { type SyntaxStyle } from "@tge/renderer"
import { Code } from "./code"
import {
  accent,
  text as textTokens,
  surface,
  radius,
  spacing,
} from "@tge/tokens"

const LINE_HEIGHT = 17

// ── Inline style colors ──

const INLINE_STYLE = {
  bold: 0xffffffff,         // White — stands out from primary gray
  italic: 0xc0a0e0ff,       // Soft purple — distinct but readable
  code: 0xe5c07bff,         // Yellow/amber — like syntax tokens
  codeBg: 0x2c313aff,       // Dark bg for inline code
  link: 0x61afefff,         // Blue — standard link color
  del: 0x666666ff,          // Dim — struck through text
} as const

// ── Types ──

export type MarkdownProps = {
  /** Markdown string to render */
  content: string
  /** SyntaxStyle for code blocks */
  syntaxStyle: SyntaxStyle
  /** Default text color */
  color?: number
  /** Width. Default: 100% */
  width?: number | string
  /** Streaming mode — re-parses on every content change. When false, memoizes parsed tokens. */
  streaming?: boolean
}

// ── Inline span type ──

type InlineSpan = {
  text: string
  color: number
  bg?: number
}

// ── Inline text parsing ──

/**
 * Flatten inline tokens to plain text (used for headings, lists).
 */
function inlineToText(tokens: MarkedToken[] | undefined): string {
  if (!tokens) return ""
  let result = ""
  for (const tok of tokens) {
    switch (tok.type) {
      case "text":
        result += tok.text
        break
      case "strong":
        result += inlineToText(tok.tokens as MarkedToken[])
        break
      case "em":
        result += inlineToText(tok.tokens as MarkedToken[])
        break
      case "codespan":
        result += tok.text
        break
      case "link":
        result += inlineToText(tok.tokens as MarkedToken[])
        break
      case "br":
        result += "\n"
        break
      case "del":
        result += inlineToText(tok.tokens as MarkedToken[])
        break
      case "escape":
        result += tok.text
        break
      default:
        if ("text" in tok) result += (tok as any).text
        break
    }
  }
  return result
}

/**
 * Convert inline tokens to styled spans.
 * Each span has its own color (and optional bg for code).
 * Bold → bright white, Italic → purple, Code → yellow on dark bg,
 * Links → blue, Strikethrough → dim gray.
 */
function inlineToSpans(tokens: MarkedToken[] | undefined, baseColor: number): InlineSpan[] {
  if (!tokens) return []
  const spans: InlineSpan[] = []
  for (const tok of tokens) {
    switch (tok.type) {
      case "text":
        spans.push({ text: tok.text, color: baseColor })
        break
      case "strong":
        spans.push(...inlineToSpans(tok.tokens as MarkedToken[], INLINE_STYLE.bold))
        break
      case "em":
        spans.push(...inlineToSpans(tok.tokens as MarkedToken[], INLINE_STYLE.italic))
        break
      case "codespan":
        spans.push({ text: ` ${tok.text} `, color: INLINE_STYLE.code, bg: INLINE_STYLE.codeBg })
        break
      case "link":
        spans.push(...inlineToSpans(tok.tokens as MarkedToken[], INLINE_STYLE.link))
        break
      case "br":
        spans.push({ text: "\n", color: baseColor })
        break
      case "del":
        spans.push(...inlineToSpans(tok.tokens as MarkedToken[], INLINE_STYLE.del))
        break
      case "escape":
        spans.push({ text: tok.text, color: baseColor })
        break
      default:
        if ("text" in tok) spans.push({ text: (tok as any).text, color: baseColor })
        break
    }
  }
  return spans
}

/**
 * Render inline spans as JSX elements.
 * Each span becomes a <text> with its own color.
 * Code spans get a background box wrapper.
 */
function renderInlineSpans(spans: InlineSpan[]): JSX.Element {
  return spans.map((span) => {
    if (span.bg) {
      return (
        <box backgroundColor={span.bg} cornerRadius={3} paddingX={2}>
          <text color={span.color} fontSize={14}>{span.text}</text>
        </box>
      )
    }
    return <text color={span.color} fontSize={14}>{span.text}</text>
  }) as unknown as JSX.Element
}

/** Resolve language from info string (e.g., "typescript" from "```typescript") */
function resolveLanguage(lang: string | undefined): string {
  if (!lang) return "plaintext"
  const aliases: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    md: "markdown",
    py: "python",
    rb: "ruby",
    sh: "bash",
    yml: "yaml",
    json: "javascript", // good enough for highlighting
  }
  return aliases[lang.toLowerCase()] ?? lang.toLowerCase()
}

// ── Token renderers ──

function renderToken(
  token: MarkedToken,
  props: MarkdownProps,
  index: number,
): JSX.Element {
  const color = props.color ?? textTokens.primary

  switch (token.type) {
    case "heading": {
      const sizes = [20, 18, 16, 15, 14, 14]
      const fontSize = sizes[Math.min(token.depth - 1, 5)]
      const headingColor = accent.thread
      const spans = inlineToSpans(token.tokens as MarkedToken[], headingColor)
      return (
        <box width="100%" paddingY={4} direction="row">
          {spans.map((span) => {
            if (span.bg) {
              return (
                <box backgroundColor={span.bg} cornerRadius={3} paddingX={2}>
                  <text color={span.color} fontSize={fontSize}>{span.text}</text>
                </box>
              )
            }
            return <text color={span.color} fontSize={fontSize}>{span.text}</text>
          })}
        </box>
      )
    }

    case "paragraph": {
      const spans = inlineToSpans(token.tokens as MarkedToken[], color)
      return (
        <box width="100%" direction="row">
          {renderInlineSpans(spans)}
        </box>
      )
    }

    case "code": {
      const lang = resolveLanguage(token.lang)
      return (
        <box width="100%" paddingY={4}>
          <Code
            content={token.text}
            language={lang}
            syntaxStyle={props.syntaxStyle}
            width="100%"
            cornerRadius={6}
            padding={10}
            streaming={props.streaming}
          />
        </box>
      )
    }

    case "blockquote": {
      return (
        <box
          width="100%"
          paddingX={12}
          paddingY={4}
          borderColor={accent.drift}
          borderWidth={2}
        >
          {(token.tokens as MarkedToken[]).map((t, i) => renderToken(t, props, i))}
        </box>
      )
    }

    case "list": {
      return (
        <box width="100%" direction="column" gap={2} paddingY={2}>
          {token.items.map((item: Tokens.ListItem, i: number) => {
            const prefix = token.ordered ? `${Number(token.start ?? 1) + i}. ` : "• "
            const spans = inlineToSpans(item.tokens as MarkedToken[], color)
            return (
              <box width="100%" paddingX={8} direction="row">
                <text color={accent.anchor} fontSize={14}>{prefix}</text>
                {renderInlineSpans(spans)}
              </box>
            )
          })}
        </box>
      )
    }

    case "hr": {
      return (
        <box width="100%" height={1} backgroundColor={0x333333ff} />
      )
    }

    case "space": {
      return <box height={LINE_HEIGHT / 2} />
    }

    case "html": {
      // Render raw HTML as plain text (terminal can't render HTML)
      return (
        <box width="100%">
          <text color={textTokens.muted} fontSize={14}>{token.text}</text>
        </box>
      )
    }

    case "table": {
      // Simple table rendering — headers + rows
      return (
        <box width="100%" direction="column" gap={1} paddingY={4}>
          {/* Header */}
          <box width="100%" backgroundColor={surface.context} padding={4}>
            {token.header.map((cell: Tokens.TableCell) => (
              <box width="fit" paddingX={8}>
                <text color={accent.thread} fontSize={14}>
                  {inlineToText(cell.tokens as MarkedToken[])}
                </text>
              </box>
            ))}
          </box>
          {/* Rows */}
          {token.rows.map((row: Tokens.TableCell[]) => (
            <box width="100%" padding={4}>
              {row.map((cell: Tokens.TableCell) => (
                <box width="fit" paddingX={8}>
                  <text color={color} fontSize={14}>
                    {inlineToText(cell.tokens as MarkedToken[])}
                  </text>
                </box>
              ))}
            </box>
          ))}
        </box>
      )
    }

    default: {
      // Fallback: render raw text
      if ("text" in token) {
        return (
          <box width="100%">
            <text color={color} fontSize={14}>{(token as any).text}</text>
          </box>
        )
      }
      return <box />
    }
  }
}

// ── Component ──

export function Markdown(props: MarkdownProps) {
  const tokens = () => {
    try {
      return Lexer.lex(props.content, { gfm: true }) as MarkedToken[]
    } catch {
      return []
    }
  }

  return (
    <box
      width={props.width ?? "100%"}
      direction="column"
      gap={6}
    >
      {tokens().map((token, i) => renderToken(token, props, i))}
    </box>
  )
}
