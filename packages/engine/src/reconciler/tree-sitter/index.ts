/**
 * @vexart/engine/tree-sitter — syntax highlighting system.
 *
 * Public API:
 *   - TreeSitterClient: worker-based parser (highlightOnce)
 *   - SyntaxStyle: theme → scope color mapping
 *   - highlightsToTokens: highlights → colored Token[][] per line
 *   - Built-in themes: ONE_DARK, KANAGAWA
 *   - addDefaultParsers: register additional language grammars
 */

// Client
export { TreeSitterClient, getTreeSitterClient, addDefaultParsers } from "./client"

// Style
export { SyntaxStyle, ONE_DARK, KANAGAWA } from "./syntax-style"
export type { StyleDefinition, ThemeTokenStyle, SimpleThemeRules } from "./syntax-style"

// Tokenizer
export { highlightsToTokens } from "./tokenize"
export type { Token } from "./tokenize"

// Types
export type { SimpleHighlight, FiletypeParserConfig } from "./types"
