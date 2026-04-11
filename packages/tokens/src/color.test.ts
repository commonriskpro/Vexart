import { describe, expect, test } from "bun:test"
import { rgba, pack, alpha, palette, surface, accent, text, border } from "./color"

describe("pack", () => {
  test("packs RGBA components into u32", () => {
    expect(pack(255, 0, 0, 255)).toBe(0xff0000ff)
    expect(pack(0, 255, 0, 255)).toBe(0x00ff00ff)
    expect(pack(0, 0, 255, 255)).toBe(0x0000ffff)
    expect(pack(0, 0, 0, 0)).toBe(0x00000000)
  })

  test("packs arbitrary values", () => {
    expect(pack(0x12, 0x34, 0x56, 0x78)).toBe(0x12345678)
    expect(pack(0xab, 0xcd, 0xef, 0x01)).toBe(0xabcdef01)
  })

  test("handles max value", () => {
    expect(pack(255, 255, 255, 255)).toBe(0xffffffff)
  })
})

describe("rgba", () => {
  test("unpacks u32 to RGBA components", () => {
    expect(rgba(0xff0000ff)).toEqual([255, 0, 0, 255])
    expect(rgba(0x00ff00ff)).toEqual([0, 255, 0, 255])
    expect(rgba(0x0000ffff)).toEqual([0, 0, 255, 255])
  })

  test("roundtrips with pack", () => {
    const color = pack(123, 45, 67, 200)
    expect(rgba(color)).toEqual([123, 45, 67, 200])
  })

  test("unpacks transparent black", () => {
    expect(rgba(0x00000000)).toEqual([0, 0, 0, 0])
  })
})

describe("alpha", () => {
  test("replaces alpha channel", () => {
    const red = pack(255, 0, 0, 255)
    const halfRed = alpha(red, 128)
    expect(rgba(halfRed)).toEqual([255, 0, 0, 128])
  })

  test("sets to fully transparent", () => {
    const color = pack(100, 200, 50, 255)
    expect(rgba(alpha(color, 0))).toEqual([100, 200, 50, 0])
  })

  test("preserves RGB channels", () => {
    const original = 0xaabbccdd
    const modified = alpha(original, 0x11)
    expect(modified & 0xffffff00).toBe(original & 0xffffff00)
    expect(modified & 0xff).toBe(0x11)
  })
})

describe("palette", () => {
  test("all palette values are packed RGBA with full alpha", () => {
    for (const [name, value] of Object.entries(palette)) {
      if (name === "transparent") {
        expect(value).toBe(0x00000000)
        continue
      }
      const a = value & 0xff
      expect(a).toBe(0xff)
    }
  })

  test("palette colors are distinct", () => {
    const values = Object.values(palette).filter((v) => v !== 0x00000000)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})

describe("semantic tokens", () => {
  test("surface tokens reference palette values", () => {
    expect(surface.void).toBe(palette.void)
    expect(surface.card).toBe(palette.raised)
  })

  test("accent tokens reference palette values", () => {
    expect(accent.thread).toBe(palette.thread)
    expect(accent.anchor).toBe(palette.anchor)
  })

  test("text tokens reference palette values", () => {
    expect(text.primary).toBe(palette.bright)
    expect(text.muted).toBe(palette.muted)
  })

  test("border tokens reference palette values", () => {
    expect(border.subtle).toBe(palette.borderWeak)
    expect(border.focus).toBe(palette.borderFocus)
  })
})
