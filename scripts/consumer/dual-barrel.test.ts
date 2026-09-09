import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = join(import.meta.dir, "../..")
const ENGINE_PATH = join(ROOT, "dist/engine.js")
const VEXART_PATH = join(ROOT, "dist/vexart.js")

type BuiltNode = { children: Array<{ kind: string }> }
type BuiltEngine = {
  solidRender: (code: () => unknown, node: BuiltNode) => () => void
  createElement: (tag: string) => BuiltNode
  effect: unknown
  createComponent: (component: () => BuiltNode, props: Record<string, never>) => BuiltNode
}
type BuiltVexart = {
  createApp: unknown
  effect: unknown
  createComponent: BuiltEngine["createComponent"]
}

async function loadBuild(): Promise<{ engine: BuiltEngine; vexart: BuiltVexart }> {
  if (!existsSync(ENGINE_PATH) || !existsSync(VEXART_PATH)) {
    throw new Error(`local build missing; run bun run build:dist (${ENGINE_PATH}, ${VEXART_PATH})`)
  }
  const [engine, vexart] = await Promise.all([
    import(pathToFileURL(ENGINE_PATH).href) as Promise<BuiltEngine>,
    import(pathToFileURL(VEXART_PATH).href) as Promise<BuiltVexart>,
  ])
  return { engine, vexart }
}

describe("G-039 built consumer dual barrel", () => {
  test("imports both local barrels and uses one universal Solid reconciler", async () => {
    const { engine, vexart } = await loadBuild()
    expect(typeof engine.solidRender).toBe("function")
    expect(typeof engine.createElement).toBe("function")
    expect(typeof vexart.createApp).toBe("function")
    expect(typeof vexart.createComponent).toBe("function")
    // The unified barrel deliberately keeps these identities from the external
    // ./engine.js bundle; different identities would mean two renderer stores.
    expect(vexart.effect).toBe(engine.effect)
    expect(vexart.createComponent).toBe(engine.createComponent)

    const root = engine.createElement("box")
    const dispose = engine.solidRender(
      () => vexart.createComponent(() => engine.createElement("box"), {}),
      root,
    )
    expect(root.children).toHaveLength(1)
    expect(root.children[0]?.kind).toBe("box")
    dispose()
  })
})
