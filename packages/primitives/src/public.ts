/**
 * @vexart/primitives public API — explicit named exports.
 * NO `export *` — every export is intentional.
 */

// ── Box ───────────────────────────────────────────────────────────────────────

export { Box } from "./box"
export type { ShadowConfig, GlowConfig, BoxProps } from "./box"

// ── Text ──────────────────────────────────────────────────────────────────────

export { Text } from "./text"
export type { TextProps } from "./text"

// ── RichText / Span ──────────────────────────────────────────────────────────

export { Span, RichText } from "./rich-text"
export type { SpanProps, RichTextProps } from "./rich-text"

// ── WrapRow ───────────────────────────────────────────────────────────────────

export { WrapRow } from "./wrap-row"
export type { WrapRowProps } from "./wrap-row"
