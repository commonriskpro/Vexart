import { describe, expect, test } from "bun:test"
import { CLASS_NAME_UNKNOWN_BEHAVIOR, mergeClassNameProps, resolveClassName } from "./class-name"

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
