import { createRoot } from "solid-js"
import { expect, test } from "bun:test"
import { createComponent } from "solid-js"
import { renderToBufferAfterInteractions, renderToBuffer } from "../../packages/engine/src/testing/render-to-buffer"
import {
  createEffectsController,
  defaultEffectsValues,
  effectsSnippet,
  EffectsPlaygroundApp,
  normalizeHexColor,
} from "./effects-playground"

test("effects controller updates live values and resets to the approved defaults", () => {
  let dispose!: () => void
  let controller!: ReturnType<typeof createEffectsController>
  createRoot((cleanup) => {
    dispose = cleanup
    controller = createEffectsController()
  })

  try {
    expect(controller.values()).toEqual(defaultEffectsValues)
    controller.setValue("blur", 36)
    controller.setValue("shadow", false)
    controller.setValue("color", "#12AB34")
    expect(controller.values().blur).toBe(36)
    expect(controller.values().shadow).toBe(false)
    expect(controller.values().color).toBe("#12AB34")
    controller.reset()
    expect(controller.values()).toEqual(defaultEffectsValues)
  } finally {
    dispose()
  }
})

test("generated snippets stay valid and follow the selected effect", () => {
  const surface = effectsSnippet("surface", defaultEffectsValues)
  const gradient = effectsSnippet("gradient", defaultEffectsValues)
  const glass = effectsSnippet("glass", defaultEffectsValues)

  expect(surface).toContain('<box')
  expect(surface).toContain('backgroundColor="#ffffff1f"')
  expect(surface).not.toContain("backdropBlur")
  expect(gradient).toContain('gradient={{ type: "linear"')
  expect(gradient).toContain('backgroundColor="#ffffff1f"')
  expect(gradient).toContain('from: "#fb6a5f1f"')
  expect(glass).toContain("backdropBlur={24}")
  expect(glass).toContain("backdropSaturate={140}")
  expect(glass).toContain('color: "#00000022"')
  expect(glass.trimEnd().endsWith("/>")).toBe(true)
  expect(normalizeHexColor("#12ab34")).toBe("#12AB34")
  expect(normalizeHexColor("#12ab3")).toBeNull()
})

function changed(left: Uint8Array, right: Uint8Array) {
  let delta = 0
  for (let index = 0; index < left.length; index += 4) {
    delta += Math.abs(left[index]! - right[index]!)
    delta += Math.abs(left[index + 1]! - right[index + 1]!)
    delta += Math.abs(left[index + 2]! - right[index + 2]!)
  }
  return delta
}

test("effects playground renders the approved viewport and responds to tab and slider input", async () => {
  const before = await renderToBuffer(() => createComponent(EffectsPlaygroundApp, { width: 1536, height: 1024 }), 1536, 1024, 3)
  let copied = ""
  const after = await renderToBufferAfterInteractions(
    () => createComponent(EffectsPlaygroundApp, { width: 1536, height: 1024, copy: (text) => { copied = text } }),
    1536,
    1024,
    async ({ clickAt, frame }) => {
      await clickAt(390, 70)
      await clickAt(1300, 280)
      await clickAt(1410, 70)
      await frame()
    },
    3,
  )
  expect(before.width).toBe(1536)
  expect(before.height).toBe(1024)
  expect(changed(before.pixels, after.pixels)).toBeGreaterThan(20_000)
  expect(copied).toContain('gradient={{ type: "linear"')
  const background = copied.match(/backgroundColor="#ffffff([0-9a-f]{2})"/)?.[1]
  const gradient = copied.match(/from: "#fb6a5f([0-9a-f]{2})"/)?.[1]
  expect(background).toBeDefined()
  expect(gradient).toBe(background)
})

test("color input commits a valid six-digit color to the native snippet", async () => {
  let copied = ""
  await renderToBufferAfterInteractions(
    () => createComponent(EffectsPlaygroundApp, { width: 1536, height: 1024, copy: (text) => { copied = text } }),
    1536,
    1024,
    async ({ clickAt, keyPress, frame }) => {
      await clickAt(1360, 240)
      await keyPress("end")
      for (let index = 0; index < 6; index++) await keyPress("backspace")
      for (const character of "12AB34") await keyPress(character, character)
      await clickAt(1410, 70)
      await frame()
    },
    3,
  )
  expect(copied).toContain('backgroundColor="#12ab341f"')
})
