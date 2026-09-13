/**
 * VoidMarkdown — styled markdown renderer using Void design tokens.
 *
 * @public
 */

import { Markdown } from "@vexart/headless"
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
}

/** @public */
export function VoidMarkdown(props: VoidMarkdownProps) {
  return (
    <Markdown
      content={props.content}
      highlighter={props.highlighter}
      width={props.width}
      streaming={props.streaming}
      theme={{
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
      }}
    />
  )
}
