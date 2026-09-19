/**
 * VoidMarkdown — styled markdown renderer using Void design tokens.
 *
 * @public
 */

import { Lexer } from "marked"
import { Markdown, type MarkdownTheme, type MarkdownTokenizer } from "@vexart/headless"
import type { Highlighter } from "@vexart/headless"
import type { SizingUnit } from "@vexart/engine"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidMarkdownProps = {
  content: string
  /** Optional pluggable syntax highlighter for code blocks. */
  highlighter?: Highlighter
  width?: SizingUnit
  streaming?: boolean
  /** Optional visual theme overrides. */
  theme?: Partial<MarkdownTheme>
  /** Optional custom tokenizer override (defaults to marked Lexer). */
  tokenizer?: MarkdownTokenizer
}

/** @public */
export function VoidMarkdown(props: VoidMarkdownProps) {
  const voidTheme = () => ({
    fg: themeColors.foreground,
    muted: themeColors.mutedForeground,
    heading: themeColors.foreground,
    link: themeColors.ring,
    bold: themeColors.foreground,
    italic: themeColors.mutedForeground,
    codeFg: themeColors.foreground,
    codeBg: themeColors.muted,
    codeBlockBg: themeColors.card,
    blockquoteBorder: themeColors.border,
    listBullet: themeColors.ring,
    tableBg: themeColors.card,
    tableHeader: themeColors.foreground,
    hrColor: themeColors.border,
    del: themeColors.mutedForeground,
    ...props.theme,
  })

  const tokenizer = () => props.tokenizer ?? ((src: string) => Lexer.lex(src, { gfm: true }))

  return (
    <Markdown
      content={props.content}
      tokenizer={tokenizer()}
      highlighter={props.highlighter}
      width={props.width}
      streaming={props.streaming}
      theme={voidTheme()}
    />
  )
}
