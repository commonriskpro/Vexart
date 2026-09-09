import { describe, expect, test } from "bun:test"
import { Node } from "flexily"
import { createNode, insertChild, parseSizing, type TGEProps } from "./node"
import { getGridSyncDiagnostics, isLayoutProp, syncAllLayoutProps, syncLayoutProp } from "./flex-sync"

function box(props: TGEProps = {}) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  return node
}

describe("Flexily Grid bridge", () => {
  test("advertises Grid props and translates the Grid snapshot with closed defaults", () => {
    const node = box({
      layout: "grid",
      justifyContent: "flex-start",
      alignItems: "flex-end",
      gridTemplateColumns: [100],
    })
    expect(isLayoutProp("layout")).toBe(true)
    expect(isLayoutProp("gridTemplateColumns")).toBe(true)
    expect(isLayoutProp("gridRow")).toBe(true)

    syncAllLayoutProps(node)
    const flex = node._flexNode!
    expect(flex.getLayoutMode()).toBe("grid")
    expect(flex.getGridStyle()).toMatchObject({
      columns: node.props.gridTemplateColumns,
      rows: [],
      autoColumns: "auto",
      autoRows: "auto",
      autoFlow: "row",
      gap: 0,
      justifyContent: "start",
      alignContent: "stretch",
      justifyItems: "stretch",
      alignItems: "end",
    })
    const revision = flex.getGridRevision()
    syncAllLayoutProps(node)
    expect(flex.getGridRevision()).toBe(revision)
  })

  test("round-trips Flex → Grid → Flex without a parallel solver", () => {
    const node = box({ layout: "flex", direction: "row", gap: 4 })
    syncAllLayoutProps(node)
    const flex = node._flexNode!
    expect(flex.getLayoutMode()).toBe("flex")
    expect(flex.getFlexDirection()).toBe(2)

    node.props = { ...node.props, layout: "grid", gridTemplateColumns: [1] }
    syncLayoutProp(node, "layout", "grid")
    expect(flex.getLayoutMode()).toBe("grid")
    expect(flex.getGridStyle()?.columns).toEqual([1])

    node.props = { ...node.props, layout: "flex", direction: "row" }
    syncLayoutProp(node, "layout", "flex")
    expect(flex.getLayoutMode()).toBe("flex")
    expect(flex.getFlexDirection()).toBe(2)
    expect(flex.getGridStyle()?.columns).toEqual([1])
  })

  test("replaces Grid arrays once and does not parse a no-op snapshot", () => {
    const node = box({ layout: "grid", gridTemplateColumns: [100] })
    const flex = node._flexNode!
    let calls = 0
    const setGridStyle = flex.setGridStyle.bind(flex)
    flex.setGridStyle = (style) => {
      calls++
      setGridStyle(style)
    }

    syncAllLayoutProps(node)
    syncAllLayoutProps(node)
    expect(calls).toBe(1)

    const replacement = [80, 20] as const
    node.props = { ...node.props, gridTemplateColumns: replacement }
    syncLayoutProp(node, "gridTemplateColumns", replacement)
    expect(calls).toBe(2)
    syncLayoutProp(node, "gridTemplateColumns", replacement)
    expect(calls).toBe(2)
  })

  test("synchronizes child placement on the real Node and diagnoses Flex-only props under Grid", () => {
    const parent = box({ layout: "grid", gridTemplateColumns: [100, 100] })
    const child = box({
      gridColumn: { start: 1, end: 2 },
      gridRow: { start: 1, end: 2 },
      alignX: "center",
      flexGrow: 1,
    })
    insertChild(parent, child)

    syncAllLayoutProps(parent)
    const item = child._flexNode!.getGridItemStyle()
    expect(item.column).toEqual({ start: 1, end: 2 })
    expect(item.row).toEqual({ start: 1, end: 2 })
    expect(getGridSyncDiagnostics(child)).toEqual([
      { code: "GRID_INVALID_VALUE", path: "alignX", nodeId: child.id },
      { code: "GRID_INVALID_VALUE", path: "flexGrow", nodeId: child.id },
    ])

    child.props = { ...child.props, gridColumn: { start: 2, end: 3 } }
    syncLayoutProp(child, "gridColumn", child.props.gridColumn)
    expect(child._flexNode!.getGridItemStyle().column).toEqual({ start: 2, end: 3 })
  })

  test("maps Grid unsupported alignment to a stable bridge diagnostic", () => {
    const node = box({ layout: "grid", alignItems: "space-between" as unknown as TGEProps["alignItems"] })
    syncAllLayoutProps(node)
    expect(getGridSyncDiagnostics(node)).toEqual([
      { code: "GRID_UNSUPPORTED_ALIGNMENT", path: "alignItems", nodeId: node.id },
    ])
    expect(node._flexNode!.getGridStyle()?.alignItems).toBe("space-between" as unknown as "start")
  })

  test("keeps intrinsic and viewport updates on the dirty Node path", () => {
    const node = box({ layout: "grid", width: 300, height: 100 })
    const flex = node._flexNode!
    syncAllLayoutProps(node)
    flex.calculateLayout(300, 100)
    flex.markLayoutSeen()
    expect(flex.isDirty()).toBe(false)

    node.props = { ...node.props, width: 320 }
    node._widthSizing = parseSizing(node.props.width)
    syncLayoutProp(node, "width", 320)
    expect(flex.isDirty()).toBe(true)
  })
})

// Ensure the test itself uses the vendored low-level Node rather than a test
// double or a second layout engine.
void Node
