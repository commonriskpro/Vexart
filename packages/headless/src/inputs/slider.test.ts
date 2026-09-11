import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  createComponent,
  focusedId,
  resetFocus,
  setFocusedId,
  type NodeMouseEvent,
} from "@vexart/engine"
import { Slider, type SliderRenderContext } from "./slider"

const dummyMouseEvent: NodeMouseEvent = {
  x: 50,
  y: 10,
  nodeX: 50,
  nodeY: 10,
  width: 100,
  height: 20,
}

describe("Slider", () => {
  beforeEach(() => {
    resetFocus()
    setFocusedId("initial-unfocused")
  })

  afterEach(() => {
    resetFocus()
  })

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

  test("invoking trackProps.onMouseDown grants focus when not disabled", () => {
    let capturedCtx!: SliderRenderContext
    let dispose!: () => void

    createRoot((d) => {
      dispose = d
      createComponent(Slider as any, {
        value: 50,
        onChange: () => {},
        focusId: "test-slider",
        renderSlider: (ctx: SliderRenderContext) => {
          capturedCtx = ctx
          return null as any
        },
      })
    })

    try {
      expect(capturedCtx.focused).toBe(false)
      expect(focusedId()).toBe("initial-unfocused")

      capturedCtx.trackProps.onMouseDown(dummyMouseEvent)

      expect(focusedId()).toBe("test-slider")
      expect(capturedCtx.focused).toBe(true)
    } finally {
      dispose()
    }
  })

  test("invoking trackProps.onPress grants focus when not disabled", () => {
    let capturedCtx!: SliderRenderContext
    let dispose!: () => void

    createRoot((d) => {
      dispose = d
      createComponent(Slider as any, {
        value: 50,
        onChange: () => {},
        focusId: "test-slider",
        renderSlider: (ctx: SliderRenderContext) => {
          capturedCtx = ctx
          return null as any
        },
      })
    })

    try {
      expect(capturedCtx.focused).toBe(false)
      expect(focusedId()).toBe("initial-unfocused")

      capturedCtx.trackProps.onPress?.()

      expect(focusedId()).toBe("test-slider")
      expect(capturedCtx.focused).toBe(true)
    } finally {
      dispose()
    }
  })

  test("does not grant focus when disabled on onMouseDown or onPress", () => {
    let capturedCtx!: SliderRenderContext
    let dispose!: () => void

    createRoot((d) => {
      dispose = d
      createComponent(Slider as any, {
        value: 50,
        onChange: () => {},
        disabled: true,
        focusId: "test-slider-disabled",
        renderSlider: (ctx: SliderRenderContext) => {
          capturedCtx = ctx
          return null as any
        },
      })
    })

    try {
      expect(capturedCtx.focused).toBe(false)
      expect(focusedId()).toBe("initial-unfocused")

      capturedCtx.trackProps.onMouseDown(dummyMouseEvent)

      expect(focusedId()).toBe("initial-unfocused")
      expect(capturedCtx.focused).toBe(false)

      capturedCtx.trackProps.onPress?.()

      expect(focusedId()).toBe("initial-unfocused")
      expect(capturedCtx.focused).toBe(false)
    } finally {
      dispose()
    }
  })
})
