/**
 * Text — text display component for Vexart.
 *
 * Renders a `<text>` intrinsic element with color and font settings.
 * Supports multi-line word wrapping via Pretext layout engine.
 *
 * Usage:
 *   <Text color="#e0e0e0" fontSize={16}>Hello Vexart</Text>
 *   <Text color={palette.thread}>Status: OK</Text>
 *   <Text color={text.primary} lineHeight={20} wordBreak="normal">
 *     This text will wrap automatically within its container.
 *   </Text>
 */

import type { JSX } from "solid-js"

/** @public */
export type TextProps = {
  // Visual
  color?: string | number
  fontSize?: number
  fontId?: number

  // Text layout
  lineHeight?: number              // Line height in pixels (default: fontSize * 1.2)
  wordBreak?: "normal" | "keep-all" // Word break mode (default: "normal")
  whiteSpace?: "normal" | "pre-wrap" // White space mode (default: "normal")

  // Font (for multi-font support)
  fontFamily?: string              // Font family (must be registered via registerFont)
  fontWeight?: number              // Font weight (100-900)
  fontStyle?: "normal" | "italic"  // Font style

  // Content
  children?: JSX.Element
}

/** @public */
export function Text(props: TextProps) {
  return (
    <text
      color={props.color}
      fontSize={props.fontSize}
      fontId={props.fontId}
      lineHeight={props.lineHeight}
      wordBreak={props.wordBreak}
      whiteSpace={props.whiteSpace}
      fontFamily={props.fontFamily}
      fontWeight={props.fontWeight}
      fontStyle={props.fontStyle}
    >
      {props.children}
    </text>
  )
}
