import { describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing, type TGEProps } from "./node"
import { createTextFlexNode, syncAllLayoutProps, syncLayoutProp } from "./flex-sync"

function gridWithText(textValue: string, textProps: TGEProps) {
  const root = createNode("box")
  root.props = {
    layout: "grid",
    width: 100,
    height: 100,
    gridTemplateColumns: [30, 70],
    gridTemplateRows: ["auto"],
    alignContent: "start",
  }
  root._widthSizing = parseSizing(root.props.width)
  root._heightSizing = parseSizing(root.props.height)

  const text = createTextNode(textValue)
  text.props = {
    gridColumn: { start: 1, end: 2 },
    gridRow: { start: 1, end: 2 },
    fontSize: 14,
    lineHeight: 17,
    ...textProps,
  }
  text._widthSizing = parseSizing(text.props.width)
  text._heightSizing = parseSizing(text.props.height)
  insertChild(root, text)
  syncAllLayoutProps(root)
  // Text nodes materialize lazily, just as they do in walkTree.
  createTextFlexNode(text)
  syncAllLayoutProps(root)
  return { root, text }
}

function calculate(root: ReturnType<typeof createNode>): void {
  root._flexNode!.calculateLayout(100, 100)
}

describe("Grid text Node adapter", () => {
  test("installs the live intrinsic callback and uses the resolved inline width", () => {
    const normal = gridWithText("aaaaaa", { wordBreak: "normal" })
    const keepAll = gridWithText("aaaaaa", { wordBreak: "keep-all" })

    expect(normal.text._flexNode!.getIntrinsicMeasureFunc()).not.toBeNull()
    calculate(normal.root)
    calculate(keepAll.root)

    // The real text metrics and line-height are used by the callback. At a
    // 30px column, normal wraps while keep-all preserves the overflowing word.
    expect(normal.text._flexNode!.getComputedWidth()).toBe(30)
    expect(keepAll.text._flexNode!.getComputedWidth()).toBe(30)
    expect(normal.text._flexNode!.getComputedHeight()).toBeGreaterThan(keepAll.text._flexNode!.getComputedHeight())
    expect(keepAll.text._flexNode!.getIntrinsicMeasureFunc()!("columns", undefined).maxContent).toBeGreaterThan(30)
  })

  test("updates Grid placement on the already-materialized text Node", () => {
    const { root, text } = gridWithText("grid item", { wordBreak: "normal" })
    calculate(root)
    expect(text._flexNode!.getComputedLeft()).toBe(0)

    text.props = { ...text.props, gridColumn: { start: 2, end: 3 } }
    syncLayoutProp(text, "gridColumn", text.props.gridColumn)
    calculate(root)

    expect(text._flexNode!.getComputedLeft()).toBe(30)
  })

  test("keeps an explicit fit width instead of applying Grid stretch", () => {
    const { root, text } = gridWithText("aa", { width: "fit" })
    calculate(root)

    expect(text._flexNode!.getComputedWidth()).toBeGreaterThan(0)
    expect(text._flexNode!.getComputedWidth()).toBeLessThan(30)
  })

  test("refreshes text content through the same callback without changing Flex wrapping rules", () => {
    const { root, text } = gridWithText("aa", { wordBreak: "normal" })
    const measure = text._flexNode!.getIntrinsicMeasureFunc()!
    calculate(root)
    const firstHeight = measure("rows", 30).preferred

    text.text = "aaaaaa"
    text._flexNode!.markDirty()
    calculate(root)
    const secondHeight = measure("rows", 30).preferred

    expect(secondHeight).toBeGreaterThan(firstHeight)
  })
})
