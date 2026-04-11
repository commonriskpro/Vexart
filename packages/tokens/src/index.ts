/**
 * @tge/tokens — Design tokens and theming.
 *
 * Consistent visual language for TGE apps:
 * - Void Black color palette with semantic aliases
 * - Spacing scale (2–32px)
 * - Border radius presets
 * - Shadow presets
 *
 * All colors are packed u32 RGBA (0xRRGGBBAA).
 */

export { palette, surface, accent, text, border, rgba, pack, alpha } from "./color"
export { spacing } from "./spacing"
export { radius } from "./radius"
export { shadow } from "./shadow"
export type { Shadow } from "./shadow"
