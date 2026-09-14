import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import type { NodeHandle } from "vexart"
import { focusedId } from "vexart"
import { renderToBuffer, renderToBufferAfterInteractions } from "../../packages/engine/src/testing/render-to-buffer"
import { StudioApp, createStudioModel, clampPan } from "./studio"
import { captureDemo } from "./capture"

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

test("clampPan helper clamps coordinates within viewport boundaries", () => {
  // Image larger than viewport (1419 x 1108 in 766 x 726)
  const vpW = 766
  const vpH = 726
  const imgW = 1419
  const imgH = 1108
  const minX = vpW - imgW // -653
  const minY = vpH - imgH // -382

  // Centered values are preserved
  const centeredX = Math.round((vpW - imgW) / 2) // -326
  const centeredY = Math.round((vpH - imgH) / 2) // -191
  expect(clampPan(centeredX, centeredY, vpW, vpH, imgW, imgH)).toEqual({ x: centeredX, y: centeredY })

  // Dragging right past left edge clamps x to 0
  expect(clampPan(50, centeredY, vpW, vpH, imgW, imgH).x).toBe(0)
  // Dragging left past right edge clamps x to minX
  expect(clampPan(-1000, centeredY, vpW, vpH, imgW, imgH).x).toBe(minX)
  // Dragging down past top edge clamps y to 0
  expect(clampPan(centeredX, 80, vpW, vpH, imgW, imgH).y).toBe(0)
  // Dragging up past bottom edge clamps y to minY
  expect(clampPan(centeredX, -600, vpW, vpH, imgW, imgH).y).toBe(minY)

  // Image smaller than viewport (500 x 400 in 800 x 600)
  expect(clampPan(150, 100, 800, 600, 500, 400)).toEqual({ x: 150, y: 100 })
  expect(clampPan(-50, -50, 800, 600, 500, 400)).toEqual({ x: 0, y: 0 })
  expect(clampPan(500, 400, 800, 600, 500, 400)).toEqual({ x: 300, y: 200 })

  // Non-positive dimensions return 0
  expect(clampPan(10, 10, 0, 100, 100, 100)).toEqual({ x: 0, y: 0 })
})

test("Studio model manages 100% zoom pan initialization, clamped dragging, and reset lifecycles", () => {
  const model = createStudioModel({ width: 766, height: 726 })
  expect(model.fit()).toBe("fit")
  expect(model.pan()).toEqual({ x: 0, y: 0 })

  // Switching to 100% initializes pan centered and clamped
  model.setFit("100%")
  expect(model.fit()).toBe("100%")
  const dunes = model.selected()!
  expect(dunes.id).toBe("dunes-01")
  const expectedDunesX = Math.round((766 - dunes.naturalWidth) / 2)
  const expectedDunesY = Math.round((726 - dunes.naturalHeight) / 2)
  expect(model.pan()).toEqual({ x: expectedDunesX, y: expectedDunesY })

  // Dragging updates pan within clamped boundaries
  const nextPan = clampPan(model.pan().x + 50, model.pan().y + 30, 766, 726, dunes.naturalWidth, dunes.naturalHeight)
  model.setPan(nextPan)
  expect(model.pan()).toEqual(nextPan)

  model.setPan((prev) => clampPan(prev.x - 20, prev.y - 10, 766, 726, dunes.naturalWidth, dunes.naturalHeight))
  expect(model.pan()).toEqual({ x: nextPan.x - 20, y: nextPan.y - 10 })

  // Selecting another image resets pan to 0,0
  model.select("coast-02")
  expect(model.selected()?.id).toBe("coast-02")
  expect(model.pan()).toEqual({ x: 0, y: 0 })

  // Re-entering 100% initializes pan for the new image
  model.setFit("100%")
  const coast = model.selected()!
  const expectedCoastX = Math.round((766 - coast.naturalWidth) / 2)
  const expectedCoastY = Math.round((726 - coast.naturalHeight) / 2)
  expect(model.pan()).toEqual({ x: expectedCoastX, y: expectedCoastY })

  // Switching fit back to "fit" resets pan
  model.setFit("fit")
  expect(model.fit()).toBe("fit")
  expect(model.pan()).toEqual({ x: 0, y: 0 })

  // Query filter change resets pan
  model.setFit("100%")
  expect(model.pan().x).not.toBe(0)
  model.setQuery("peaks")
  expect(model.pan()).toEqual({ x: 0, y: 0 })

  // Category change resets pan
  model.setFit("100%")
  model.setCategory("architecture")
  expect(model.pan()).toEqual({ x: 0, y: 0 })
})

test("Studio dragging in 100% mode updates pan within clamped bounds and is disabled in fit mode", () => {
  const model = createStudioModel({ width: 766, height: 726 })
  let panStartX = 0
  let panStartY = 0
  let dragStartX = 0
  let dragStartY = 0

  const vpWidth = 766
  const vpHeight = 726
  const img = model.selected()!

  // In fit mode, pan remains 0, 0
  expect(model.fit()).toBe("fit")
  expect(model.pan()).toEqual({ x: 0, y: 0 })

  // Switch to 100% mode
  model.setFit("100%")
  const initialPan = model.pan()
  expect(initialPan.x).toBeLessThan(0)
  expect(initialPan.y).toBeLessThan(0)

  // Simulate drag start at (500, 400)
  dragStartX = 500
  dragStartY = 400
  panStartX = model.pan().x
  panStartY = model.pan().y

  // Drag right +60px, down +40px
  const currentX = 560
  const currentY = 440
  const targetX = panStartX + (currentX - dragStartX)
  const targetY = panStartY + (currentY - dragStartY)
  const clamped = clampPan(targetX, targetY, vpWidth, vpHeight, img.naturalWidth, img.naturalHeight)
  model.setPan(clamped)

  expect(model.pan().x).toBe(initialPan.x + 60)
  expect(model.pan().y).toBe(initialPan.y + 40)

  // Drag past the edge (overscroll right)
  const overscrollRight = clampPan(panStartX + 2000, targetY, vpWidth, vpHeight, img.naturalWidth, img.naturalHeight)
  model.setPan(overscrollRight)
  expect(model.pan().x).toBe(0) // Clamped to left edge (x=0)

  // Drag past the edge (overscroll left)
  const overscrollLeft = clampPan(-2000, targetY, vpWidth, vpHeight, img.naturalWidth, img.naturalHeight)
  model.setPan(overscrollLeft)
  expect(model.pan().x).toBe(vpWidth - img.naturalWidth) // Clamped to right edge

  // Switch back to fit mode resets pan
  model.setFit("fit")
  expect(model.pan()).toEqual({ x: 0, y: 0 })
})

test("Studio preview renders at 100% zoom and supports arrow panning", async () => {
  const width = 1536
  const height = 1024
  const fit = await renderToBuffer(() => <StudioApp width={width} height={height} />, width, height, 4)

  let hundredBuffer: Uint8Array | null = null
  const panned = await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, keyPress, frame }) => {
      // Click 100% button
      await clickAt(1470, 115)
      await frame()
      expect(focusedId()).toBe("studio-100")

      // Pan with arrow keys while focused on studio-100
      await keyPress("down")
      await keyPress("down")
      await keyPress("right")
      await keyPress("right")
      await frame()
    },
    4,
  )

  // Panned 100% view has different pixels from fit view
  expect(pixelDelta(fit.pixels, panned.pixels)).toBeGreaterThan(10_000)

  // Clicking "Fit" returns to fit mode
  await renderToBufferAfterInteractions(
    () => <StudioApp width={width} height={height} />,
    width,
    height,
    async ({ clickAt, frame }) => {
      await clickAt(1470, 115)
      await frame()
      expect(focusedId()).toBe("studio-100")

      await clickAt(1405, 115)
      await frame()
      expect(focusedId()).toBe("studio-fit")
    },
    4,
  )
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
      await clickAt(1000, 940)
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
      await clickAt(1470, 115)
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
      await clickAt(1490, 38)
      expect(focusedId()).toBe("studio-list")
      await clickAt(300, 135)
      expect(focusedId()).toBe("studio-card-dunes-01")
      await clickAt(1435, 38)
      expect(focusedId()).toBe("studio-grid")
      await clickAt(600, 220)
      expect(focusedId()).toBe("studio-card-coast-01")
    },
    4,
  )
})

test("Studio adapts and resizes fluidly when width and height change", async () => {
  let rootHandle: NodeHandle | undefined
  let setDimensions: ((s: { width: number; height: number }) => void) | undefined
  const scene = () => {
    const [size, setSize] = createSignal({ width: 1536, height: 1024 })
    setDimensions = setSize
    return (
      <box width={size().width} height={size().height} ref={(h: NodeHandle) => { rootHandle = h }}>
        <StudioApp width={size().width} height={size().height} />
      </box>
    )
  }
  await captureDemo(scene, 1536, 1024, async ({ frame }) => {
    if (!rootHandle || !setDimensions) throw new Error("Studio was not mounted")
    expect(rootHandle.layout.width).toBe(1536)
    expect(rootHandle.layout.height).toBe(1024)

    setDimensions({ width: 1920, height: 1080 })
    await frame()
    expect(rootHandle.layout.width).toBe(1920)
    expect(rootHandle.layout.height).toBe(1080)
  })
})
