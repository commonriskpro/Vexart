/**
 * Text — text display component for TGE.
 *
 * Renders a `<text>` intrinsic element with color and font settings.
 * Text content is rendered as terminal characters at Clay-calculated positions.
 *
 * Usage:
 *   <Text color="#e0e0e0" fontSize={16}>Hello TGE</Text>
 *   <Text color={palette.thread}>Status: OK</Text>
 */

import type { JSX } from "solid-js"

export type TextProps = {
  // Visual
  color?: string | number
  fontSize?: number
  fontId?: number

  // Content
  children?: JSX.Element
}

export function Text(props: TextProps) {
  return (
    <text
      color={props.color}
      fontSize={props.fontSize}
      fontId={props.fontId}
    >
      {props.children}
    </text>
  )
}
