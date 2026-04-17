import { describe, expect, test } from "bun:test"
import { create, set, get, clear } from "./buffer"
import { over, withOpacity } from "./composite"

describe("over", () => {
  test("composites opaque pixel", () => {
    const dst = create(4, 4)
    clear(dst, 0x00ff00ff)
    const src = create(2, 2)
    set(src, 0, 0, 0xff0000ff)

    over(dst, src, 0, 0)

    // Opaque red replaces green
    expect(get(dst, 0, 0)).toBe(0xff0000ff)
    // Untouched pixel stays green
    expect(get(dst, 2, 0)).toBe(0x00ff00ff)
  })

  test("skips transparent pixels", () => {
    const dst = create(4, 4)
    clear(dst, 0x00ff00ff)
    const src = create(2, 2)
    // src is all transparent (default)

    over(dst, src, 0, 0)
    expect(get(dst, 0, 0)).toBe(0x00ff00ff) // unchanged
  })

  test("composites at offset", () => {
    const dst = create(4, 4)
    const src = create(2, 2)
    set(src, 0, 0, 0xff0000ff)

    over(dst, src, 2, 2)

    expect(get(dst, 2, 2)).toBe(0xff0000ff)
    expect(get(dst, 0, 0)).toBe(0) // untouched
  })

  test("clips to dst bounds", () => {
    const dst = create(4, 4)
    const src = create(4, 4)
    clear(src, 0xff0000ff)

    // Offset src partially outside dst — should not crash
    over(dst, src, 2, 2)

    expect(get(dst, 2, 2)).toBe(0xff0000ff)
    expect(get(dst, 3, 3)).toBe(0xff0000ff)
    expect(get(dst, 0, 0)).toBe(0) // outside src placement
  })
})

describe("withOpacity", () => {
  test("opacity 0 does nothing", () => {
    const dst = create(4, 4)
    clear(dst, 0x00ff00ff)
    const src = create(2, 2)
    set(src, 0, 0, 0xff0000ff)

    withOpacity(dst, src, 0, 0, 0)
    expect(get(dst, 0, 0)).toBe(0x00ff00ff) // unchanged
  })

  test("opacity 1 is same as over", () => {
    const dst1 = create(4, 4)
    clear(dst1, 0x00ff00ff)
    const dst2 = create(4, 4)
    clear(dst2, 0x00ff00ff)
    const src = create(2, 2)
    set(src, 0, 0, 0xff0000ff)

    over(dst1, src, 0, 0)
    withOpacity(dst2, src, 0, 0, 1)

    expect(get(dst1, 0, 0)).toBe(get(dst2, 0, 0))
  })
})
