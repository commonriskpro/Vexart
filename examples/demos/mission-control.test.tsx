import { expect, test } from "bun:test"
import { createSignal } from "solid-js"

import { focusedId, clearFocus, type NodeHandle } from "@vexart/engine"
import { renderToBufferAfterInteractions, renderToBuffer } from "../../packages/engine/src/testing/render-to-buffer"
import { MissionControlApp } from "./mission-control"
import { captureDemo } from "./capture"

function coverage(pixels: Uint8Array) {
  let nonBlack = 0
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index]! + pixels[index + 1]! + pixels[index + 2]! > 32) nonBlack++
  }
  return nonBlack / (pixels.length / 4)
}

function textNodes(root: NodeHandle) {
  const texts: string[] = []
  const visit = (node: NodeHandle) => {
    if (node.kind === "text" && node.text) texts.push(node.text)
    node.children.forEach(visit)
  }
  visit(root)
  return texts
}

function hasLabelAt(root: NodeHandle, text: string, x: number, y: number) {
  let found = false
  const visit = (node: NodeHandle) => {
    if (found) return
    if (node.kind === "text" && node.text === text) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        const offset = (parent.props as any).floatOffset
        if (offset && offset.x === x && offset.y === y) {
          found = true
          return
        }
      }
    }
    node.children.forEach(visit)
  }
  visit(root)
  return found
}

test("Mission Control renders the approved service dashboard and native charts", async () => {
  const frame = await renderToBuffer(() => <MissionControlApp width={1536} height={1024} live={false} />, 1536, 1024, 3)
  expect(frame.width).toBe(1536)
  expect(frame.height).toBe(1024)
  expect(coverage(frame.pixels)).toBeGreaterThan(0.02)
})

test("Mission Control service selection and log filtering update the scene", async () => {
  let rootHandle: NodeHandle | undefined
  const after = await renderToBufferAfterInteractions(
    () => <box width={1536} height={1024} ref={(handle: NodeHandle) => { rootHandle = handle }}><MissionControlApp width={1536} height={1024} live={false} /></box>,
    1536,
    1024,
    async ({ clickAt, keyPress, frame }) => {
      clearFocus()
      await frame()
      expect(rootHandle).toBeDefined()
      if (!rootHandle) throw new Error("Mission Control root handle is not mounted")
      const root = rootHandle
      expect(hasLabelAt(root, "api", 29, 25)).toBe(true)

      // Web row: its approved design position is y247..342.
      await clickAt(130, 46 + 161 + 35)
      await frame()
      expect(hasLabelAt(root, "web", 29, 25)).toBe(true)

      await keyPress("down")
      await frame()
      expect(hasLabelAt(root, "worker", 29, 25)).toBe(true)
      await keyPress("up")
      await frame()
      expect(hasLabelAt(root, "web", 29, 25)).toBe(true)
      await keyPress("enter")
      await frame()
      expect(focusedId()).toBe("service-web")
      expect(hasLabelAt(root, "web", 29, 25)).toBe(true)

      // Space pauses while a service has focus; the pause button itself also
      // owns Space through the shared Button primitive.
      await keyPress(" ", " ")
      await frame()
      expect(textNodes(root)).toContain("Resume stream")

      // Slash focuses the real headless Input without inserting the shortcut.
      await keyPress("/", "/")
      await frame()
      expect(focusedId()).toBe("mission-filter")
      expect(textNodes(root).filter(text => text === "/")).toHaveLength(1)

      // The toolbar search button uses the same focus target.
      await clearFocus()
      await clickAt(385 + 1083 + 20, 46 + 23 + 18)
      expect(focusedId()).toBe("mission-filter")
      for (const char of "warn") await keyPress(char, char)
      await frame()
      expect(focusedId()).toBe("mission-filter")
      expect(textNodes(root)).toContain("warn")
      expect(textNodes(root)).not.toContain("Vite dev server ready")

      // Escape clears the query and restores service focus.
      await keyPress("escape")
      await frame()
      expect(focusedId()).toBe("service-web")
      expect(textNodes(root)).toContain("Vite dev server ready")

      // Severity filter is a real state transition, not just a visual delta.
      await clickAt(385 + 709 + 45, 46 + 363 + 18)
      await frame()
      expect(textNodes(root)).not.toContain("WARN")
    },
    3,
  )
  expect(coverage(after.pixels)).toBeGreaterThan(0.02)
})

function findCanvas(root: NodeHandle) {
  let canvas: NodeHandle | undefined
  const visit = (node: NodeHandle) => {
    if (canvas) return
    if (node.kind === "canvas") canvas = node
    node.children.forEach(visit)
  }
  visit(root)
  return canvas
}

function chartLineSignature(root: NodeHandle) {
  return findCanvas(root)?.canvasCommands
    ?.filter((command) => command.kind === "line")
    .map((command) => `${command.x0}:${command.y0}:${command.x1}:${command.y1}`)
}

test("Mission Control plot canvases resize in place with the demo viewport", async () => {
  const [size, setSize] = createSignal({ width: 1536, height: 1024 })
  let rootHandle: NodeHandle | undefined
  let initialCanvas: NodeHandle | undefined
  let resizedCanvas: NodeHandle | undefined
  await renderToBufferAfterInteractions(
    () => <box width={1536} height={1024} ref={(handle: NodeHandle) => { rootHandle = handle }}><MissionControlApp width={size().width} height={size().height} live={false} /></box>,
    1536,
    1024,
    async ({ frame }) => {
      clearFocus()
      await frame()
      if (!rootHandle) throw new Error("Mission Control root handle is not mounted")
      const root = rootHandle
      initialCanvas = findCanvas(root)
      expect(initialCanvas).toBeDefined()
      expect(initialCanvas!.layout.width).toBeCloseTo(453, 3)
      const initialCacheKey = initialCanvas!.canvasDrawCacheKey
      setSize({ width: 1200, height: 800 })
      await frame()
      resizedCanvas = findCanvas(root!)
      expect(resizedCanvas).toBe(initialCanvas)
      expect(resizedCanvas!.layout.width).toBeCloseTo(453 * (1200 / 1536), 0)
      expect(resizedCanvas!.canvasDrawCacheKey).not.toBe(initialCacheKey)
    },
    3,
  )
})

test("Mission Control live mode appends deterministic logs and pauses the stream", async () => {
  let rootHandle: NodeHandle | undefined
  await renderToBufferAfterInteractions(
    () => <box width={1536} height={1024} ref={(handle: NodeHandle) => { rootHandle = handle }}><MissionControlApp width={1536} height={1024} live /></box>,
    1536,
    1024,
    async ({ clickAt, frame }) => {
      clearFocus()
      await frame()
      if (!rootHandle) throw new Error("Mission Control root handle is not mounted")
      const root = rootHandle
      const initialLines = chartLineSignature(root)
      await new Promise<void>((resolve) => setTimeout(resolve, 980))
      await frame()
      const streamed = textNodes(root).filter(text => text.startsWith("13:09:"))
      expect(streamed).toContain("13:09:27")
      expect(chartLineSignature(root)?.[8]).not.toBe(initialLines?.[8])
      const countBeforePause = streamed.length
      await clickAt(385 + 891 + 80, 46 + 23 + 19)
      await new Promise<void>((resolve) => setTimeout(resolve, 980))
      await frame()
      expect(textNodes(root).filter(text => text.startsWith("13:09:")).length).toBe(countBeforePause)
    },
    3,
  )
})

test("Mission Control adapts and resizes fluidly when width and height change", async () => {
  let rootHandle: NodeHandle | undefined
  let setDimensions: ((s: { width: number; height: number }) => void) | undefined
  const scene = () => {
    const [size, setSize] = createSignal({ width: 1536, height: 1024 })
    setDimensions = setSize
    return (
      <box width={size().width} height={size().height} ref={(h: NodeHandle) => { rootHandle = h }}>
        <MissionControlApp width={size().width} height={size().height} live={false} />
      </box>
    )
  }
  await captureDemo(scene, 1536, 1024, async ({ frame }) => {
    if (!rootHandle || !setDimensions) throw new Error("Mission Control was not mounted")
    expect(rootHandle.layout.width).toBe(1536)
    expect(rootHandle.layout.height).toBe(1024)

    setDimensions({ width: 1920, height: 1080 })
    await frame()
    expect(rootHandle.layout.width).toBe(1920)
    expect(rootHandle.layout.height).toBe(1080)
  })
})
