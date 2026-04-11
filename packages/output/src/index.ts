/**
 * @tge/output — Convert pixel buffers to terminal output.
 *
 * Multiple backends based on terminal capabilities:
 * - Kitty graphics protocol (pixel-perfect, direct)
 * - Kitty Unicode Placeholders (pixel-perfect, tmux-safe)
 * - Sixel (legacy terminals)
 * - Halfblock ▀▄ (universal fallback)
 * - Quadrant ▖▗▘▝ (better fallback)
 *
 * The composer selects the best backend, composites regions,
 * and handles dirty tracking (only re-transmit changed regions).
 */

// TODO: Phase 1 — port output backends from LightCode TGE
export {};
