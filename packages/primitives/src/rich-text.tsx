/**
 * RichText — inline text flow component for TGE.
 *
 * Concatenates all child Span text into a single text element
 * that flows inline and wraps naturally. Uses the first Span's
 * color as the display color.
 *
 * For per-fragment coloring, use a row of <Text> elements instead.
 * True rich inline rendering (mixed colors in one paragraph) is
 * planned for a future release.
 *
 * Usage:
 *   <RichText color={text.primary}>
 *     <Span>Hello </Span>
 *     <Span>world </Span>
 *     <Span>from TGE</Span>
 *   </RichText>
 */

import type { JSX } from "solid-js"

// ── Span ──
// A Span holds text content. RichText concatenates all Spans.

/** @public */
export type SpanProps = {
  color?: string | number
  fontSize?: number
  fontId?: number
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  children?: JSX.Element
}

/**
 * Span — inline text fragment. Rendered as a <text> node.
 * Can be used inside RichText or standalone.
 */
/** @public */
export function Span(props: SpanProps) {
  return (
    <text
      color={props.color}
      fontSize={props.fontSize}
      fontId={props.fontId}
      fontWeight={props.fontWeight}
      fontStyle={props.fontStyle}
    >
      {props.children}
    </text>
  )
}

// ── RichText ──

/** @public */
export type RichTextProps = {
  maxWidth?: number
  lineHeight?: number
  color?: string | number    // Primary color for the concatenated text
  fontSize?: number
  children?: JSX.Element
}

/**
 * RichText — wraps children <Span> elements in a horizontal row.
 * Clay will lay them out left-to-right within the container width.
 */
/** @public */
export function RichText(props: RichTextProps) {
  return (
    <box
      direction="row"
      width={props.maxWidth}
    >
      {props.children}
    </box>
  )
}
