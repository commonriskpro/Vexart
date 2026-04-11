/**
 * @tge/output — Convert pixel buffers to terminal output.
 *
 * Three backends with automatic selection:
 *   - Kitty graphics (pixel-perfect, direct terminal)
 *   - Kitty Unicode placeholders (pixel-perfect, tmux-safe)
 *   - Halfblock ▀▄ + quadrant (universal fallback)
 *
 * Usage:
 *   import { createComposer } from "@tge/output"
 *
 *   const composer = createComposer(terminal.write, terminal.caps)
 *   // composer.backend → "kitty" | "placeholder" | "halfblock"
 *   composer.render(pixelBuf, col, row, cols, rows, cellW, cellH)
 *   composer.destroy()
 */

export { createComposer } from "./composer"
export type { Composer, BackendKind } from "./composer"

// Layer compositor (multi-image, browser-style)
export { createLayerComposer } from "./layer-composer"
export type { LayerComposer } from "./layer-composer"

// Individual backends (for advanced use)
export * as kitty from "./kitty"
export * as placeholder from "./placeholder"
export * as halfblock from "./halfblock"
