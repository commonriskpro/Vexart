import { describe, expect, test, beforeEach } from "bun:test"
import { CLASS_NAME_UNKNOWN_BEHAVIOR, clearClassNameCache, createStyles, mergeClassNameProps, resolveClassName } from "./class-name"

beforeEach(() => {
  clearClassNameCache()
})

describe("resolveClassName", () => {
  test("maps layout spacing sizing and colors to Vexart props", () => {
    const result = resolveClassName("flex-row items-center justify-between gap-3 p-4 w-full h-grow rounded-xl border border-border bg-card text-sm text-muted-foreground font-semibold shadow-lg")

    expect(result.diagnostics).toEqual([])
    expect(result.props).toMatchObject({
      direction: "row",
      alignY: "center",
      alignX: "space-between",
      gap: 12,
      padding: 16,
      width: "100%",
      height: "grow",
      cornerRadius: 14,
      borderWidth: 1,
      borderColor: "#ffffff25",
      backgroundColor: "#171717",
      color: "#a3a3a3",
      fontSize: 12,
      fontWeight: 600,
    })
    expect(result.props.shadow).toBeTruthy()
  })

  test("maps hover active and focus variants to interactive styles", () => {
    const result = resolveClassName("hover:bg-accent active:opacity-80 focus:border-ring")

    expect(result.props.hoverStyle).toEqual({ backgroundColor: "#262626" })
    expect(result.props.activeStyle).toEqual({ opacity: 0.8 })
    expect(result.props.focusStyle).toEqual({ borderColor: "#737373" })
  })

  test("reports unsupported classes and can throw", () => {
    const result = resolveClassName("grid grid-cols-3")

    expect(result.diagnostics.map((diagnostic) => diagnostic.className)).toEqual(["grid", "grid-cols-3"])
    expect(() => resolveClassName("grid", { unknownClass: CLASS_NAME_UNKNOWN_BEHAVIOR.ERROR })).toThrow("Unsupported Vexart class: grid")
  })

  test("explicit props override className props", () => {
    const props = mergeClassNameProps({ padding: 2, backgroundColor: "#ffffff" }, "p-4 bg-card")

    expect(props.padding).toBe(2)
    expect(props.backgroundColor).toBe("#ffffff")
  })
})

describe("cache", () => {
  test("returns same reference on cache hit", () => {
    const a = resolveClassName("p-4 bg-card")
    const b = resolveClassName("p-4 bg-card")

    expect(a).toBe(b)
  })

  test("clearClassNameCache invalidates cached results", () => {
    const a = resolveClassName("p-4")
    clearClassNameCache()
    const b = resolveClassName("p-4")

    expect(a).not.toBe(b)
    expect(a.props).toEqual(b.props)
  })

  test("skips cache when options are provided", () => {
    const a = resolveClassName("p-4")
    const b = resolveClassName("p-4", { unknownClass: "warn" })

    expect(a).not.toBe(b)
  })
})

describe("backdrop filters", () => {
  test("backdrop-blur matches Tailwind v4 sizes", () => {
    expect(resolveClassName("backdrop-blur").props.backdropBlur).toBe(8)
    expect(resolveClassName("backdrop-blur-none").props.backdropBlur).toBe(0)
    expect(resolveClassName("backdrop-blur-xs").props.backdropBlur).toBe(4)
    expect(resolveClassName("backdrop-blur-sm").props.backdropBlur).toBe(8)
    expect(resolveClassName("backdrop-blur-md").props.backdropBlur).toBe(12)
    expect(resolveClassName("backdrop-blur-lg").props.backdropBlur).toBe(16)
    expect(resolveClassName("backdrop-blur-xl").props.backdropBlur).toBe(24)
    expect(resolveClassName("backdrop-blur-2xl").props.backdropBlur).toBe(40)
    expect(resolveClassName("backdrop-blur-3xl").props.backdropBlur).toBe(64)
  })

  test("backdrop-brightness and backdrop-contrast", () => {
    expect(resolveClassName("backdrop-brightness-150").props.backdropBrightness).toBe(150)
    expect(resolveClassName("backdrop-contrast-120").props.backdropContrast).toBe(120)
    expect(resolveClassName("backdrop-saturate-200").props.backdropSaturate).toBe(200)
  })

  test("backdrop-grayscale backdrop-invert backdrop-sepia default to 100", () => {
    expect(resolveClassName("backdrop-grayscale").props.backdropGrayscale).toBe(100)
    expect(resolveClassName("backdrop-invert").props.backdropInvert).toBe(100)
    expect(resolveClassName("backdrop-sepia").props.backdropSepia).toBe(100)
  })

  test("backdrop-grayscale backdrop-invert backdrop-sepia accept numeric values", () => {
    expect(resolveClassName("backdrop-grayscale-50").props.backdropGrayscale).toBe(50)
    expect(resolveClassName("backdrop-invert-65").props.backdropInvert).toBe(65)
    expect(resolveClassName("backdrop-sepia-30").props.backdropSepia).toBe(30)
    expect(resolveClassName("backdrop-grayscale-0").props.backdropGrayscale).toBe(0)
    expect(resolveClassName("backdrop-invert-0").props.backdropInvert).toBe(0)
  })

  test("backdrop-hue-rotate accepts degrees", () => {
    expect(resolveClassName("backdrop-hue-rotate-180").props.backdropHueRotate).toBe(180)
  })

  test("backdrop filters work with interactive variants", () => {
    const result = resolveClassName("hover:backdrop-blur-lg")

    expect(result.props.hoverStyle).toEqual({ backdropBlur: 16 })
  })
})

describe("glow", () => {
  test("glow-ring maps to glows.ring token", () => {
    const result = resolveClassName("glow-ring")

    expect(result.props.glow).toBeTruthy()
    expect((result.props.glow as { radius: number }).radius).toBe(6)
  })

  test("glow-none clears glow", () => {
    const result = resolveClassName("glow-none")

    expect(result.props.glow).toBeUndefined()
  })
})

describe("flex grow/shrink", () => {
  test("grow and shrink utilities", () => {
    expect(resolveClassName("grow").props.flexGrow).toBe(1)
    expect(resolveClassName("grow-0").props.flexGrow).toBe(0)
    expect(resolveClassName("shrink").props.flexShrink).toBe(1)
    expect(resolveClassName("shrink-0").props.flexShrink).toBe(0)
  })
})

describe("z-index", () => {
  test("z-{n} maps to zIndex", () => {
    expect(resolveClassName("z-10").props.zIndex).toBe(10)
    expect(resolveClassName("z-50").props.zIndex).toBe(50)
  })
})

describe("scroll / overflow", () => {
  test("overflow-scroll enables both axes", () => {
    const result = resolveClassName("overflow-scroll")

    expect(result.props.scrollX).toBe(true)
    expect(result.props.scrollY).toBe(true)
  })

  test("overflow-y-scroll enables only vertical", () => {
    const result = resolveClassName("overflow-y-scroll")

    expect(result.props.scrollY).toBe(true)
    expect(result.props.scrollX).toBeUndefined()
  })
})

describe("layer", () => {
  test("layer enables compositing layer", () => {
    expect(resolveClassName("layer").props.layer).toBe(true)
  })
})

describe("createStyles", () => {
  test("returns string keys that resolve via resolveClassName", () => {
    const s = createStyles({
      card: { padding: 24, cornerRadius: 14 },
      title: { fontSize: 20, fontWeight: 700 },
    })

    expect(typeof s.card).toBe("string")
    expect(typeof s.title).toBe("string")

    const cardResult = resolveClassName(s.card)
    expect(cardResult.diagnostics).toEqual([])
    expect(cardResult.props).toMatchObject({ padding: 24, cornerRadius: 14 })

    const titleResult = resolveClassName(s.title)
    expect(titleResult.props).toMatchObject({ fontSize: 20, fontWeight: 700 })
  })

  test("createStyles compose with utility classes", () => {
    const s = createStyles({
      base: { padding: 16, cornerRadius: 8 },
    })

    const result = resolveClassName(`${s.base} bg-card hover:bg-accent`)

    expect(result.diagnostics).toEqual([])
    expect(result.props.padding).toBe(16)
    expect(result.props.cornerRadius).toBe(8)
    expect(result.props.backgroundColor).toBeTruthy()
    expect(result.props.hoverStyle).toBeTruthy()
  })

  test("different createStyles calls produce unique keys", () => {
    const a = createStyles({ box: { padding: 4 } })
    const b = createStyles({ box: { padding: 8 } })

    expect(a.box).not.toBe(b.box)
    expect(resolveClassName(a.box).props.padding).toBe(4)
    expect(resolveClassName(b.box).props.padding).toBe(8)
  })
})
