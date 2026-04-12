import { describe, expect, test } from "bun:test"
import {
  createNode,
  createTextNode,
  insertChild,
  removeChild,
  parseColor,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
} from "./node"
import { SIZING, DIRECTION, ALIGN_X, ALIGN_Y } from "./clay"

describe("createNode", () => {
  test("creates a box node", () => {
    const node = createNode("box")
    expect(node.kind).toBe("box")
    expect(node.children).toEqual([])
    expect(node.parent).toBeNull()
    expect(node.text).toBe("")
  })

  test("creates a root node", () => {
    const node = createNode("root")
    expect(node.kind).toBe("root")
  })

  test("creates a text node", () => {
    const node = createNode("text")
    expect(node.kind).toBe("text")
  })
})

describe("createTextNode", () => {
  test("creates text node with content", () => {
    const node = createTextNode("hello")
    expect(node.kind).toBe("text")
    expect(node.text).toBe("hello")
  })

  test("creates text node with empty string", () => {
    const node = createTextNode("")
    expect(node.text).toBe("")
  })
})

describe("insertChild", () => {
  test("appends child to parent", () => {
    const parent = createNode("box")
    const child = createNode("box")
    insertChild(parent, child)
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0]).toBe(child)
    expect(child.parent).toBe(parent)
  })

  test("appends multiple children in order", () => {
    const parent = createNode("box")
    const a = createNode("box")
    const b = createNode("box")
    const c = createNode("box")
    insertChild(parent, a)
    insertChild(parent, b)
    insertChild(parent, c)
    expect(parent.children).toEqual([a, b, c])
  })

  test("inserts before anchor", () => {
    const parent = createNode("box")
    const a = createNode("box")
    const b = createNode("box")
    const c = createNode("box")
    insertChild(parent, a)
    insertChild(parent, c)
    insertChild(parent, b, c) // insert b before c
    expect(parent.children).toEqual([a, b, c])
  })

  test("appends if anchor not found", () => {
    const parent = createNode("box")
    const a = createNode("box")
    const b = createNode("box")
    const notChild = createNode("box")
    insertChild(parent, a)
    insertChild(parent, b, notChild) // notChild isn't in parent
    expect(parent.children).toEqual([a, b])
  })
})

describe("removeChild", () => {
  test("removes child from parent", () => {
    const parent = createNode("box")
    const child = createNode("box")
    insertChild(parent, child)
    removeChild(parent, child)
    expect(parent.children).toHaveLength(0)
    expect(child.parent).toBeNull()
  })

  test("removes correct child from siblings", () => {
    const parent = createNode("box")
    const a = createNode("box")
    const b = createNode("box")
    const c = createNode("box")
    insertChild(parent, a)
    insertChild(parent, b)
    insertChild(parent, c)
    removeChild(parent, b)
    expect(parent.children).toEqual([a, c])
  })

  test("no-op if child not in parent", () => {
    const parent = createNode("box")
    const notChild = createNode("box")
    removeChild(parent, notChild) // should not crash
    expect(parent.children).toHaveLength(0)
  })
})

describe("parseColor", () => {
  test("returns 0 for undefined", () => {
    expect(parseColor(undefined)).toBe(0)
  })

  test("passes through numeric color", () => {
    expect(parseColor(0xff0000ff)).toBe(0xff0000ff)
  })

  test("parses 6-digit hex string", () => {
    expect(parseColor("#ff0000")).toBe(0xff0000ff)
    expect(parseColor("#00ff00")).toBe(0x00ff00ff)
  })

  test("parses 8-digit hex string with alpha", () => {
    expect(parseColor("#ff000080")).toBe(0xff000080)
  })

  test("parses without hash prefix", () => {
    expect(parseColor("ff0000")).toBe(0xff0000ff)
  })

  test("returns 0 for invalid string", () => {
    expect(parseColor("invalid")).toBe(0)
    expect(parseColor("#fff")).toBe(0) // 3-digit not supported
  })
})

describe("parseSizing", () => {
  test("undefined returns null (no explicit sizing)", () => {
    expect(parseSizing(undefined)).toBeNull()
  })

  test("number returns FIXED", () => {
    const s = parseSizing(200)
    expect(s).not.toBeNull()
    expect(s!.type).toBe(SIZING.FIXED)
    expect(s!.value).toBe(200)
  })

  test("'fit' returns FIT", () => {
    expect(parseSizing("fit")!.type).toBe(SIZING.FIT)
  })

  test("'grow' returns GROW", () => {
    expect(parseSizing("grow")!.type).toBe(SIZING.GROW)
  })

  test("percentage returns PERCENT with decimal", () => {
    const s = parseSizing("50%")
    expect(s).not.toBeNull()
    expect(s!.type).toBe(SIZING.PERCENT)
    expect(s!.value).toBeCloseTo(0.5)
  })

  test("100% returns 1.0", () => {
    const s = parseSizing("100%")
    expect(s).not.toBeNull()
    expect(s!.type).toBe(SIZING.PERCENT)
    expect(s!.value).toBeCloseTo(1.0)
  })
})

describe("parseDirection", () => {
  test("'column' returns TOP_TO_BOTTOM", () => {
    expect(parseDirection("column")).toBe(DIRECTION.TOP_TO_BOTTOM)
  })

  test("undefined returns TOP_TO_BOTTOM (column default)", () => {
    expect(parseDirection(undefined)).toBe(DIRECTION.TOP_TO_BOTTOM)
  })

  test("'row' returns LEFT_TO_RIGHT", () => {
    expect(parseDirection("row")).toBe(DIRECTION.LEFT_TO_RIGHT)
  })
})

describe("parseAlignX", () => {
  test("'center' returns CENTER", () => {
    expect(parseAlignX("center")).toBe(ALIGN_X.CENTER)
  })

  test("'right' returns RIGHT", () => {
    expect(parseAlignX("right")).toBe(ALIGN_X.RIGHT)
  })

  test("undefined returns LEFT", () => {
    expect(parseAlignX(undefined)).toBe(ALIGN_X.LEFT)
  })
})

describe("parseAlignY", () => {
  test("'center' returns CENTER", () => {
    expect(parseAlignY("center")).toBe(ALIGN_Y.CENTER)
  })

  test("'bottom' returns BOTTOM", () => {
    expect(parseAlignY("bottom")).toBe(ALIGN_Y.BOTTOM)
  })

  test("undefined returns TOP", () => {
    expect(parseAlignY(undefined)).toBe(ALIGN_Y.TOP)
  })
})

describe("node id and lifecycle", () => {
  test("each node gets a unique id", () => {
    const a = createNode("box")
    const b = createNode("box")
    const c = createNode("text")
    expect(a.id).not.toBe(b.id)
    expect(b.id).not.toBe(c.id)
  })

  test("node starts as not destroyed", () => {
    const node = createNode("box")
    expect(node.destroyed).toBe(false)
  })

  test("removeChild marks node as destroyed", () => {
    const parent = createNode("box")
    const child = createNode("box")
    insertChild(parent, child)
    expect(child.destroyed).toBe(false)
    removeChild(parent, child)
    expect(child.destroyed).toBe(true)
  })

  test("node has default layout rect", () => {
    const node = createNode("box")
    expect(node.layout).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  test("layout rect is mutable", () => {
    const node = createNode("box")
    node.layout.x = 10
    node.layout.y = 20
    node.layout.width = 100
    node.layout.height = 50
    expect(node.layout).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })
})
