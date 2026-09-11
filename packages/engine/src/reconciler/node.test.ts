import { afterEach, describe, expect, spyOn, test } from "bun:test"
import {
  createNode,
  createTextNode,
  insertChild,
  removeChild,
  parseColor,
  getColorCacheSize,
  clearColorCache,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
  resolveProps,
  setClassNameResolver,
  getClassNameResolver,
  bumpThemeEpoch,
  getThemeEpoch,
} from "../ffi/node"
// Constants mirror layout adapter values for parser compatibility.
const SIZING = { FIT: 0, GROW: 1, PERCENT: 2, FIXED: 3 } as const
const DIRECTION = { LEFT_TO_RIGHT: 0, TOP_TO_BOTTOM: 1 } as const
const ALIGN_X = { LEFT: 0, RIGHT: 1, CENTER: 2, SPACE_BETWEEN: 3 } as const
const ALIGN_Y = { TOP: 0, BOTTOM: 1, CENTER: 2, SPACE_BETWEEN: 3 } as const

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

  test("moves existing child before anchor without duplicating it", () => {
    const parent = createNode("box")
    const a = createNode("box")
    const b = createNode("box")
    const c = createNode("box")
    insertChild(parent, a)
    insertChild(parent, b)
    insertChild(parent, c)

    insertChild(parent, c, a)

    expect(parent.children).toEqual([c, a, b])
    expect(parent.children.filter((child) => child === c)).toHaveLength(1)
    expect(c.parent).toBe(parent)
    expect(c.destroyed).toBe(false)
  })

  test("reparents existing child without marking it destroyed", () => {
    const first = createNode("box")
    const second = createNode("box")
    const child = createNode("box")
    insertChild(first, child)

    insertChild(second, child)

    expect(first.children).toEqual([])
    expect(second.children).toEqual([child])
    expect(child.parent).toBe(second)
    expect(child.destroyed).toBe(false)
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
    expect(parseColor("notacolor")).toBe(0)
  })

  test("parses 3-digit hex string", () => {
    expect(parseColor("#f00")).toBe(0xff0000ff)
    expect(parseColor("#0f0")).toBe(0x00ff00ff)
    expect(parseColor("#fff")).toBe(0xffffffff)
    expect(parseColor("fff")).toBe(0xffffffff)
  })

  test("parses 4-digit hex string with alpha", () => {
    expect(parseColor("#f008")).toBe(0xff000088)
    expect(parseColor("#0000")).toBe(0x00000000)
    expect(parseColor("f008")).toBe(0xff000088)
  })

  test("returns 0 for non-hex characters in 3/4/6/8-character strings", () => {
    expect(parseColor("#xyz")).toBe(0)
    expect(parseColor("#xyz8")).toBe(0)
    expect(parseColor("#xyzxyz")).toBe(0)
    expect(parseColor("#xyzxyzxy")).toBe(0)
    expect(parseColor("xyz")).toBe(0)
    expect(parseColor("xyz8")).toBe(0)
    expect(parseColor("xyzxyz")).toBe(0)
    expect(parseColor("xyzxyzxy")).toBe(0)
  })

  test("cache size never exceeds 512 even when parsing 600 distinct color strings", () => {
    clearColorCache()
    expect(getColorCacheSize()).toBe(0)

    for (let i = 0; i < 600; i++) {
      parseColor(`#${i.toString(16).padStart(6, "0")}`)
      expect(getColorCacheSize()).toBeLessThanOrEqual(512)
    }

    expect(getColorCacheSize()).toBe(512)
  })

  test("LRU refresh behavior preserves frequently accessed colors from eviction", () => {
    clearColorCache()
    const spy = spyOn(globalThis, "parseInt")
    try {
      for (let i = 0; i < 512; i++) {
        parseColor(`#${i.toString(16).padStart(6, "0")}`)
      }
      expect(getColorCacheSize()).toBe(512)

      // Access #000000 to refresh its LRU recency
      spy.mockClear()
      parseColor("#000000")
      expect(spy).not.toHaveBeenCalled()

      // Add a 513th color to trigger eviction of the oldest entry
      parseColor("#ffffff")
      expect(getColorCacheSize()).toBe(512)

      // #000000 was refreshed, so it should still be in cache (no parseInt call)
      spy.mockClear()
      parseColor("#000000")
      expect(spy).not.toHaveBeenCalled()

      // #000001 was the oldest unrefreshed entry, so it should have been evicted (parseInt called)
      spy.mockClear()
      parseColor("#000001")
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
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

  test("'auto' returns FIT and 'fill' returns GROW", () => {
    expect(parseSizing("auto")!.type).toBe(SIZING.FIT)
    expect(parseSizing("fill")!.type).toBe(SIZING.GROW)
  })

  test("pixel string parses to FIXED", () => {
    const s = parseSizing("200px")
    expect(s).not.toBeNull()
    expect(s!.type).toBe(SIZING.FIXED)
    expect(s!.value).toBe(200)
  })

  test("invalid percentage returns null without NaN poisoning", () => {
    expect(parseSizing("xyz%")).toBeNull()
  })

  test("invalid pixel string returns null", () => {
    expect(parseSizing("badpx")).toBeNull()
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

describe("resolveProps aliases", () => {
  test("onClick is resolved to onPress when onPress is absent", () => {
    const node = createNode("box")
    let clicked = false
    node.props = { onClick: () => { clicked = true } }
    const resolved = resolveProps(node)
    expect(resolved.onPress).toBeDefined()
    resolved.onPress!()
    expect(clicked).toBe(true)
  })

  test("onPress takes precedence over onClick when both are provided", () => {
    const node = createNode("box")
    let which = ""
    node.props = {
      onPress: () => { which = "press" },
      onClick: () => { which = "click" },
    }
    const resolved = resolveProps(node)
    expect(resolved.onPress).toBeDefined()
    resolved.onPress!()
    expect(which).toBe("press")
  })
})

describe("className resolution and theme epoch caching", () => {
  afterEach(() => {
    setClassNameResolver(null)
  })

  test("resolves className via globalClassNameResolver", () => {
    setClassNameResolver((cls) => {
      if (cls === "p-4 bg-red") return { padding: 16, backgroundColor: 0xff0000ff }
      return {}
    })
    const node = createNode("box")
    node.props = { className: "p-4 bg-red" }
    const resolved = resolveProps(node)
    expect(resolved.padding).toBe(16)
    expect(resolved.backgroundColor).toBe(0xff0000ff)
  })

  test("direct props override className and style props", () => {
    setClassNameResolver(() => ({
      padding: 10,
      backgroundColor: 0x111111ff,
    }))
    const node = createNode("box")
    node.props = {
      className: "dummy",
      style: { backgroundColor: 0x222222ff, cornerRadius: 8 },
      backgroundColor: 0x333333ff,
    }
    const resolved = resolveProps(node)
    expect(resolved.padding).toBe(10)
    expect(resolved.cornerRadius).toBe(8)
    expect(resolved.backgroundColor).toBe(0x333333ff)
  })

  test("caches resolved props and invalidates on bumpThemeEpoch", () => {
    let callCount = 0
    setClassNameResolver(() => {
      callCount++
      return { padding: 20 }
    })
    const node = createNode("box")
    node.props = { className: "card" }

    const first = resolveProps(node)
    expect(callCount).toBe(1)
    expect(first.padding).toBe(20)

    const second = resolveProps(node)
    expect(callCount).toBe(1)
    expect(second).toBe(first)

    bumpThemeEpoch()
    const third = resolveProps(node)
    expect(callCount).toBe(2)
    expect(third.padding).toBe(20)
  })

  test("deep merges interactive styles from className, style, and direct props (DEF-08)", () => {
    setClassNameResolver(() => ({
      hoverStyle: { backgroundColor: 0x111111ff, cornerRadius: 4 },
      activeStyle: { backgroundColor: 0x222222ff },
      focusStyle: { borderColor: 0x333333ff, borderWidth: 1 },
    }))
    const node = createNode("box")
    node.props = {
      className: "btn",
      style: {
        hoverStyle: { cornerRadius: 8, opacity: 0.8 },
      },
      hoverStyle: { opacity: 0.9, glow: { radius: 5, color: 0xffffffff } },
      activeStyle: { opacity: 0.5 },
      focusStyle: { borderWidth: 2 },
    }

    const resolved = resolveProps(node)
    expect(resolved.hoverStyle).toEqual({
      backgroundColor: 0x111111ff,
      cornerRadius: 8,
      opacity: 0.9,
      glow: { radius: 5, color: 0xffffffff },
    })
    expect(resolved.activeStyle).toEqual({
      backgroundColor: 0x222222ff,
      opacity: 0.5,
    })
    expect(resolved.focusStyle).toEqual({
      borderColor: 0x333333ff,
      borderWidth: 2,
    })

    node._hovered = true
    node._vpDirty = true
    const hovered = resolveProps(node)
    expect(hovered.opacity).toBe(0.9)
    expect(hovered.cornerRadius).toBe(8)
    expect(hovered.backgroundColor).toBe(0x111111ff)
  })
})
