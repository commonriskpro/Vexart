/**
 * RichText — container for styled text spans.
 *
 * Renders children in a horizontal row. Use <Span> children for
 * per-segment color/weight styling. Does NOT concatenate text
 * into a single element — each Span renders independently.
 *
 * Usage:
 *   <RichText color={text.primary}>
 *     <Span>Hello </Span>
 *     <Span>world </Span>
 *     <Span>from Vexart</Span>
 *   </RichText>
 */

import type { JSX } from "solid-js"

// ── Span ──
// A Span holds text content. RichText renders each Span independently.

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
  children?: JSX.Element
}

/**
 * RichText — wraps children <Span> elements in a horizontal row.
 * Flexily will lay them out left-to-right within the container width.
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
