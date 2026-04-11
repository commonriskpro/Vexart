/**
 * Default parser configurations — bundled grammars.
 *
 * Points to WASM + SCM files bundled in assets/.
 * Uses import.meta.url for portable path resolution.
 */

import type { FiletypeParserConfig } from "./types"
import { fileURLToPath } from "url"

let cached: FiletypeParserConfig[] | undefined

export function getDefaultParsers(): FiletypeParserConfig[] {
  if (cached) return cached

  cached = [
    {
      filetype: "javascript",
      aliases: ["javascriptreact"],
      wasm: fileURLToPath(new URL("./assets/javascript/tree-sitter-javascript.wasm", import.meta.url)),
      queries: {
        highlights: [fileURLToPath(new URL("./assets/javascript/highlights.scm", import.meta.url))],
      },
    },
    {
      filetype: "typescript",
      aliases: ["typescriptreact"],
      wasm: fileURLToPath(new URL("./assets/typescript/tree-sitter-typescript.wasm", import.meta.url)),
      queries: {
        highlights: [fileURLToPath(new URL("./assets/typescript/highlights.scm", import.meta.url))],
      },
    },
    {
      filetype: "markdown",
      wasm: fileURLToPath(new URL("./assets/markdown/tree-sitter-markdown.wasm", import.meta.url)),
      queries: {
        highlights: [fileURLToPath(new URL("./assets/markdown/highlights.scm", import.meta.url))],
        injections: [fileURLToPath(new URL("./assets/markdown/injections.scm", import.meta.url))],
      },
    },
    {
      filetype: "markdown_inline",
      wasm: fileURLToPath(new URL("./assets/markdown_inline/tree-sitter-markdown_inline.wasm", import.meta.url)),
      queries: {
        highlights: [fileURLToPath(new URL("./assets/markdown_inline/highlights.scm", import.meta.url))],
      },
    },
  ]

  return cached
}
