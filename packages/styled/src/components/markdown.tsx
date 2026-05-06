/**
 * VoidMarkdown — styled markdown renderer using Void design tokens.
 *
 * @public
 */

import { Markdown } from "@vexart/headless"
import type { SyntaxStyle } from "@vexart/headless"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidMarkdownProps = {
  content: string
  syntaxStyle: SyntaxStyle
  width?: number | string
  streaming?: boolean
}

/** @public */
export function VoidMarkdown(props: VoidMarkdownProps) {
  return (
    <Markdown
      content={props.content}
      syntaxStyle={props.syntaxStyle}
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
