/**
 * VoidCode — styled syntax-highlighted code block using Void design tokens.
 *
 * @public
 */

import { Code } from "@vexart/headless"
import type { Highlighter } from "@vexart/headless"
import type { SizingUnit } from "@vexart/engine"
import { radius, space } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidCodeProps = {
  content: string
  language?: string
  /** Optional pluggable syntax highlighter. */
  highlighter?: Highlighter
  width?: SizingUnit
  height?: SizingUnit
  lineNumbers?: boolean
  streaming?: boolean
}

/** @public */
export function VoidCode(props: VoidCodeProps) {
  return (
    <Code
      content={props.content}
      language={props.language}
      highlighter={props.highlighter}
      width={props.width}
      height={props.height}
      lineNumbers={props.lineNumbers}
      streaming={props.streaming}
      theme={{
        bg: themeColors.card,
        lineNumberFg: themeColors.mutedForeground,
        radius: radius.md,
        padding: space[3],
      }}
    />
  )
}
