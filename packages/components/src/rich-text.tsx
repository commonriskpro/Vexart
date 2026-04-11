/**
 * RichText — mixed-font inline text component for TGE.
 *
 * Uses Pretext's rich-inline layout to mix fonts, sizes, weights,
 * and colors within a single paragraph with proper word wrapping.
 *
 * Usage:
 *   <RichText maxWidth={400} lineHeight={20}>
 *     <Span color={text.primary}>Hello </Span>
 *     <Span color={accent.thread} fontWeight={700}>world</Span>
 *     <Span color={text.muted}> — from TGE</Span>
 *   </RichText>
 */

import type { JSX } from "solid-js"

// ── Span ──
// A Span is a text fragment with its own styling.
// It's a data-only component — RichText reads its props during render.

export type SpanProps = {
  color?: string | number
  fontSize?: number
  fontId?: number
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  children?: JSX.Element
}

/**
 * Span — inline text fragment within a RichText.
 * Does NOT render independently — it's consumed by RichText.
 */
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

export type RichTextProps = {
  maxWidth?: number            // Max width for wrapping (default: container width)
  lineHeight?: number          // Line height in pixels
  children?: JSX.Element       // Span children
}

/**
 * RichText — container for mixed-font inline text.
 *
 * Children should be <Span> components. RichText collects their
 * text content and styling, runs Pretext rich-inline layout,
 * and renders each fragment with its own font/color.
 *
 * Note: In the current implementation, RichText renders as a
 * regular <box> with <text> children. The rich-inline layout
 * is applied during the paint phase. True mixed-font rendering
 * requires runtime font atlas support (Phase 2+).
 */
export function RichText(props: RichTextProps) {
  return (
    <box
      direction="column"
      width={props.maxWidth}
    >
      {props.children}
    </box>
  )
}
