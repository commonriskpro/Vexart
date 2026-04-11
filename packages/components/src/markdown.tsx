/**
 * Markdown — renders markdown content as TGE components.
 *
 * Uses `marked` (Lexer) to tokenize markdown, then maps tokens
 * to TGE JSX elements:
 *   - Headings → <text> with larger font / bold color
 *   - Paragraphs → <text> with inline formatting
 *   - Code blocks → <Code> with syntax highlighting
 *   - Lists → indented <text> with bullet/number prefix
 *   - Blockquotes → indented <box> with left border
 *   - Horizontal rules → <box> with border
 *   - Links → <text> with underline color
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
}

// ── Inline text parsing ──

/**
 * Flatten inline tokens to a plain string.
 * Handles bold, italic, code, links, etc.
 * For now returns plain text — per-span styling comes later with RichText.
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
      return (
        <box width="100%" paddingY={4}>
          <text color={headingColor} fontSize={fontSize}>
            {inlineToText(token.tokens as MarkedToken[])}
          </text>
        </box>
      )
    }

    case "paragraph": {
      return (
        <box width="100%">
          <text color={color} fontSize={14}>
            {inlineToText(token.tokens as MarkedToken[])}
          </text>
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
            const text = inlineToText(item.tokens as MarkedToken[])
            return (
              <box width="100%" paddingX={8}>
                <text color={accent.anchor} fontSize={14}>{prefix}</text>
                <text color={color} fontSize={14}>{text}</text>
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
