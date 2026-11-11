import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { createEffect, createRoot } from "solid-js"
import { getClassNameResolver } from "@vexart/engine/internal"
import { darkTheme, lightTheme, setTheme, voidThemeTokenResolver } from "@vexart/styled"
import {
  CLASS_NAME_UNKNOWN_BEHAVIOR,
  clearClassNameCache,
  createStyles,
  getClassNameCacheSize,
  MAX_CLASS_NAME_CACHE_SIZE,
  mergeClassNameProps,
  resolveClassName,
} from "./class-name"
import { setThemeTokenResolver } from "./theme-resolver"

beforeEach(() => {
  setThemeTokenResolver(voidThemeTokenResolver)
  setTheme(darkTheme)
  clearClassNameCache()
})

afterEach(() => {
  setThemeTokenResolver(voidThemeTokenResolver)
  setTheme(darkTheme)
  clearClassNameCache()
})

describe("universal fallbacks without resolver", () => {
  test("resolves default typography, spacing, radii and universal colors when no resolver is registered", () => {
    setThemeTokenResolver(null)
    clearClassNameCache()

    const result = resolveClassName("text-sm font-semibold rounded-lg p-4 text-white bg-black border-transparent")
    expect(result.diagnostics).toEqual([])
    expect(result.props).toMatchObject({
      fontSize: 12,
      fontWeight: 600,
      cornerRadius: 10,
      padding: 16,
      color: "#ffffff",
      backgroundColor: "#000000",
      borderColor: "#00000000",
    })
  })
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
      borderColor: "#ffffff1f",
      backgroundColor: "#121216",
      color: "#a1a1aa",
      fontSize: 12,
      fontWeight: 600,
    })
    expect(result.props.shadow).toBeTruthy()
  })

  test("maps hover active and focus variants to interactive styles", () => {
    const result = resolveClassName("hover:bg-accent active:opacity-80 focus:border-ring")

    expect(result.props.hoverStyle).toEqual({ backgroundColor: "#272730" })
    expect(result.props.activeStyle).toEqual({ opacity: 0.8 })
    expect(result.props.focusStyle).toEqual({ borderColor: "#a1a1aa" })
  })

  test("reports unsupported classes and can throw", () => {
    const result = resolveClassName("unknown-foo unknown-bar")

    expect(result.diagnostics.map((diagnostic) => diagnostic.className)).toEqual(["unknown-foo", "unknown-bar"])
    expect(() => resolveClassName("unknown-foo", { unknownClass: CLASS_NAME_UNKNOWN_BEHAVIOR.ERROR })).toThrow("Unsupported Vexart class: unknown-foo")
  })

  test("explicit props override className props", () => {
    const props = mergeClassNameProps({ padding: 2, backgroundColor: "#ffffff" }, "p-4 bg-card")

    expect(props.padding).toBe(2)
    expect(props.backgroundColor).toBe("#ffffff")
  })

  test("resolves flex presets (flex-1, flex-auto, flex-initial, flex-none)", () => {
    expect(resolveClassName("flex-1").props).toMatchObject({ flexGrow: 1, flexShrink: 1, flexBasis: 0 })
    expect(resolveClassName("flex-auto").props).toMatchObject({ flexGrow: 1, flexShrink: 1 })
    expect(resolveClassName("flex-initial").props).toMatchObject({ flexGrow: 0, flexShrink: 1 })
    expect(resolveClassName("flex-none").props).toMatchObject({ flexGrow: 0, flexShrink: 0 })
    expect(resolveClassName("items-stretch").props).toMatchObject({ alignY: "stretch" })
    expect(resolveClassName("justify-around").props).toMatchObject({ alignX: "space-around" })
    expect(resolveClassName("justify-evenly").props).toMatchObject({ alignX: "space-evenly" })
  })

  test("resolves grid, grid-cols-1..12, and col-span-1..12", () => {
    const container = resolveClassName("grid grid-cols-3 gap-x-4 gap-y-2")
    expect(container.diagnostics).toEqual([])
    expect(container.props).toMatchObject({
      layout: "grid",
      gridTemplateColumns: [{ fr: 1 }, { fr: 1 }, { fr: 1 }],
      columnGap: 16,
      rowGap: 8,
    })

    const span = resolveClassName("col-span-2")
    expect(span.diagnostics).toEqual([])
    expect(span.props.gridColumn).toEqual({ end: { span: 2 } })

    const twelve = resolveClassName("grid-cols-12 col-span-12")
    expect(twelve.diagnostics).toEqual([])
    expect(twelve.props.gridTemplateColumns).toHaveLength(12)
    expect(twelve.props.gridColumn).toEqual({ end: { span: 12 } })

    const invalid = resolveClassName("grid-cols-13 col-span-0")
    expect(invalid.diagnostics.map((d) => d.className)).toEqual(["grid-cols-13", "col-span-0"])
  })

  test("resolves directional borders and directional corner radii", () => {
    const borders = resolveClassName("border-t border-b-2 border-l-4 border-r-[3px]")
    expect(borders.diagnostics).toEqual([])
    expect(borders.props).toMatchObject({
      borderTop: 1,
      borderBottom: 2,
      borderLeft: 4,
      borderRight: 3,
    })

    const sideRadii = resolveClassName("rounded-lg rounded-t-none")
    expect(sideRadii.diagnostics).toEqual([])
    expect(sideRadii.props.cornerRadii).toEqual({ tl: 0, tr: 0, br: 10, bl: 10 })

    const cornerRadii = resolveClassName("rounded-tl-xl rounded-br-[12px]")
    expect(cornerRadii.diagnostics).toEqual([])
    expect(cornerRadii.props.cornerRadii).toEqual({ tl: 14, tr: 0, br: 12, bl: 0 })

    const resetRadii = resolveClassName("rounded-t-lg rounded-md")
    expect(resetRadii.props.cornerRadii).toBeUndefined()
    expect(resetRadii.props.cornerRadius).toBe(8)
  })

  test("resolves arbitrary bracket values for spacing, sizing, fontSize, border, and colors", () => {
    const result = resolveClassName("p-[12px] w-[240px] h-[50%] min-w-[100] text-[15px] bg-[#123456] text-[#abcdef] border-[#ff00aa] border-[3px]")
    expect(result.diagnostics).toEqual([])
    expect(result.props).toMatchObject({
      padding: 12,
      width: 240,
      height: "50%",
      minWidth: 100,
      fontSize: 15,
      backgroundColor: "#123456",
      color: "#abcdef",
      borderColor: "#ff00aa",
      borderWidth: 3,
    })
  })

  test("resolves Tailwind palette colors and /opacity modifiers", () => {
    const result = resolveClassName("bg-zinc-900 text-emerald-500 border-red-500/50 hover:bg-blue-500/20")
    expect(result.diagnostics).toEqual([])
    expect(result.props).toMatchObject({
      backgroundColor: "#18181b",
      color: "#10b981",
      borderColor: "#ef444480",
      hoverStyle: { backgroundColor: "#3b82f633" },
    })

    const bracketAlpha = resolveClassName("bg-[#112233]/50")
    expect(bracketAlpha.diagnostics).toEqual([])
    expect(bracketAlpha.props.backgroundColor).toBe("#11223380")

    const invalidOpacity = resolveClassName("bg-zinc-900/150 bg-zinc-900/")
    expect(invalidOpacity.diagnostics.map((d) => d.className)).toEqual(["bg-zinc-900/150", "bg-zinc-900/"])
  })

  test("resolves text alignment, truncate, italic, and not-italic", () => {
    expect(resolveClassName("text-left").props.alignX).toBe("left")
    expect(resolveClassName("text-center").props.alignX).toBe("center")
    expect(resolveClassName("text-right").props.alignX).toBe("right")
    expect(resolveClassName("truncate").props).toMatchObject({ whiteSpace: "nowrap", wordBreak: "keep-all" })
    expect(resolveClassName("italic").props.fontStyle).toBe("italic")
    expect(resolveClassName("not-italic").props.fontStyle).toBe("normal")
  })

  test("resolves leading-* lineHeight utilities (named multipliers, numeric scale, and brackets)", () => {
    expect(resolveClassName("leading-none").props.lineHeight).toBe(1)
    expect(resolveClassName("leading-tight").props.lineHeight).toBe(1.25)
    expect(resolveClassName("leading-snug").props.lineHeight).toBe(1.375)
    expect(resolveClassName("leading-normal").props.lineHeight).toBe(1.5)
    expect(resolveClassName("leading-relaxed").props.lineHeight).toBe(1.625)
    expect(resolveClassName("leading-loose").props.lineHeight).toBe(2)

    for (let n = 3; n <= 10; n++) {
      const res = resolveClassName(`leading-${n}`)
      expect(res.diagnostics).toEqual([])
      expect(res.props.lineHeight).toBe(n * 4)
    }

    expect(resolveClassName("leading-[22px]").props.lineHeight).toBe(22)
    expect(resolveClassName("leading-[1.75]").props.lineHeight).toBe(1.75)
    expect(resolveClassName("leading-[2]").props.lineHeight).toBe(2)

    const invalid = resolveClassName("leading-2 leading-11 leading-[0] leading-[abc]")
    expect(invalid.diagnostics.map((d) => d.className)).toEqual(["leading-2", "leading-11", "leading-[0]", "leading-[abc]"])
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

  test("bounded LRU cache never exceeds MAX_CLASS_NAME_CACHE_SIZE (2048) under dynamic class storm", () => {
    expect(getClassNameCacheSize()).toBe(0)
    for (let i = 0; i < 3000; i++) {
      resolveClassName(`p-${i} m-${i}`)
    }
    expect(getClassNameCacheSize()).toBe(MAX_CLASS_NAME_CACHE_SIZE)
    expect(MAX_CLASS_NAME_CACHE_SIZE).toBe(2048)
  })

  test("cache hits refresh LRU order preventing premature eviction", () => {
    // 1. Insert entry A and entry B
    const classA = "p-1"
    const classB = "p-2"
    const resA = resolveClassName(classA)
    const resB = resolveClassName(classB)
    expect(getClassNameCacheSize()).toBe(2)

    // 2. Cache hit on classA refreshes its recency (MRU); classB becomes the oldest (LRU)
    const hitA = resolveClassName(classA)
    expect(hitA).toBe(resA)

    // 3. Fill cache up to capacity (MAX_CLASS_NAME_CACHE_SIZE)
    // Currently cache has [classB (LRU), classA (MRU)].
    // Adding MAX_CLASS_NAME_CACHE_SIZE - 2 items fills cache exactly to capacity.
    for (let i = 0; i < MAX_CLASS_NAME_CACHE_SIZE - 2; i++) {
      resolveClassName(`m-${i}`)
    }
    expect(getClassNameCacheSize()).toBe(MAX_CLASS_NAME_CACHE_SIZE)

    // 4. Trigger eviction by inserting a brand new class
    resolveClassName("trigger-eviction")
    expect(getClassNameCacheSize()).toBe(MAX_CLASS_NAME_CACHE_SIZE)

    // classA was refreshed before the fill, so it was NOT evicted and remains a cache hit
    const survivingA = resolveClassName(classA)
    expect(survivingA).toBe(resA)

    // classB was the oldest (LRU), so it must have been evicted (cache miss gives new reference)
    const newResB = resolveClassName(classB)
    expect(newResB).not.toBe(resB)
  })

  test("clearClassNameCache and theme change reset cache size to 0", () => {
    expect(getClassNameCacheSize()).toBe(0)

    resolveClassName("p-4")
    resolveClassName("p-8")
    expect(getClassNameCacheSize()).toBe(2)

    clearClassNameCache()
    expect(getClassNameCacheSize()).toBe(0)

    resolveClassName("p-4")
    expect(getClassNameCacheSize()).toBe(1)

    // Changing theme triggers cache invalidation on next resolution
    setTheme(lightTheme)
    resolveClassName("p-12")
    // "p-4" was purged on theme version change; "p-12" is the single new entry
    expect(getClassNameCacheSize()).toBe(1)
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

describe("theme reactivity", () => {
  test("resolveClassName reflects updated theme color without manual clearClassNameCache", () => {
    setTheme(darkTheme)
    const darkResult = resolveClassName("bg-card")
    expect(darkResult.props.backgroundColor).toBe(darkTheme.colors.card)

    setTheme(lightTheme)
    const lightResult = resolveClassName("bg-card")
    expect(lightResult.props.backgroundColor).toBe(lightTheme.colors.card)
    expect(lightResult.props.backgroundColor).not.toBe(darkResult.props.backgroundColor)
  })

  test("in a reactive scope, switching theme triggers re-execution and delivers the updated color", async () => {
    setTheme(darkTheme)
    const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

    let disposeRoot: () => void = () => {}
    let observedColor: string | undefined
    let executionCount = 0

    createRoot((dispose) => {
      disposeRoot = dispose
      createEffect(() => {
        const result = resolveClassName("bg-card")
        observedColor = result.props.backgroundColor as string
        executionCount++
      })
    })

    await tick()
    expect(executionCount).toBe(1)
    expect(observedColor).toBe(darkTheme.colors.card)

    setTheme(lightTheme)

    await tick()
    expect(executionCount).toBe(2)
    expect(observedColor).toBe(lightTheme.colors.card)

    disposeRoot()
  })

  test("registers global class name resolver in @vexart/engine on module load", () => {
    const resolver = getClassNameResolver()
    expect(resolver).not.toBeNull()
    const resolved = resolver!("p-4 bg-card")
    expect(resolved.padding).toBe(16)
    expect(resolved.backgroundColor).toBe(darkTheme.colors.card)
  })
})

describe("transitions", () => {
  test("maps transition property classes to default 150ms duration", () => {
    for (const cls of ["transition", "transition-all", "transition-colors", "transition-opacity", "transition-transform"]) {
      const result = resolveClassName(cls)
      expect(result.diagnostics).toEqual([])
      expect(result.props.transition).toBe(150)
    }
  })

  test("maps supported duration-* utilities to exact millisecond values", () => {
    for (const ms of [75, 100, 150, 200, 300, 500, 700, 1000]) {
      const result = resolveClassName(`duration-${ms}`)
      expect(result.diagnostics).toEqual([])
      expect(result.props.transition).toBe(ms)
    }
  })

  test("preserves duration regardless of token order with transition classes", () => {
    const durationFirst = resolveClassName("duration-300 transition-colors")
    const transitionFirst = resolveClassName("transition-colors duration-300")
    const trailingTransition = resolveClassName("transition-colors duration-500 transition-all")

    expect(durationFirst.diagnostics).toEqual([])
    expect(transitionFirst.diagnostics).toEqual([])
    expect(trailingTransition.diagnostics).toEqual([])
    expect(durationFirst.props.transition).toBe(300)
    expect(transitionFirst.props.transition).toBe(300)
    expect(trailingTransition.props.transition).toBe(500)
  })

  test("transition-none disables transitions and interacts cleanly with duration-*", () => {
    const onlyNone = resolveClassName("transition-none")
    expect(onlyNone.diagnostics).toEqual([])
    expect(onlyNone.props.transition).toBe(0)

    const overriddenByNone = resolveClassName("transition duration-300 transition-none")
    expect(overriddenByNone.diagnostics).toEqual([])
    expect(overriddenByNone.props.transition).toBe(0)

    const restoredAfterNone = resolveClassName("transition-none duration-200")
    expect(restoredAfterNone.diagnostics).toEqual([])
    expect(restoredAfterNone.props.transition).toBe(200)
  })

  test("reports diagnostics for unsupported durations and interactive transition variants", () => {
    const result = resolveClassName("duration-999 duration-0 hover:transition hover:duration-300")
    expect(result.diagnostics.map((d) => d.className)).toEqual([
      "duration-999",
      "duration-0",
      "hover:transition",
      "hover:duration-300",
    ])
    expect(result.props.transition).toBeUndefined()
  })
})
