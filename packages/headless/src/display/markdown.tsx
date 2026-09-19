/**
 * Markdown — renders markdown content as Vexart components.
 *
 * Tokenizes markdown and maps it to headless Vexart primitives.
 *
 * @public
 */

import { createMemo, Index } from "solid-js"
import type { JSX } from "solid-js"
import type { SizingUnit } from "@vexart/engine"
import { Code, type Highlighter } from "./code"

const LINE_HEIGHT = 17
const CHAR_WIDTH = 9

// ── Theme ──

/** @public */
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

/** @public */
export const MD_DEFAULTS: MarkdownTheme = {
  fg: "currentColor",
  muted: "transparent",
  heading: "currentColor",
  link: "currentColor",
  bold: "currentColor",
  italic: "currentColor",
  codeFg: "currentColor",
  codeBg: "transparent",
  codeBlockBg: "transparent",
  blockquoteBorder: "currentColor",
  listBullet: "currentColor",
  tableBg: "transparent",
  tableHeader: "currentColor",
  hrColor: "currentColor",
  del: "currentColor",
}

// ── Types ──

/**
 * Generic markdown token interface.
 *
 * @public
 */
export type MarkdownToken = {
  type: string
  raw?: string
  text?: string
  tokens?: any[]
  [key: string]: any
}

/**
 * Pluggable markdown tokenizer function contract.
 *
 * Accepts markdown source and returns an array of block tokens.
 * Compatible with `marked.Lexer.lex(src)`.
 *
 * @public
 */
export type MarkdownTokenizer = (src: string) => any[]

/** @public */
export type MarkdownProps = {
  content: string
  /** Optional pluggable tokenizer (e.g. marked.Lexer.lex). Defaults to built-in fallback parser. */
  tokenizer?: MarkdownTokenizer
  /** Optional pluggable syntax highlighter for code blocks. */
  highlighter?: Highlighter
  /** Default text color (shorthand — overrides theme.fg). */
  color?: string | number
  width?: SizingUnit
  streaming?: boolean
  /** Visual theme — all styling comes from here. */
  theme?: Partial<MarkdownTheme>
}

// ── Built-in Fallback Parser (Zero-Dep) ──

/**
 * Lightweight inline markdown tokenizer for standard formatting.
 */
function parseInline(src: string): any[] {
  const tokens: any[] = []
  const inlineRegex = /(`([^`]+)`)|(\*{3}([^*]+)\*{3})|(\*{2}([^*]+)\*{2}|_{2}([^_]+)_{2})|(\*(.+?)\*|_(.+?)_)|(~~([^~]+)~~)|(\[([^\]]+)\]\(([^\)]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = inlineRegex.exec(src)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: src.slice(lastIndex, match.index) })
    }
    if (match[1]) {
      tokens.push({ type: "codespan", text: match[2] })
    } else if (match[3]) {
      tokens.push({ type: "strong", text: match[4], tokens: [{ type: "em", text: match[4], tokens: parseInline(match[4]) }] })
    } else if (match[5]) {
      const t = match[6] || match[7]
      tokens.push({ type: "strong", text: t, tokens: parseInline(t) })
    } else if (match[8]) {
      const t = match[9] || match[10]
      tokens.push({ type: "em", text: t, tokens: parseInline(t) })
    } else if (match[11]) {
      tokens.push({ type: "del", text: match[12], tokens: parseInline(match[12]) })
    } else if (match[13]) {
      tokens.push({ type: "link", text: match[14], href: match[15], tokens: parseInline(match[14]) })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < src.length) {
    tokens.push({ type: "text", text: src.slice(lastIndex) })
  }
  return tokens
}

/**
 * Built-in lightweight zero-dependency markdown block parser.
 *
 * Parses headings, code blocks, blockquotes, lists, tables, hr, and paragraphs.
 *
 * @public
 */
export function parseMarkdown(src: string): any[] {
  if (!src || !src.trim()) return []

  const lines = src.split(/\r?\n/)
  const tokens: any[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line
    if (!line.trim()) {
      tokens.push({ type: "space" })
      i++
      continue
    }

    // Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^(\s*)(```|~~~)(.*)$/)
    if (fenceMatch) {
      const fence = fenceMatch[2]
      const lang = fenceMatch[3].trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing fence
      tokens.push({
        type: "code",
        lang: lang || undefined,
        text: codeLines.join("\n"),
      })
      continue
    }

    // Heading: #..######
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const depth = headingMatch[1].length
      const text = headingMatch[2].trim()
      tokens.push({
        type: "heading",
        depth,
        text,
        tokens: parseInline(text),
      })
      i++
      continue
    }

    // Horizontal rule: ---, ***, ___ (at least 3 characters)
    if (/^(\s*[-*_]\s*){3,}$/.test(line) && !/^(\s*[-*+]\s+)/.test(line)) {
      tokens.push({ type: "hr" })
      i++
      continue
    }

    // Blockquote: starts with >
    if (line.match(/^\s*>/)) {
      const quoteLines: string[] = []
      while (i < lines.length && (lines[i].match(/^\s*>/) || (quoteLines.length > 0 && lines[i].trim() && !lines[i].match(/^(\s*[-*+]|\s*\d+\.|\s*#{1,6}\s|```|~~~)/)))) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""))
        i++
      }
      tokens.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
        tokens: parseMarkdown(quoteLines.join("\n")),
      })
      continue
    }

    // Lists: Unordered (- or * or +) or Ordered (1. 2. etc)
    const ulistMatch = line.match(/^(\s*)([-*+])\s+(.*)$/)
    const olistMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
    if (ulistMatch || olistMatch) {
      const ordered = !!olistMatch
      const start = ordered ? parseInt(olistMatch[2], 10) : undefined
      const items: any[] = []

      while (i < lines.length) {
        const itemLine = lines[i]
        const curUMatch = itemLine.match(/^(\s*)([-*+])\s+(.*)$/)
        const curOMatch = itemLine.match(/^(\s*)(\d+)\.\s+(.*)$/)

        if (ordered ? curOMatch : curUMatch) {
          const itemText = (ordered ? curOMatch![3] : curUMatch![3]).trim()
          items.push({
            type: "list_item",
            text: itemText,
            tokens: parseInline(itemText),
          })
          i++
        } else if (itemLine.trim() && (itemLine.startsWith("  ") || itemLine.startsWith("\t"))) {
          if (items.length > 0) {
            const prev = items[items.length - 1]
            prev.text += " " + itemLine.trim()
            prev.tokens = parseInline(prev.text)
          }
          i++
        } else {
          break
        }
      }

      tokens.push({
        type: "list",
        ordered,
        start,
        items,
      })
      continue
    }

    // Tables: | col1 | col2 |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim())
        i++
      }
      if (tableLines.length >= 2) {
        const parseRow = (rowStr: string) => {
          return rowStr
            .slice(1, -1)
            .split("|")
            .map((c) => {
              const cellText = c.trim()
              return { text: cellText, tokens: parseInline(cellText) }
            })
        }

        const header = parseRow(tableLines[0])
        let rowStart = 1
        if (tableLines[1].match(/^\|(\s*:?-+:?\s*\|)+$/)) {
          rowStart = 2
        }
        const rows: any[][] = []
        for (let r = rowStart; r < tableLines.length; r++) {
          rows.push(parseRow(tableLines[r]))
        }
        tokens.push({
          type: "table",
          header,
          rows,
        })
        continue
      }
    }

    // Paragraph
    const pLines = [line.trim()]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^(#{1,6}\s|```|~~~|[-*+]\s|\d+\.\s|>|(\s*[-*_]\s*){3,}$)/) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|"))
    ) {
      pLines.push(lines[i].trim())
      i++
    }
    const pText = pLines.join(" ")
    tokens.push({
      type: "paragraph",
      text: pText,
      tokens: parseInline(pText),
    })
  }

  return tokens
}

/** @public */
export const parseFallbackMarkdown = parseMarkdown

// ── Inline span type ──

type InlineSpan = {
  text: string
  color: string | number
  bg?: string | number
}

// ── Inline text parsing ──

function inlineToText(tokens: any[] | undefined): string {
  if (!tokens) return ""
  let result = ""
  for (const tok of tokens) {
    if (!tok) continue
    switch (tok.type) {
      case "text":
        if (tok.tokens && tok.tokens.length > 0) {
          result += inlineToText(tok.tokens)
        } else {
          result += tok.text ?? ""
        }
        break
      case "strong": result += inlineToText(tok.tokens); break
      case "em": result += inlineToText(tok.tokens); break
      case "codespan": result += tok.text ?? ""; break
      case "link": result += inlineToText(tok.tokens); break
      case "br": result += "\n"; break
      case "del": result += inlineToText(tok.tokens); break
      case "escape": result += tok.text ?? ""; break
      default:
        if (tok.tokens && tok.tokens.length > 0) {
          result += inlineToText(tok.tokens)
        } else if ("text" in tok && typeof tok.text === "string") {
          result += tok.text
        }
        break
    }
  }
  return result
}

function inlineToSpans(tokens: any[] | undefined, baseColor: string | number, th: MarkdownTheme): InlineSpan[] {
  if (!tokens) return []
  const spans: InlineSpan[] = []
  for (const tok of tokens) {
    if (!tok) continue
    switch (tok.type) {
      case "text":
        if (tok.tokens && tok.tokens.length > 0) {
          spans.push(...inlineToSpans(tok.tokens, baseColor, th))
        } else {
          spans.push({ text: tok.text ?? "", color: baseColor })
        }
        break
      case "strong": spans.push(...inlineToSpans(tok.tokens, th.bold, th)); break
      case "em": spans.push(...inlineToSpans(tok.tokens, th.italic, th)); break
      case "codespan": spans.push({ text: " " + (tok.text ?? "") + " ", color: th.codeFg, bg: th.codeBg }); break
      case "link": spans.push(...inlineToSpans(tok.tokens, th.link, th)); break
      case "br": spans.push({ text: "\n", color: baseColor }); break
      case "del": spans.push(...inlineToSpans(tok.tokens, th.del, th)); break
      case "escape": spans.push({ text: tok.text ?? "", color: baseColor }); break
      default:
        if (tok.tokens && tok.tokens.length > 0) {
          spans.push(...inlineToSpans(tok.tokens, baseColor, th))
        } else if ("text" in tok && typeof tok.text === "string") {
          spans.push({ text: tok.text, color: baseColor })
        }
        break
    }
  }
  return spans
}

function renderInlineSpans(spans: InlineSpan[]): JSX.Element {
  return (
    <Index each={spans}>
      {(span) => {
        if (span().bg) {
          return (
            <box backgroundColor={span().bg} cornerRadius={3} paddingX={2}>
              <text color={span().color} fontSize={14} whiteSpace="pre-wrap">{span().text}</text>
            </box>
          )
        }
        return <text color={span().color} fontSize={14} whiteSpace="pre-wrap">{span().text}</text>
      }}
    </Index>
  )
}

function resolveLanguage(lang: string | undefined): string {
  if (!lang) return "plaintext"
  const aliases: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    md: "markdown", py: "python", rb: "ruby", sh: "bash", yml: "yaml", json: "json",
  }
  return aliases[lang.toLowerCase()] ?? lang.toLowerCase()
}

// ── Token renderers ──

function renderToken(token: any, props: MarkdownProps, th: MarkdownTheme): JSX.Element {
  if (!token) return <box />
  const fg = props.color ?? th.fg

  switch (token.type) {
    case "heading": {
      const sizes = [20, 18, 16, 15, 14, 14]
      const depth = typeof token.depth === "number" ? token.depth : 1
      const fontSize = sizes[Math.min(Math.max(depth - 1, 0), 5)]
      const tokenList = token.tokens ?? [{ type: "text", text: token.text ?? "" }]
      const spans = inlineToSpans(tokenList, th.heading, th)
      return (
        <box width="100%" paddingY={4} direction="row">
          <Index each={spans}>
            {(span) => {
              if (span().bg) {
                return (
                  <box backgroundColor={span().bg} cornerRadius={3} paddingX={2}>
                    <text color={span().color} fontSize={fontSize} whiteSpace="pre-wrap">{span().text}</text>
                  </box>
                )
              }
              return <text color={span().color} fontSize={fontSize} whiteSpace="pre-wrap">{span().text}</text>
            }}
          </Index>
        </box>
      )
    }

    case "paragraph": {
      const tokenList = token.tokens ?? [{ type: "text", text: token.text ?? "" }]
      const spans = inlineToSpans(tokenList, fg, th)
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
            content={token.text ?? ""}
            language={resolveLanguage(token.lang)}
            highlighter={props.highlighter}
            width="100%"
            theme={{ bg: th.codeBlockBg, radius: 6, padding: 10, lineNumberFg: th.muted }}
            streaming={props.streaming}
          />
        </box>
      )
    }

    case "blockquote": {
      const quoteTokens = token.tokens ?? []
      return (
        <box width="100%" paddingX={12} paddingY={4} borderColor={th.blockquoteBorder} borderWidth={2}>
          <Index each={quoteTokens}>
            {(t) => renderToken(t(), props, th)}
          </Index>
        </box>
      )
    }

    case "list": {
      const items = token.items ?? []
      return (
        <box width="100%" direction="column" gap={2} paddingY={2}>
          <Index each={items}>
            {(item: any, i) => {
            const it = item()
            const prefix = token.ordered ? `${Number(token.start ?? 1) + i}. ` : "• "
            const itemTokens = it?.tokens ?? [{ type: "text", text: it?.text ?? "" }]
            const spans = inlineToSpans(itemTokens, fg, th)
            return (
              <box width="100%" paddingX={8} direction="row">
                <text color={th.listBullet} fontSize={14} whiteSpace="pre-wrap">{prefix}</text>
                {renderInlineSpans(spans)}
              </box>
            )
            }}
          </Index>
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
          <text color={th.muted} fontSize={14} whiteSpace="pre-wrap">{token.text ?? ""}</text>
        </box>
      )

    case "table": {
      const header = token.header ?? []
      const rows = token.rows ?? []
      const colCount = header.length
      const colWidths = Array(colCount).fill(0) as number[]
      for (let c = 0; c < colCount; c++) {
        const headerTokens = header[c]?.tokens ?? [{ type: "text", text: header[c]?.text ?? "" }]
        const headerText = inlineToText(headerTokens)
        colWidths[c] = Math.max(colWidths[c], headerText.length)
        for (const row of rows) {
          const cellTokens = row[c]?.tokens ?? [{ type: "text", text: row[c]?.text ?? "" }]
          const cellText = inlineToText(cellTokens)
          colWidths[c] = Math.max(colWidths[c], cellText.length)
        }
      }
      return (
        <box width="100%" direction="column" gap={1} paddingY={4}>
          <box width="100%" direction="row" backgroundColor={th.tableBg} padding={4}>
            <Index each={header}>
              {(cell: any, c) => (
                <box width="fit" minWidth={colWidths[c] * CHAR_WIDTH} paddingX={8}>
                  <text color={th.tableHeader} fontSize={14} whiteSpace="pre-wrap">
                    {inlineToText(cell().tokens ?? [{ type: "text", text: cell().text ?? "" }])}
                  </text>
                </box>
              )}
            </Index>
          </box>
          <Index each={rows}>
            {(row: any) => (
              <box width="100%" direction="row" padding={4}>
                <Index each={row()}>
                  {(cell: any, c) => (
                    <box width="fit" minWidth={colWidths[c] * CHAR_WIDTH} paddingX={8}>
                      <text color={fg} fontSize={14} whiteSpace="pre-wrap">
                        {inlineToText(cell().tokens ?? [{ type: "text", text: cell().text ?? "" }])}
                      </text>
                    </box>
                  )}
                </Index>
              </box>
            )}
          </Index>
        </box>
      )
    }

    default: {
      if ("text" in token && typeof token.text === "string") {
        return (
          <box width="100%">
            <text color={fg} fontSize={14} whiteSpace="pre-wrap">{token.text}</text>
          </box>
        )
      }
      return <box />
    }
  }
}

// ── Component ──

/** @public */
export function Markdown(props: MarkdownProps) {
  const th = () => ({ ...MD_DEFAULTS, ...props.theme })
  const tokenizer = () => props.tokenizer ?? parseMarkdown

  const tokens = createMemo(() => {
    try {
      return tokenizer()(props.content ?? "")
    } catch {
      return []
    }
  })

  return (
    <box width={props.width ?? "100%"} direction="column" gap={6}>
      <Index each={tokens()}>
        {(token) => renderToken(token(), props, th())}
      </Index>
    </box>
  )
}
