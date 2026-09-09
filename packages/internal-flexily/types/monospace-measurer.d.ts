/**
 * Monospace text measurement.
 *
 * Terminal text: graphemeCount * charWidth, always 1 line (no wrapping).
 * This is the default for terminal UIs where 1 char = 1 cell.
 */
import type { FlexilyPlugin } from "./create-flexily.js";
import type { TextLayoutService } from "./text-layout.js";
/**
 * Create a monospace text measurement service.
 *
 * @param charWidth - Width of each character cell (default: 1 for terminal grids)
 * @param charHeight - Height of each character cell (default: 1 for terminal grids)
 */
export declare function createMonospaceMeasurer(charWidth?: number, charHeight?: number): TextLayoutService;
/**
 * Plugin: add monospace text measurement to the engine.
 *
 * @param charWidth - Width per character cell (default: 1)
 * @param charHeight - Height per character cell (default: 1)
 */
export declare function withMonospace(charWidth?: number, charHeight?: number): FlexilyPlugin;
