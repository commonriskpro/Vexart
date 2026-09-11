import { describe, test, expect } from "bun:test"
import {
  sumOverlapArea,
  intersectRect,
  unionRect,
  expandRect,
  translateRect,
  rectArea,
  rectRight,
  rectBottom,
  isEmptyRect,
  type DamageRect,
} from "./damage"

describe("damage helpers", () => {
  describe("rectRight and rectBottom", () => {
    test("calculates right and bottom bounds correctly", () => {
      const rect: DamageRect = { x: 10, y: 20, width: 30, height: 40 }
      expect(rectRight(rect)).toBe(40)
      expect(rectBottom(rect)).toBe(60)
    })
  })

  describe("isEmptyRect", () => {
    test("identifies empty, null, or zero-dimension rects", () => {
      expect(isEmptyRect(null)).toBe(true)
      expect(isEmptyRect(undefined)).toBe(true)
      expect(isEmptyRect({ x: 0, y: 0, width: 0, height: 10 })).toBe(true)
      expect(isEmptyRect({ x: 0, y: 0, width: 10, height: 0 })).toBe(true)
      expect(isEmptyRect({ x: 0, y: 0, width: -5, height: 10 })).toBe(true)
      expect(isEmptyRect({ x: 0, y: 0, width: 10, height: 10 })).toBe(false)
    })
  })

  describe("rectArea", () => {
    test("returns 0 for null or undefined", () => {
      expect(rectArea(null)).toBe(0)
      expect(rectArea(undefined)).toBe(0)
    })

    test("returns 0 for rects with zero or negative dimensions", () => {
      expect(rectArea({ x: 10, y: 10, width: 0, height: 50 })).toBe(0)
      expect(rectArea({ x: 10, y: 10, width: 50, height: 0 })).toBe(0)
      expect(rectArea({ x: 10, y: 10, width: -10, height: 50 })).toBe(0)
      expect(rectArea({ x: 10, y: 10, width: 50, height: -20 })).toBe(0)
    })

    test("returns correct area for valid rects", () => {
      expect(rectArea({ x: 0, y: 0, width: 10, height: 20 })).toBe(200)
      expect(rectArea({ x: 50, y: 100, width: 100, height: 100 })).toBe(10000)
    })
  })

  describe("intersectRect", () => {
    test("returns intersection for overlapping rects", () => {
      const a: DamageRect = { x: 0, y: 0, width: 20, height: 20 }
      const b: DamageRect = { x: 10, y: 10, width: 20, height: 20 }
      const intersection = intersectRect(a, b)
      expect(intersection).toEqual({ x: 10, y: 10, width: 10, height: 10 })
    })

    test("returns null for disjoint rects", () => {
      const a: DamageRect = { x: 0, y: 0, width: 10, height: 10 }
      const b: DamageRect = { x: 20, y: 20, width: 10, height: 10 }
      expect(intersectRect(a, b)).toBeNull()
    })

    test("returns null for rects touching only at an edge or corner", () => {
      const a: DamageRect = { x: 0, y: 0, width: 10, height: 10 }
      const b: DamageRect = { x: 10, y: 0, width: 10, height: 10 }
      expect(intersectRect(a, b)).toBeNull()

      const c: DamageRect = { x: 10, y: 10, width: 10, height: 10 }
      expect(intersectRect(a, c)).toBeNull()
    })
  })

  describe("unionRect", () => {
    test("returns minimal bounding box containing both rects", () => {
      const a: DamageRect = { x: 10, y: 20, width: 30, height: 40 }
      const b: DamageRect = { x: 25, y: 15, width: 50, height: 60 }
      const u = unionRect(a, b)
      expect(u).toEqual({
        x: 10,
        y: 15,
        width: 65,
        height: 60,
      })
    })

    test("returns bounding box for disjoint rects", () => {
      const a: DamageRect = { x: 0, y: 0, width: 10, height: 10 }
      const b: DamageRect = { x: 20, y: 30, width: 10, height: 10 }
      expect(unionRect(a, b)).toEqual({ x: 0, y: 0, width: 30, height: 40 })
    })
  })

  describe("expandRect", () => {
    test("expands rect by padding in all directions", () => {
      const rect: DamageRect = { x: 10, y: 20, width: 30, height: 40 }
      expect(expandRect(rect, 5)).toEqual({ x: 5, y: 15, width: 40, height: 50 })
    })

    test("shrinks rect with negative padding", () => {
      const rect: DamageRect = { x: 10, y: 20, width: 30, height: 40 }
      expect(expandRect(rect, -5)).toEqual({ x: 15, y: 25, width: 20, height: 30 })
    })
  })

  describe("translateRect", () => {
    test("translates rect origin by dx and dy", () => {
      const rect: DamageRect = { x: 10, y: 20, width: 30, height: 40 }
      expect(translateRect(rect, 5, -10)).toEqual({ x: 15, y: 10, width: 30, height: 40 })
    })
  })

  describe("sumOverlapArea", () => {
    test("returns 0 for empty array", () => {
      expect(sumOverlapArea([])).toBe(0)
    })

    test("returns 0 for single rect", () => {
      expect(sumOverlapArea([{ x: 0, y: 0, width: 100, height: 100 }])).toBe(0)
    })

    test("returns 0 for disjoint rects", () => {
      const rects: DamageRect[] = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 10, height: 10 },
        { x: 40, y: 40, width: 10, height: 10 },
      ]
      expect(sumOverlapArea(rects)).toBe(0)
    })

    test("returns 0 for rects that touch edges without overlapping", () => {
      const rects: DamageRect[] = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
        { x: 0, y: 10, width: 10, height: 10 },
      ]
      expect(sumOverlapArea(rects)).toBe(0)
    })

    test("returns 0 for invalid or empty rects", () => {
      const rects: DamageRect[] = [
        { x: 0, y: 0, width: 0, height: 10 },
        { x: 0, y: 0, width: 10, height: -5 },
      ]
      expect(sumOverlapArea(rects)).toBe(0)
    })

    test("calculates exact overlap area for 2 overlapping rects", () => {
      const a: DamageRect = { x: 0, y: 0, width: 10, height: 10 }
      const b: DamageRect = { x: 5, y: 5, width: 10, height: 10 }
      // Overlap region: [5, 10] x [5, 10] = 5 x 5 = 25
      expect(sumOverlapArea([a, b])).toBe(25)
    })

    test("calculates exact overlap area for partial horizontal overlap", () => {
      const a: DamageRect = { x: 0, y: 0, width: 20, height: 10 }
      const b: DamageRect = { x: 10, y: 0, width: 20, height: 10 }
      // Overlap region: [10, 20] x [0, 10] = 10 x 10 = 100
      expect(sumOverlapArea([a, b])).toBe(100)
    })

    test("bounds volumetric overlap calculation for N overlapping identical rects", () => {
      // 5 identical rects of 100x100
      // Pairwise overlap: 5 * 4 / 2 = 10 pairs each overlapping by 10000 => unconstrained sum = 100000
      // Bounding area of the union: 100 * 100 = 10000
      // Total area of the rects: 5 * 10000 = 50000
      // Clamped result must be min(100000, 10000, 50000) = 10000
      const rects: DamageRect[] = [
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
      ]

      const overlap = sumOverlapArea(rects)
      expect(overlap).toBe(10000)
    })

    test("bounds overlap to totalArea if boundingArea is larger but totalArea is smaller", () => {
      // Multiple tiny rects clustered inside a huge bounding area with multiple identical overlapping copies
      // e.g. two identical 10x10 rects at (0, 0) and one 10x10 rect at (1000, 1000)
      // bounding area is (1010-0)*(1010-0) = 1020100
      // total area is 100 + 100 + 100 = 300
      // pairwise overlap is 100 (between the two at 0,0)
      // min(100, 1020100, 300) = 100
      const rects: DamageRect[] = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 1000, y: 1000, width: 10, height: 10 },
      ]
      expect(sumOverlapArea(rects)).toBe(100)
    })
  })
})
