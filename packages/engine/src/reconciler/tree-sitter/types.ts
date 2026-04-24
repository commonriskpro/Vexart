/**
 * Tree-sitter types — shared between client (main thread) and worker.
 */

/** @public */
export type HighlightRange = {
  startCol: number
  endCol: number
  group: string
}

/** @public */
export type HighlightResponse = {
  line: number
  highlights: HighlightRange[]
}

/** @public */
export type SimpleHighlight = [number, number, string]

/** @public */
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
