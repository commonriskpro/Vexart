import { afterEach, describe, expect, test } from "bun:test"
import { createNode, parseSizing, resetFocus, solidRender, type TGENode } from "@vexart/engine"
import { syncAllLayoutProps } from "../../packages/engine/src/ffi/flex-sync"
import { createVexartLayoutCtx } from "../../packages/engine/src/loop/layout-adapter"
import { walkTree } from "../../packages/engine/src/loop/walk-tree"
import { Scene as AvatarBadgeScene } from "./scenes/components-avatar-badge"
import { Scene as BackdropBlurScene } from "./scenes/effects-backdrop-blur"
import { Scene as GridDashboardScene } from "./scenes/grid-dashboard"
import { Scene as HelloScene } from "./scenes/hello"

type Scene = () => unknown
type Layout = { x: number; y: number; width: number; height: number }

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function syncTree(node: TGENode) {
  syncAllLayoutProps(node)
  node.children.forEach(syncTree)
}

function findNodes(root: TGENode, predicate: (node: TGENode) => boolean): TGENode[] {
  const result: TGENode[] = []
  const visit = (node: TGENode) => {
    if (predicate(node)) result.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return result
}

function layoutScene(scene: Scene, width: number, height: number, check: (root: TGENode, map: Map<number, Layout>) => void) {
  const root = createNode("root")
  root.props = { width, height }
  root._widthSizing = parseSizing(width)
  root._heightSizing = parseSizing(height)
  syncAllLayoutProps(root)

  const dispose = solidRender((() => scene()) as unknown as () => TGENode, root)
  const layout = createVexartLayoutCtx()
  layout.init(width, height)
  layout.beginLayout()

  try {
    syncTree(root)
    walkTree(root, {
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
    })
    layout.endLayout()
    check(root, new Map(layout.getLastLayoutMap() ?? []))
  } finally {
    dispose()
    layout.destroy()
  }
}

function contains(parent: Layout, child: Layout) {
  return child.x >= parent.x && child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height
}

afterEach(() => resetFocus())

suite("visual-test scene bounds", () => {
  test("keeps avatar badges legible in two rows", () => {
    layoutScene(AvatarBadgeScene, 420, 320, (root, map) => {
      const labels = findNodes(root, (node) => node.kind === "text" && ["Stable", "Beta", "Docs", "Alert"].includes(node.text))
      expect(labels.map((node) => node.text).sort()).toEqual(["Alert", "Beta", "Docs", "Stable"])

      const rows = new Map<number, TGENode[]>()
      for (const label of labels) {
        // Solid text leaves are nested in a mapped text wrapper; use that
        // wrapper's geometry while grouping by the containing badge row.
        const renderedLabel = label.parent ?? label
        const labelLayout = map.get(renderedLabel.id)
        const badge = renderedLabel.parent
        const badgeLayout = badge ? map.get(badge.id) : undefined
        if (!labelLayout || !badgeLayout) throw new Error(`missing layout for ${label.text}`)
        expect(contains(badgeLayout, labelLayout)).toBe(true)
        const row = rows.get(badgeLayout.y) ?? []
        row.push(label)
        rows.set(badgeLayout.y, row)
      }

      expect(rows.size).toBe(2)
      expect([...rows.values()].map((row) => row.length).sort()).toEqual([2, 2])
    })
  })

  test("keeps all backdrop cards inside the gradient parent", () => {
    layoutScene(BackdropBlurScene, 420, 320, (root, map) => {
      const cards = findNodes(root, (node) => node.kind === "box" && node.props.backdropBlur !== undefined)
      expect(cards).toHaveLength(3)
      const parent = cards[0]?.parent
      if (!parent) throw new Error("backdrop cards did not mount in a shared row")
      const parentLayout = map.get(parent.id)
      if (!parentLayout) throw new Error("backdrop card row has no layout")
      const gradient = parent.parent
      if (!gradient) throw new Error("backdrop card row has no gradient parent")
      const gradientLayout = map.get(gradient.id)
      if (!gradientLayout) throw new Error("backdrop gradient has no layout")
      expect(contains(gradientLayout, parentLayout)).toBe(true)

      const layouts = cards.map((card) => map.get(card.id))
      expect(layouts.every((card) => card && card.width > 0 && card.height === 140 && contains(parentLayout, card) && contains(gradientLayout, card))).toBe(true)
      const sorted = layouts
        .filter((card): card is Layout => card !== undefined)
        .sort((a, b) => a.x - b.x)
      expect(sorted).toHaveLength(3)
      for (let index = 1; index < sorted.length; index += 1) {
        expect(sorted[index].x).toBeGreaterThanOrEqual(sorted[index - 1].x + sorted[index - 1].width)
      }
    })
  })

  test("shrink-wraps hello content while centering it", () => {
    layoutScene(HelloScene, 400, 300, (root, map) => {
      const canvas = findNodes(root, (node) => node.kind === "box" && node.props.backgroundColor === 0x141414ff)[0]
      const inner = findNodes(root, (node) => node.kind === "box" && node.props.backgroundColor === 0x262626ff)[0]
      const label = findNodes(root, (node) => node.kind === "text" && node.text === "Hello from TGE")[0]
      if (!canvas || !inner || !label) throw new Error("hello scene nodes did not mount")
      const canvasLayout = map.get(canvas.id)
      const innerLayout = map.get(inner.id)
      const labelLayout = map.get((label.parent ?? label).id)
      if (!canvasLayout || !innerLayout || !labelLayout) throw new Error("hello scene has incomplete layout")

      expect(innerLayout.width).toBeLessThan(canvasLayout.width)
      const centeredX = canvasLayout.x + (canvasLayout.width - innerLayout.width) / 2
      expect(Math.abs(innerLayout.x - centeredX)).toBeLessThanOrEqual(1)
      expect(contains(innerLayout, labelLayout)).toBe(true)
    })
  })

  test("lays out the grid dashboard composition and its interaction state", () => {
    layoutScene(GridDashboardScene, 420, 320, (root, map) => {
      const grids = findNodes(root, (node) => node.kind === "box" && node.props.layout === "grid")
      expect(grids.length).toBeGreaterThanOrEqual(2)

      const outer = grids.find((node) => node.props.gridTemplateAreas !== undefined)
      const content = grids.find((node) => node.props.gridTemplateColumns !== undefined && node !== outer)
      if (!outer || !content) throw new Error("grid dashboard containers did not mount")

      const outerLayout = map.get(outer.id)
      const contentLayout = map.get(content.id)
      if (!outerLayout || !contentLayout) throw new Error("grid dashboard containers have no layout")
      expect(outerLayout.width).toBe(420)
      expect(outerLayout.height).toBe(320)
      expect(Number.isFinite(outerLayout.x)).toBe(true)
      expect(Number.isFinite(outerLayout.y)).toBe(true)
      expect(contains(outerLayout, contentLayout)).toBe(true)

      const areas = ["header", "sidebar", "content", "footer"]
      const areaNodes = areas.map((area) => {
        const node = findNodes(root, (candidate) => candidate.props.gridArea === area)[0]
        if (!node) throw new Error(`missing grid area ${area}`)
        const layout = map.get(node.id)
        if (!layout) throw new Error(`missing layout for grid area ${area}`)
        expect(layout.width).toBeGreaterThan(0)
        expect(layout.height).toBeGreaterThan(0)
        expect(contains(outerLayout, layout)).toBe(true)
        return { node, layout }
      })
      expect(areaNodes).toHaveLength(4)
      expect(new Set(areaNodes.map(({ layout }) => `${layout.x}:${layout.y}`)).size).toBe(4)

      expect(content.props.gridTemplateColumns).toEqual([
        { repeat: { count: "auto-fit", tracks: [{ minmax: [96, { fr: 1 }] }] } },
      ])
      expect(content.props.gridAutoRows).toBe(44)
      expect(contains(map.get(areaNodes[2].node.id) ?? contentLayout, contentLayout)).toBe(true)

      const spanningCards = findNodes(root, (node) => {
        const placement = node.props.gridColumn
        return node.kind === "box" && placement?.start === 1 && placement.end === 3
      })
      expect(spanningCards).toHaveLength(2)
      for (const card of spanningCards) {
        const cardLayout = map.get(card.id)
        if (!cardLayout) throw new Error("spanning dashboard card has no layout")
        expect(cardLayout.width).toBeGreaterThan(100)
        expect(contains(contentLayout, cardLayout)).toBe(true)
      }

      const text = findNodes(root, (node) => node.kind === "text")
      expect(text.some((node) => node.text === "Grid dashboard")).toBe(true)
      expect(text.some((node) => node.text === "Requests")).toBe(true)

      const interactive = findNodes(root, (node) => node.props.focusable === true)[0]
      if (!interactive) throw new Error("grid dashboard interactive control did not mount")
      const interactiveLayout = map.get(interactive.id)
      if (!interactiveLayout) throw new Error("interactive dashboard control has no layout")
      expect(interactive.props.hoverStyle).toBeDefined()
      expect(interactive.props.activeStyle).toBeDefined()
      expect(interactive.props.focusStyle).toBeDefined()
      expect(interactiveLayout.width).toBeGreaterThan(0)
      expect(interactiveLayout.height).toBeGreaterThan(0)
      const controls = findNodes(root, (node) => node.props.focusable === true)
      expect(controls.length).toBeGreaterThanOrEqual(3)
      expect(text.some((node) => node.text === "Production")).toBe(true)
      expect(text.some((node) => node.text === "Apply")).toBe(true)
      for (const control of controls) {
        const controlLayout = map.get(control.id)
        if (!controlLayout) throw new Error("interactive dashboard control has no layout")
        expect(controlLayout.width).toBeGreaterThan(0)
        expect(controlLayout.height).toBeGreaterThan(0)
      }

      expect(outer.props.padding).toBe(16)
      expect(areaNodes[0].node.props.borderWidth).toBe(1)
      expect(areaNodes[0].node.props.padding).toBe(10)
      for (const node of findNodes(root, (candidate) => candidate.kind === "box")) {
        const layout = map.get(node.id)
        if (!layout) continue
        expect(Number.isFinite(layout.x)).toBe(true)
        expect(Number.isFinite(layout.y)).toBe(true)
        expect(Number.isFinite(layout.width)).toBe(true)
        expect(Number.isFinite(layout.height)).toBe(true)
      }
    })
  })
})
