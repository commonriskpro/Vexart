/**
 * Composable Flexily engine — createFlexily, createBareFlexily, pipe.
 *
 * FlexilyNode = Node + { setTextContent, getTextContent }.
 * No wrapper — text methods are mixed directly onto the Node instance.
 */
import { Node } from "./node-zero.js";
import type { TextLayoutService, ResolvedTextStyle } from "./text-layout.js";
/** A Node with text content methods. */
export interface FlexilyNode extends Node {
    setTextContent(text: string, style?: Partial<ResolvedTextStyle>): void;
    getTextContent(): string | null;
}
/** The composable Flexily engine. */
export interface FlexilyEngine {
    createNode(): FlexilyNode;
    calculateLayout(root: FlexilyNode, width?: number, height?: number, direction?: number): void;
    textLayout?: TextLayoutService;
}
/** A plugin that extends or configures the engine. */
export type FlexilyPlugin = (engine: FlexilyEngine) => FlexilyEngine;
/**
 * Create a bare Flexily engine — no plugins, just nodes and layout.
 * Add plugins via pipe() for text measurement.
 */
export declare function createBareFlexily(): FlexilyEngine;
/**
 * Apply plugins to an engine, left to right.
 *
 * @example
 * ```typescript
 * const flex = pipe(createBareFlexily(), withMonospace(), withTestMeasurer())
 * ```
 */
export declare function pipe(engine: FlexilyEngine, ...plugins: FlexilyPlugin[]): FlexilyEngine;
/**
 * Create a batteries-included Flexily engine.
 *
 * Includes monospace text measurement (1 char = charWidth units).
 * For terminal UIs, the default charWidth/charHeight of 1 maps to terminal cells.
 *
 * @example
 * ```typescript
 * import { createFlexily } from "flexily"
 * const flex = createFlexily()
 * const node = flex.createNode()
 * node.setTextContent("Hello world")
 * flex.calculateLayout(node, 80, 24)
 * ```
 */
export declare function createFlexily(options?: {
    charWidth?: number;
    charHeight?: number;
}): FlexilyEngine;
