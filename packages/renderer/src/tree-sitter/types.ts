/**
 * Tree-sitter types — shared between client (main thread) and worker.
 */

/** A highlight range within a single line */
export type HighlightRange = {
  startCol: number
  endCol: number
  group: string
}

/** Highlight response for a single line */
export type HighlightResponse = {
  line: number
  highlights: HighlightRange[]
}

/** Simplified highlight: [startIndex, endIndex, groupName] */
export type SimpleHighlight = [number, number, string]

/** Configuration for a filetype parser */
export type FiletypeParserConfig = {
  filetype: string
  aliases?: string[]
  wasm: string  // absolute path to .wasm grammar file
  queries: {
    highlights: string[]   // absolute paths to .scm highlight query files
    injections?: string[]  // absolute paths to .scm injection query files
  }
}

/** Messages from main thread → worker */
export type WorkerRequest =
  | { type: "INIT" }
  | { type: "ADD_PARSER"; config: FiletypeParserConfig }
  | { type: "HIGHLIGHT"; id: string; content: string; filetype: string }

/** Messages from worker → main thread */
export type WorkerResponse =
  | { type: "INIT_DONE" }
  | { type: "INIT_ERROR"; error: string }
  | { type: "PARSER_ADDED"; filetype: string }
  | { type: "HIGHLIGHT_RESULT"; id: string; highlights: SimpleHighlight[] }
  | { type: "HIGHLIGHT_ERROR"; id: string; error: string }
