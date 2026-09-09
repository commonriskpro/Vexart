/**
 * Deterministic test text measurer.
 *
 * Fixed grapheme width table: Latin 0.8, CJK 1.0, emoji 1.8 (relative to fontSize).
 * Deterministic across platforms — use in tests and CI.
 * Supports word wrapping for realistic text layout testing.
 */
import type { FlexilyPlugin } from "./create-flexily.js";
import type { TextLayoutService } from "./text-layout.js";
/**
 * Create a deterministic text measurement service for testing.
 *
 * Uses fixed grapheme widths: Latin 0.8, CJK 1.0, emoji 1.8 (relative to fontSize).
 */
export declare function createTestMeasurer(): TextLayoutService;
/**
 * Plugin: add deterministic test text measurement to the engine.
 */
export declare function withTestMeasurer(): FlexilyPlugin;
