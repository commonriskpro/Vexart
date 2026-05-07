/**
 * @vexart/primitives public API — explicit named exports.
 * NO `export *` — every export is intentional.
 *
 * Box and Text are NOT exported here — use the `<box>` and `<text>` JSX
 * intrinsics directly, or the `Box`/`Text` from `@vexart/app` (which add
 * className support). The primitives wrapper components added no value
 * beyond what the intrinsics provide.
 */

// ── Types re-exported for backward compat ─────────────────────────────────────

export type { TGEProps as BoxProps, ShadowConfig, GlowConfig } from "@vexart/engine"

// ── RichText / Span ──────────────────────────────────────────────────────────

export { Span, RichText } from "./rich-text"
export type { SpanProps, RichTextProps } from "./rich-text"

// ── WrapRow ───────────────────────────────────────────────────────────────────

export { WrapRow } from "./wrap-row"
export type { WrapRowProps } from "./wrap-row"
