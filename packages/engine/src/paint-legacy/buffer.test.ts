import { describe, expect, test } from "bun:test"
import { create, clear, clearRect, get, set, sub, resize, rgba, pack, alpha } from "./buffer"

describe("create", () => {
  test("creates buffer with correct dimensions", () => {
    const buf = create(10, 20)
    expect(buf.width).toBe(10)
    expect(buf.height).toBe(20)
    expect(buf.stride).toBe(40) // 10 * 4
    expect(buf.data.length).toBe(800) // 10 * 20 * 4
  })

  test("initializes to transparent black", () => {
    const buf = create(4, 4)
    for (let i = 0; i < buf.data.length; i++) {
      expect(buf.data[i]).toBe(0)
    }
  })
})

describe("clear", () => {
  test("clears to transparent black by default", () => {
    const buf = create(4, 4)
    set(buf, 0, 0, 0xff0000ff)
    clear(buf)
    expect(get(buf, 0, 0)).toBe(0)
  })

  test("clears to specified color", () => {
    const buf = create(2, 2)
    clear(buf, 0xff0000ff)
    expect(get(buf, 0, 0)).toBe(0xff0000ff)
    expect(get(buf, 1, 1)).toBe(0xff0000ff)
  })
})

describe("get/set", () => {
  test("sets and gets a pixel", () => {
    const buf = create(10, 10)
    set(buf, 3, 5, 0xaabbccdd)
    expect(get(buf, 3, 5)).toBe(0xaabbccdd)
  })

  test("out-of-bounds get returns 0", () => {
    const buf = create(4, 4)
    expect(get(buf, -1, 0)).toBe(0)
    expect(get(buf, 4, 0)).toBe(0)
    expect(get(buf, 0, 4)).toBe(0)
  })

  test("out-of-bounds set is a no-op", () => {
    const buf = create(4, 4)
    set(buf, -1, 0, 0xff0000ff) // should not crash
    set(buf, 100, 0, 0xff0000ff)
    expect(get(buf, 0, 0)).toBe(0)
  })

  test("pixels are independent", () => {
    const buf = create(4, 4)
    set(buf, 0, 0, 0xff0000ff)
    set(buf, 1, 0, 0x00ff00ff)
    expect(get(buf, 0, 0)).toBe(0xff0000ff)
    expect(get(buf, 1, 0)).toBe(0x00ff00ff)
    expect(get(buf, 2, 0)).toBe(0)
  })
})

describe("clearRect", () => {
  test("clears a rectangular region", () => {
    const buf = create(10, 10)
    clear(buf, 0xffffffff)
    clearRect(buf, 2, 2, 3, 3, 0x00000000)
    // Inside the rect: cleared
    expect(get(buf, 2, 2)).toBe(0x00000000)
    expect(get(buf, 4, 4)).toBe(0x00000000)
    // Outside the rect: untouched
    expect(get(buf, 0, 0)).toBe(0xffffffff)
    expect(get(buf, 5, 5)).toBe(0xffffffff)
  })

  test("clamps to buffer bounds", () => {
    const buf = create(4, 4)
    // Should not crash even with out-of-bounds rect
    clearRect(buf, -2, -2, 10, 10, 0xff0000ff)
    expect(get(buf, 0, 0)).toBe(0xff0000ff)
    expect(get(buf, 3, 3)).toBe(0xff0000ff)
  })
})

describe("sub", () => {
  test("extracts a sub-region as a new buffer", () => {
    const buf = create(10, 10)
    set(buf, 3, 3, 0xff0000ff)
    set(buf, 4, 4, 0x00ff00ff)

    const s = sub(buf, 3, 3, 3, 3)
    expect(s.width).toBe(3)
    expect(s.height).toBe(3)
    expect(get(s, 0, 0)).toBe(0xff0000ff)
    expect(get(s, 1, 1)).toBe(0x00ff00ff)
    expect(get(s, 2, 2)).toBe(0)
  })

  test("sub is a copy — modifying original doesn't affect sub", () => {
    const buf = create(4, 4)
    set(buf, 0, 0, 0xff0000ff)
    const s = sub(buf, 0, 0, 2, 2)
    set(buf, 0, 0, 0x00ff00ff)
    expect(get(s, 0, 0)).toBe(0xff0000ff) // unchanged
  })
})

describe("resize", () => {
  test("copies pixels that fit into new buffer", () => {
    const buf = create(4, 4)
    set(buf, 0, 0, 0xff0000ff)
    set(buf, 3, 3, 0x00ff00ff)

    const resized = resize(buf, 6, 6)
    expect(resized.width).toBe(6)
    expect(resized.height).toBe(6)
    expect(get(resized, 0, 0)).toBe(0xff0000ff)
    expect(get(resized, 3, 3)).toBe(0x00ff00ff)
    expect(get(resized, 5, 5)).toBe(0) // new area is clear
  })

  test("shrinking clips content", () => {
    const buf = create(4, 4)
    set(buf, 3, 3, 0xff0000ff)

    const resized = resize(buf, 2, 2)
    expect(resized.width).toBe(2)
    expect(get(resized, 0, 0)).toBe(0)
    // pixel (3,3) is outside new bounds
  })
})

describe("color helpers", () => {
  test("rgba unpacks correctly", () => {
    expect(rgba(0xff0000ff)).toEqual([255, 0, 0, 255])
  })

  test("pack roundtrips with rgba", () => {
    const c = pack(42, 128, 200, 99)
    expect(rgba(c)).toEqual([42, 128, 200, 99])
  })

  test("alpha modifies only alpha channel", () => {
    const c = pack(10, 20, 30, 255)
    expect(rgba(alpha(c, 100))).toEqual([10, 20, 30, 100])
  })
})
