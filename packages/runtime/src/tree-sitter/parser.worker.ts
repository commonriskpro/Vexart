/**
 * Parser worker — runs tree-sitter WASM in a separate thread.
 *
 * Handles:
 *   - INIT: initialize web-tree-sitter WASM runtime
 *   - ADD_PARSER: load a language grammar + highlight queries
 *   - HIGHLIGHT: parse content and return SimpleHighlight[] 
 *
 * Communication is via postMessage/onmessage (Bun Worker API).
 */

import { Parser, Query, Language } from "web-tree-sitter"
import { readFileSync } from "fs"
import type { FiletypeParserConfig, SimpleHighlight, WorkerRequest, WorkerResponse } from "./types"

const self = globalThis

// ── State ──

type LoadedParser = {
  language: Language
  highlightQuery: Query
  filetype: string
}

const parsers = new Map<string, LoadedParser>()
const aliases = new Map<string, string>()
let initialized = false

// ── Init ──

async function init() {
  if (initialized) return

  // Resolve the tree-sitter WASM runtime path
  const wasmPath = require.resolve("web-tree-sitter/web-tree-sitter.wasm")

  await Parser.init({
    locateFile() { return wasmPath },
  })

  initialized = true
}

// ── Add parser ──

async function addParser(config: FiletypeParserConfig) {
  if (!initialized) return

  // Load language WASM
  const language = await Language.load(config.wasm)

  // Load and concatenate highlight queries
  let queryText = ""
  for (const path of config.queries.highlights) {
    queryText += readFileSync(path, "utf-8") + "\n"
  }

  // Create query — filter out unsupported predicates for web-tree-sitter
  const highlightQuery = new Query(language, queryText)

  parsers.set(config.filetype, { language, highlightQuery, filetype: config.filetype })

  // Register aliases
  if (config.aliases) {
    for (const alias of config.aliases) {
      aliases.set(alias, config.filetype)
    }
  }
}

// ── Highlight ──

function resolveFiletype(filetype: string): string {
  if (parsers.has(filetype)) return filetype
  return aliases.get(filetype) ?? filetype
}

function highlight(content: string, filetype: string): SimpleHighlight[] {
  const canonical = resolveFiletype(filetype)
  const loaded = parsers.get(canonical)
  if (!loaded) return []

  const parser = new Parser()
  parser.setLanguage(loaded.language)

  const tree = parser.parse(content)
  if (!tree) {
    parser.delete()
    return []
  }

  const captures = loaded.highlightQuery.captures(tree.rootNode)
  const highlights: SimpleHighlight[] = []

  for (const capture of captures) {
    const node = capture.node
    if (node.startIndex === node.endIndex) continue
    highlights.push([node.startIndex, node.endIndex, capture.name])
  }

  tree.delete()
  parser.delete()

  return highlights
}

// ── Message handler ──

// @ts-ignore — Worker onmessage
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  switch (msg.type) {
    case "INIT": {
      try {
        await init()
        self.postMessage({ type: "INIT_DONE" } satisfies WorkerResponse)
      } catch (e) {
        self.postMessage({
          type: "INIT_ERROR",
          error: e instanceof Error ? e.message : String(e),
        } satisfies WorkerResponse)
      }
      break
    }

    case "ADD_PARSER": {
      try {
        await addParser(msg.config)
        self.postMessage({
          type: "PARSER_ADDED",
          filetype: msg.config.filetype,
        } satisfies WorkerResponse)
      } catch (e) {
        // Silently fail — parser just won't be available
        console.error(`Failed to add parser for ${msg.config.filetype}:`, e)
      }
      break
    }

    case "HIGHLIGHT": {
      try {
        const highlights = highlight(msg.content, msg.filetype)
        self.postMessage({
          type: "HIGHLIGHT_RESULT",
          id: msg.id,
          highlights,
        } satisfies WorkerResponse)
      } catch (e) {
        self.postMessage({
          type: "HIGHLIGHT_ERROR",
          id: msg.id,
          error: e instanceof Error ? e.message : String(e),
        } satisfies WorkerResponse)
      }
      break
    }
  }
}
