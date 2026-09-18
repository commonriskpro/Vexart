import { afterEach, describe, expect, test } from "bun:test"
import { createNode, parseSizing, resetFocus, solidRender, type TGENode } from "@vexart/engine/internal"
import { VoidDropdownMenu } from "@vexart/styled"
import { syncAllLayoutProps } from "../../packages/engine/src/ffi/flex-sync"
import { createVexartLayoutCtx } from "../../packages/engine/src/loop/layout-adapter"
import { walkTree, type WalkTreeState } from "../../packages/engine/src/loop/walk-tree"
import { traverseFrame } from "../../packages/engine/src/loop/pipeline-traverse"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function syncTree(node: TGENode) {
  syncAllLayoutProps(node)
  node.children.forEach(syncTree)
}

function findNode(root: TGENode, predicate: (node: TGENode) => boolean): TGENode | undefined {
  if (predicate(root)) return root
  for (const child of root.children) {
    const found = findNode(child, predicate)
    if (found) return found
  }
  return undefined
}

afterEach(() => resetFocus())

suite("styled DropdownMenu floating layout", () => {
  test.each([
    ["default side offset", undefined, 4],
    ["custom side offset", 12, 12],
  ] as const)("places content below its trigger with %s", (_label, sideOffset, offset) => {
    const root = createNode("root")
    root.props = { width: 320, height: 200 }
    root._widthSizing = parseSizing(320)
    root._heightSizing = parseSizing(200)
    syncTree(root)

    const dispose = solidRender((() => (
      <box width={320} height={200} padding={24}>
        <VoidDropdownMenu open onOpenChange={() => {}}>
          <VoidDropdownMenu.Trigger>
            <box debugName="dropdown-trigger" width={120} height={28} backgroundColor={0x222222ff} />
          </VoidDropdownMenu.Trigger>
          <VoidDropdownMenu.Content sideOffset={sideOffset} width={140}>
            <box debugName="dropdown-content" width={100} height={20} backgroundColor={0x333333ff} />
          </VoidDropdownMenu.Content>
        </VoidDropdownMenu>
      </box>
    )) as unknown as () => TGENode, root)

    const layout = createVexartLayoutCtx()
    layout.init(320, 200)
    layout.beginLayout()

    try {
      syncTree(root)
      const state: WalkTreeState = {
        scrollSpeedCap: { value: 0 },
        nodeCount: { value: 0 },
        rectNodes: [],
        textNodes: [],
        boxNodes: [],
        layerBoundaries: [],
        scrollContainers: [],
        nodeRefById: new Map(),
        rectNodeById: new Map(),
        layout,
      }
      walkTree(root, state)
      layout.calculateRoots(root._flexNode)

      state.rectNodes.length = 0
      state.textNodes.length = 0
      state.boxNodes.length = 0
      state.nodeRefById.clear()
      state.rectNodeById.clear()
      state.scrollContainers.length = 0
      state.layerBoundaries.length = 0

      traverseFrame(root, state, 320, 200)

      const trigger = findNode(root, (node) => node.props.debugName === "dropdown-trigger")
      const content = findNode(root, (node) => node.props.floating === "parent")
      if (!trigger || !content) throw new Error("dropdown trigger/content did not mount")

      const triggerLayout = trigger.layout
      const contentLayout = content.layout
      if (!triggerLayout || !contentLayout) throw new Error("dropdown trigger/content layout was not recorded")

      expect(contentLayout.y).toBe(triggerLayout.y + triggerLayout.height + offset)
      expect(contentLayout.x).toBe(triggerLayout.x)
      expect(contentLayout.y).toBeGreaterThan(triggerLayout.y)
    } finally {
      dispose()
      layout.destroy()
    }
  })
})
