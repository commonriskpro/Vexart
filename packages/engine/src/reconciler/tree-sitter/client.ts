/**
 * TreeSitterClient — main thread interface to the parser worker.
 *
 * Spawns a Bun Worker, sends parse requests, receives highlight results.
 * Provides a simple async API: highlightOnce(content, filetype) → SimpleHighlight[]
 *
 * Usage:
 *   const client = new TreeSitterClient()
 *   await client.initialize()  // loads default parsers
 *   const highlights = await client.highlightOnce(code, "typescript")
 */

import type { FiletypeParserConfig, SimpleHighlight, WorkerResponse } from "./types"
import { getDefaultParsers } from "./default-parsers"
import { existsSync } from "fs"
import { resolve } from "path"

let extraParsers: FiletypeParserConfig[] = []

/**
 * Register additional parsers before client initialization.
 *
 * @public
 */
export function addDefaultParsers(parsers: FiletypeParserConfig[]) {
  for (const parser of parsers) {
    extraParsers = [
      ...extraParsers.filter((p) => p.filetype !== parser.filetype),
      parser,
    ]
  }
}

/** @public */
export class TreeSitterClient {
  private worker: Worker | undefined
  private initialized = false
  private initPromise: Promise<void> | undefined
  private callbacks = new Map<string, (result: { highlights?: SimpleHighlight[]; error?: string }) => void>()
  private idCounter = 0

  /** Initialize the client — spawns worker, loads default parsers. */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    // Resolve worker path
    let workerPath: string | URL = new URL("./parser.worker.js", import.meta.url).href
    if (!existsSync(resolve(import.meta.dirname, "parser.worker.js"))) {
      workerPath = new URL("./parser.worker.ts", import.meta.url).href
    }

    this.worker = new Worker(workerPath)
    // @ts-ignore
    this.worker.onmessage = this.handleMessage.bind(this)

    // Init tree-sitter WASM
    await this.sendAndWait("INIT")

    // Register default parsers
    const allParsers = [...getDefaultParsers(), ...extraParsers]
    for (const config of allParsers) {
      this.worker.postMessage({ type: "ADD_PARSER", config })
    }

    // Wait a tick for parsers to load
    await new Promise((r) => setTimeout(r, 100))
    this.initialized = true
  }

  private sendAndWait(initType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Worker init timeout")), 10000)

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === "INIT_DONE") {
          clearTimeout(timeout)
          resolve()
        } else if (event.data.type === "INIT_ERROR") {
          clearTimeout(timeout)
          reject(new Error(event.data.error))
        }
      }

      // Temporarily override handler for init
      const origHandler = this.handleMessage.bind(this)
      // @ts-ignore
      this.worker!.onmessage = (event: MessageEvent) => {
        handler(event)
        // @ts-ignore
        this.worker!.onmessage = origHandler
      }

      this.worker!.postMessage({ type: initType })
    })
  }

  private handleMessage(event: MessageEvent<WorkerResponse>) {
    const msg = event.data

    if (msg.type === "HIGHLIGHT_RESULT") {
      const cb = this.callbacks.get(msg.id)
      if (cb) {
        this.callbacks.delete(msg.id)
        cb({ highlights: msg.highlights })
      }
    } else if (msg.type === "HIGHLIGHT_ERROR") {
      const cb = this.callbacks.get(msg.id)
      if (cb) {
        this.callbacks.delete(msg.id)
        cb({ error: msg.error })
      }
    }
  }

  /** Register an additional parser at runtime. */
  addFiletypeParser(config: FiletypeParserConfig) {
    this.worker?.postMessage({ type: "ADD_PARSER", config })
  }

  /**
   * One-shot highlight — parse content and return highlights.
   *
   * Returns SimpleHighlight[] = [startIndex, endIndex, groupName][]
   * Each highlight maps a byte range to a capture name (e.g., "keyword", "string").
   */
  async highlightOnce(content: string, filetype: string): Promise<SimpleHighlight[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    const id = `hl_${this.idCounter++}`

    return new Promise((resolve) => {
      this.callbacks.set(id, (result) => {
        resolve(result.highlights ?? [])
      })

      this.worker!.postMessage({
        type: "HIGHLIGHT",
        id,
        content,
        filetype,
      })
    })
  }

  /** Check if client is ready. */
  isReady(): boolean {
    return this.initialized
  }

  /** Destroy worker and clean up. */
  destroy() {
    this.worker?.terminate()
    this.worker = undefined
    this.initialized = false
    this.initPromise = undefined
    this.callbacks.clear()
  }
}

// ── Singleton ──

let singleton: TreeSitterClient | undefined

/** @public */
export function getTreeSitterClient(): TreeSitterClient {
  if (!singleton) {
    singleton = new TreeSitterClient()
  }
  return singleton
}
