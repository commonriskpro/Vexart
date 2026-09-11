import { describe, expect, test } from "bun:test"
import { darkTheme, getTheme, getThemeVersion, lightTheme, setTheme, themeColors } from "./theme"

describe("theme", () => {
  test("themeColors returns dark values by default", () => {
    setTheme(darkTheme)

    const bg = themeColors.background

    expect(typeof bg).toBe("string")
    expect(bg).toBeTruthy()
  })

  test("setTheme switches colors", () => {
    setTheme(darkTheme)
    const darkBg = themeColors.background

    setTheme(lightTheme)
    const lightBg = themeColors.background

    expect(lightBg).not.toBe(darkBg)
    expect(getTheme()).toBe(lightTheme)

    setTheme(darkTheme)
    expect(themeColors.background).toBe(darkBg)
  })

  test("lightTheme has ringSubtle token", () => {
    setTheme(lightTheme)

    expect(themeColors.ringSubtle).toBeDefined()

    setTheme(darkTheme)
  })

  test("getThemeVersion increments whenever setTheme is called", () => {
    const v1 = getThemeVersion()
    setTheme(lightTheme)
    const v2 = getThemeVersion()
    expect(v2).toBe(v1 + 1)

    setTheme(darkTheme)
    const v3 = getThemeVersion()
    expect(v3).toBe(v2 + 1)
  })
})
