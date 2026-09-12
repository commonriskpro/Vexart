import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = join(import.meta.dir, "../..")
const DIST = process.env.VEXART_CONSUMER_DIST ?? join(ROOT, "dist")
const ENGINE_PATH = join(DIST, "engine.js")
const JSX_RUNTIME_PATH = join(DIST, "jsx-runtime.js")
const VEXART_PATH = join(DIST, "vexart.js")

type BuiltNode = { children: Array<{ kind: string }>; _interactionMode?: string }
type BuiltInteraction = {
  ref: (handle: unknown) => void
  node: () => unknown
  mode: () => string
  begin: (mode?: "drag") => void
  end: (mode?: "drag") => void
}
type BuiltEngine = Record<string, unknown> & {
  useInteractionLayer: () => BuiltInteraction
}
type BuiltJsxRuntime = {
  createElement: (tag: string) => BuiltNode
  createTextNode: (value: string) => BuiltNode
  insertNode: (parent: BuiltNode, node: BuiltNode, anchor?: BuiltNode) => void
  setProp: (node: BuiltNode, name: string, value: unknown, prev?: unknown) => unknown
  createComponent: (component: () => BuiltNode, props: Record<string, never>) => BuiltNode
  insert: (parent: BuiltNode, accessor: () => BuiltNode | string, marker?: BuiltNode) => void
  spread: (node: BuiltNode, accessor: unknown, skipChildren?: boolean) => void
  mergeProps: (...sources: unknown[]) => unknown
  use: (...args: unknown[]) => unknown
  memo: (...args: unknown[]) => unknown
  effect: (...args: unknown[]) => unknown
}
type BuiltVexart = {
  createApp: unknown
  createComponent: BuiltJsxRuntime["createComponent"]
}

async function loadBuild(): Promise<{ engine: BuiltEngine; runtime: BuiltJsxRuntime; vexart: BuiltVexart }> {
  if (!existsSync(ENGINE_PATH) || !existsSync(JSX_RUNTIME_PATH) || !existsSync(VEXART_PATH)) {
    throw new Error(`local build missing; run bun run build:dist (${ENGINE_PATH}, ${JSX_RUNTIME_PATH}, ${VEXART_PATH})`)
  }
  const [engine, runtime, vexart] = await Promise.all([
    import(pathToFileURL(ENGINE_PATH).href) as Promise<BuiltEngine>,
    import(pathToFileURL(JSX_RUNTIME_PATH).href) as Promise<BuiltJsxRuntime>,
    import(pathToFileURL(VEXART_PATH).href) as Promise<BuiltVexart>,
  ])
  return { engine, runtime, vexart }
}

describe("G-039 built consumer dual barrel", () => {
  test("keeps compiler runtime and public barrels on one universal reconciler", async () => {
    const { engine, runtime, vexart } = await loadBuild()
    for (const name of [
      "createElement",
      "createTextNode",
      "insertNode",
      "setProp",
      "createComponent",
      "insert",
      "spread",
      "mergeProps",
      "use",
      "memo",
      "effect",
    ]) {
      expect(typeof runtime[name as keyof BuiltJsxRuntime]).toBe("function")
    }
    for (const name of ["createNode", "createRenderLoop", "createElement", "setProp", "solidRender", "createHandle"]) {
      expect(engine[name]).toBeUndefined()
    }
    expect(typeof vexart.createApp).toBe("function")
    expect(typeof vexart.createComponent).toBe("function")
    // The unified barrel deliberately shares compiler bindings; different
    // identities would mean two renderer stores.
    expect(vexart.createComponent).toBe(runtime.createComponent)

    const root = runtime.createElement("box")
    const child = vexart.createComponent(() => runtime.createElement("box"), {})
    runtime.insertNode(root, child)
    expect(root.children).toHaveLength(1)
    expect(root.children[0]?.kind).toBe("box")

    // Exercise a public engine hook with a compiler-runtime node. A duplicated
    // reconciler would reject this handle in getHandleNode().
    const interaction = engine.useInteractionLayer()
    const compilerNode = runtime.createElement("box")
    runtime.use(interaction.ref, compilerNode)
    expect(interaction.node()).not.toBeNull()
    interaction.begin("drag")
    expect(interaction.mode()).toBe("drag")
    expect(compilerNode._interactionMode).toBe("drag")
    interaction.end("drag")
    expect(compilerNode._interactionMode).toBe("none")
  })
})
