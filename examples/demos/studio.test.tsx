import { expect, test } from "bun:test"
import { focusedId } from "@vexart/engine"
import { renderToBuffer, renderToBufferAfterInteractions } from "../../packages/engine/src/testing/render-to-buffer"
import { StudioApp, createStudioModel } from "./studio"

function pixelDelta(left: Uint8Array, right: Uint8Array) {
  let delta = 0
  for (let index = 0; index < Math.min(left.length, right.length); index += 4) {
    delta += Math.abs(left[index]! - right[index]!)
    delta += Math.abs(left[index + 1]! - right[index + 1]!)
    delta += Math.abs(left[index + 2]! - right[index + 2]!)
  }
  return delta
}

test("Studio model keeps local library filtering truthful", () => {
  const model = createStudioModel()
  expect(model.filtered()).toHaveLength(12)

  model.setQuery("coast")
  expect(model.filtered().map((image) => image.name)).toEqual(["coast-02.jpg", "coast-02-detail.jpg"])

  model.setCategory("architecture")
  expect(model.filtered()).toHaveLength(0)
  expect(model.selected()).toBeNull()
  model.setCategory("landscapes")
  expect(model.selected()?.id).toBe("coast-01")

  model.setQuery("missing")
  expect(model.filtered()).toHaveLength(0)
  expect(model.selected()).toBeNull()
  expect(model.previewOpen()).toBe(false)
})

test("Studio selects cards and opens a real preview overlay", async () => {
  const width = 1536
  const height = 1024
  const initial = await renderToBuffer(() => <StudioApp width={width} height={height} />, width, height, 4)
  const opened = await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, keyPress, frame }) => {
      await clickAt(600, 220)
      expect(focusedId()).toBe("studio-card-coast-01")
      await clickAt(1000, 862)
      await frame()
      expect(focusedId()).toBe("studio-close-preview")
      await keyPress("escape")
      expect(focusedId()).toBe("studio-open-preview")
    },
    4,
  )

  expect(pixelDelta(initial.pixels, opened.pixels)).toBeGreaterThan(10_000)
})

test("Studio keyboard shortcuts focus search and the preview controls change the scene", async () => {
  const width = 1536
  const height = 1024
  const fit = await renderToBuffer(() => <StudioApp width={width} height={height} />, width, height, 4)
  const hundred = await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, frame }) => {
      await clickAt(1470, 154)
      await frame()
      expect(focusedId()).toBe("studio-100")
    },
    4,
  )
  expect(pixelDelta(fit.pixels, hundred.pixels)).toBeGreaterThan(10_000)

  await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, keyPress }) => {
      await clickAt(600, 220)
      await keyPress("/", "/")
      expect(focusedId()).toBe("studio-search")
      await keyPress("escape")
      await clickAt(600, 220)
      await keyPress("enter")
      expect(focusedId()).toBe("studio-close-preview")
      await keyPress("escape")
      expect(focusedId()).toBe("studio-card-coast-01")
    },
    4,
  )
})

test("Studio keyboard navigation keeps selection and focus together", async () => {
  const width = 1536
  const height = 1024
  await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, keyPress }) => {
      await clickAt(600, 220)
      expect(focusedId()).toBe("studio-card-coast-01")
      await keyPress("left")
      expect(focusedId()).toBe("studio-card-dunes-01")
      await keyPress("down")
      expect(focusedId()).toBe("studio-card-peaks-01")
      await keyPress("enter")
      expect(focusedId()).toBe("studio-close-preview")
    },
    4,
  )
})

test("Studio navigation scrolls the full local library", async () => {
  const width = 1536
  const height = 1024
  const initial = await renderToBuffer(() => <StudioApp width={width} height={height} />, width, height, 4)
  const scrolled = await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, keyPress }) => {
      await clickAt(300, 220)
      for (let count = 0; count < 5; count += 1) await keyPress("down")
      expect(focusedId()).toBe("studio-card-canyon-02")
    },
    4,
  )
  expect(pixelDelta(initial.pixels, scrolled.pixels)).toBeGreaterThan(10_000)
})

test("Studio list and grid layouts use the active card bounds", async () => {
  const width = 1536
  const height = 1024
  await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt }) => {
      await clickAt(1490, 80)
      expect(focusedId()).toBe("studio-list")
      await clickAt(300, 170)
      expect(focusedId()).toBe("studio-card-dunes-01")
      await clickAt(1435, 80)
      expect(focusedId()).toBe("studio-grid")
      await clickAt(600, 220)
      expect(focusedId()).toBe("studio-card-coast-01")
    },
    4,
  )
})
