import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { darkTheme, getTheme, lightTheme, onThemeChange, setTheme, themeColors, ThemeProvider } from "./theme"

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

  test("onThemeChange notifies listeners and allows unsubscription", () => {
    let callCount = 0
    const unsub = onThemeChange(() => {
      callCount++
    })

    setTheme(lightTheme)
    expect(callCount).toBe(1)

    setTheme(darkTheme)
    expect(callCount).toBe(2)

    unsub()
    setTheme(lightTheme)
    expect(callCount).toBe(2)

    setTheme(darkTheme)
  })

  test("ThemeProvider restores previous theme on cleanup", () => {
    setTheme(darkTheme)
    expect(getTheme()).toBe(darkTheme)

    createRoot((dispose) => {
      ThemeProvider({
        theme: lightTheme,
        children: null,
      })

      expect(getTheme()).toBe(lightTheme)
      dispose()
    })

    expect(getTheme()).toBe(darkTheme)
  })
})
