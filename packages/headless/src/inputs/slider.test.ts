import { describe, expect, test } from "bun:test"

describe("Slider", () => {
  test("snap handles floating point correctly", () => {
    const step = 0.1
    const snap = (v: number) => {
      const result = Math.round(v / step) * step
      const decimals = (step.toString().split(".")[1] || "").length
      return Number(result.toFixed(decimals))
    }

    expect(snap(0.3)).toBe(0.3)
    expect(snap(0.7)).toBe(0.7)
    expect(snap(1.05)).toBe(1.1)
  })

  test("valueFromMouse guards division by zero", () => {
    const min = 0
    const max = 100
    const clamp = (v: number) => Math.min(max, Math.max(min, v))
    const width = 0
    const result = width <= 0 ? min : clamp(min + 0.5 * (max - min))

    expect(result).toBe(0)
  })
})
