/**
 * Markdown — renders markdown content as TGE components.
 *
 * Uses `marked` (Lexer) to tokenize markdown, then maps tokens
 * to TGE JSX elements with full inline styling.
 *
 * Truly headless: all visual properties come from the `theme` prop.
 * Use @tge/void VoidMarkdown for a styled version.
 *
 * Usage:
 *   <Markdown
 *     content={markdownString}
 *     syntaxStyle={style}
 *     theme={{
 *       fg: 0xe0e0e0ff, muted: 0x888888ff,
 *       heading: 0x56d4c8ff, link: 0x61afefff,
 *       bold: 0xffffffff, italic: 0xc0a0e0ff,
 *       codeFg: 0xe5c07bff, codeBg: 0x2c313aff,
 *       blockquoteBorder: 0x7c6eaeff,
 *       listBullet: 0x4eaed0ff, tableBg: 0x1a1a2eff,
 *       hrColor: 0x333333ff, del: 0x666666ff,
 *     }}
 *   />
 */

import type { JSX } from "solid-js"
import { Lexer, type MarkedToken, type Tokens } from "marked"
import { type SyntaxStyle } from "@vexart/engine"
import { Code } from "./code"

const LINE_HEIGHT = 17

// ── Theme ──

export type MarkdownTheme = {
  /** Default text foreground. */
  fg: string | number
  /** Muted/dim text (html fallback, etc). */
  muted: string | number
  /** Heading color. */
  heading: string | number
  /** Link color. */
  link: string | number
  /** Bold text color. */
  bold: string | number
  /** Italic text color. */
  italic: string | number
  /** Inline code foreground. */
  codeFg: string | number
  /** Inline code background. */
  codeBg: string | number
  /** Code block theme (passed through to Code component). */
  codeBlockBg: string | number
  /** Blockquote left border color. */
  blockquoteBorder: string | number
  /** List bullet/number color. */
  listBullet: string | number
  /** Table header background. */
  tableBg: string | number
  /** Table header text color. */
  tableHeader: string | number
  /** Horizontal rule color. */
  hrColor: string | number
  /** Strikethrough text color. */
  del: string | number
}

const MD_DEFAULTS: MarkdownTheme = {
  fg: 0xe0e0e0ff,
  muted: 0x888888ff,
  heading: 0x56d4c8ff,
  link: 0x61afefff,
  bold: 0xffffffff,
  italic: 0xc0a0e0ff,
  codeFg: 0xe5c07bff,
  codeBg: 0x2c313aff,
  codeBlockBg: 0x1a1a2eff,
  blockquoteBorder: 0x7c6eaeff,
  listBullet: 0x4eaed0ff,
  tableBg: 0x1a1a2eff,
  tableHeader: 0x56d4c8ff,
  hrColor: 0x333333ff,
  del: 0x666666ff,
}

// ── Types ──

export type MarkdownProps = {
  content: string
  syntaxStyle: SyntaxStyle
  /** Default text color (shorthand — overrides theme.fg). */
  color?: number
  width?: number | string
  streaming?: boolean
  /** Visual theme — all styling comes from here. */
  theme?: Partial<MarkdownTheme>
}

// ── Inline span type ──

type InlineSpan = {
  text: string
  color: string | number
  bg?: string | number
}

// ── Inline text parsing ──

function inlineToText(tokens: MarkedToken[] | undefined): string {
  if (!tokens) return ""
  let result = ""
  for (const tok of tokens) {
    switch (tok.type) {
      case "text": result += tok.text; break
      case "strong": result += inlineToText(tok.tokens as MarkedToken[]); break
      case "em": result += inlineToText(tok.tokens as MarkedToken[]); break
      case "codespan": result += tok.text; break
      case "link": result += inlineToText(tok.tokens as MarkedToken[]); break
      case "br": result += "\n"; break
      case "del": result += inlineToText(tok.tokens as MarkedToken[]); break
      case "escape": result += tok.text; break
      default: if ("text" in tok) result += (tok as any).text; break
    }
  }
  return result
}

function inlineToSpans(tokens: MarkedToken[] | undefined, baseColor: string | number, th: MarkdownTheme): InlineSpan[] {
  if (!tokens) return []
  const spans: InlineSpan[] = []
  for (const tok of tokens) {
    switch (tok.type) {
      case "text": spans.push({ text: tok.text, color: baseColor }); break
      case "strong": spans.push(...inlineToSpans(tok.tokens as MarkedToken[], th.bold, th)); break
      case "em": spans.push(...inlineToSpans(tok.tokens as MarkedToken[], th.italic, th)); break
      case "codespan": spans.push({ text: ` ${tok.text} `, color: th.codeFg, bg: th.codeBg }); break
      case "link": spans.push(...inlineToSpans(tok.tokens as MarkedToken[], th.link, th)); break
      case "br": spans.push({ text: "\n", color: baseColor }); break
      case "del": spans.push(...inlineToSpans(tok.tokens as MarkedToken[], th.del, th)); break
      case "escape": spans.push({ text: tok.text, color: baseColor }); break
      default: if ("text" in tok) spans.push({ text: (tok as any).text, color: baseColor }); break
    }
  }
  return spans
}

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

function resolveLanguage(lang: string | undefined): string {
  if (!lang) return "plaintext"
  const aliases: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    md: "markdown", py: "python", rb: "ruby", sh: "bash", yml: "yaml", json: "javascript",
  }
  return aliases[lang.toLowerCase()] ?? lang.toLowerCase()
}

// ── Token renderers ──

function renderToken(token: MarkedToken, props: MarkdownProps, th: MarkdownTheme): JSX.Element {
  const fg = props.color ?? th.fg

  switch (token.type) {
    case "heading": {
      const sizes = [20, 18, 16, 15, 14, 14]
      const fontSize = sizes[Math.min(token.depth - 1, 5)]
      const spans = inlineToSpans(token.tokens as MarkedToken[], th.heading, th)
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
      const spans = inlineToSpans(token.tokens as MarkedToken[], fg, th)
      return (
        <box width="100%" direction="row">
          {renderInlineSpans(spans)}
        </box>
      )
    }

    case "code": {
      return (
        <box width="100%" paddingY={4}>
          <Code
            content={token.text}
            language={resolveLanguage(token.lang)}
            syntaxStyle={props.syntaxStyle}
            width="100%"
            theme={{ bg: th.codeBlockBg, radius: 6, padding: 10, lineNumberFg: th.muted }}
            streaming={props.streaming}
          />
        </box>
      )
    }

    case "blockquote": {
      return (
        <box width="100%" paddingX={12} paddingY={4} borderColor={th.blockquoteBorder} borderWidth={2}>
          {(token.tokens as MarkedToken[]).map((t) => renderToken(t, props, th))}
        </box>
      )
    }

    case "list": {
      return (
        <box width="100%" direction="column" gap={2} paddingY={2}>
          {token.items.map((item: Tokens.ListItem, i: number) => {
            const prefix = token.ordered ? `${Number(token.start ?? 1) + i}. ` : "• "
            const spans = inlineToSpans(item.tokens as MarkedToken[], fg, th)
            return (
              <box width="100%" paddingX={8} direction="row">
                <text color={th.listBullet} fontSize={14}>{prefix}</text>
                {renderInlineSpans(spans)}
              </box>
            )
          })}
        </box>
      )
    }

    case "hr":
      return <box width="100%" height={1} backgroundColor={th.hrColor} />

    case "space":
      return <box height={LINE_HEIGHT / 2} />

    case "html":
      return (
        <box width="100%">
          <text color={th.muted} fontSize={14}>{token.text}</text>
        </box>
      )

    case "table":
      return (
        <box width="100%" direction="column" gap={1} paddingY={4}>
          <box width="100%" backgroundColor={th.tableBg} padding={4}>
            {token.header.map((cell: Tokens.TableCell) => (
              <box width="fit" paddingX={8}>
                <text color={th.tableHeader} fontSize={14}>
                  {inlineToText(cell.tokens as MarkedToken[])}
                </text>
              </box>
            ))}
          </box>
          {token.rows.map((row: Tokens.TableCell[]) => (
            <box width="100%" padding={4}>
              {row.map((cell: Tokens.TableCell) => (
                <box width="fit" paddingX={8}>
                  <text color={fg} fontSize={14}>
                    {inlineToText(cell.tokens as MarkedToken[])}
                  </text>
                </box>
              ))}
            </box>
          ))}
        </box>
      )

    default: {
      if ("text" in token) {
        return (
          <box width="100%">
            <text color={fg} fontSize={14}>{(token as any).text}</text>
          </box>
        )
      }
      return <box />
    }
  }
}

// ── Component ──

export function Markdown(props: MarkdownProps) {
  const th = () => ({ ...MD_DEFAULTS, ...props.theme })

  const tokens = () => {
    try {
      return Lexer.lex(props.content, { gfm: true }) as MarkedToken[]
    } catch {
      return []
    }
  }

  return (
    <box width={props.width ?? "100%"} direction="column" gap={6}>
      {tokens().map((token, i) => renderToken(token, props, th()))}
    </box>
  )
}
