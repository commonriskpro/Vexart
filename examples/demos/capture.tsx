/** Native WGPU readback, not a web recreation or a screenshot of the reference. */

import { getImageCacheStats, clearFocus, type NodeHandle, type JSX } from "vexart"
import sharp from "sharp"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { renderToBufferAfterInteractions } from "../../packages/engine/src/testing/render-to-buffer"
import type { RenderLoopInteractionHelpers } from "../../packages/engine/src/testing/render-to-buffer"

export async function captureDemo(component: () => JSX.Element, width: number, height: number,
  interact?: (helpers: RenderLoopInteractionHelpers) => Promise<void>) {
  let rootHandle: NodeHandle | undefined
  return renderToBufferAfterInteractions(() => <box width={width} height={height} ref={(handle: NodeHandle) => { rootHandle = handle }}>{component()}</box>, width, height, async helpers => {
    // The selected reference state is unfocused, with the pointer outside the app.
    clearFocus()
    await helpers.pointerMove(width + 1, height + 1)
    const settle = async () => {
      const deadline = performance.now() + 10000
      while (getImageCacheStats().pendingCount > 0) {
        if (performance.now() > deadline) throw new Error("Image decode did not settle within 10 seconds")
        await helpers.frame()
      }
      await helpers.frame()
      const inspect = (node: NodeHandle) => {
        if (node.imageState === "error") throw new Error(`Failed to decode ${(node.props as any).src}`)
        node.children.forEach(inspect)
      }
      if (!rootHandle) throw new Error("Capture root was not mounted")
      inspect(rootHandle)
    }
    await settle()
    await interact?.(helpers)
    await settle()
  })
}

if (import.meta.main) {
  const name = Bun.argv[2] ?? "all"
  const width = Number(Bun.argv[3] ?? 1536)
  const height = Number(Bun.argv[4] ?? 1024)
  if (!["all", "studio", "mission", "effects"].includes(name) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Usage: capture.tsx [all|studio|mission|effects] [width] [height]")
  }
  const { StudioApp } = await import("./studio")
  const { MissionControlApp } = await import("./mission-control")
  const { EffectsPlaygroundApp } = await import("./effects-playground")
  const scenes = {
    studio: () => <StudioApp width={width} height={height} />,
    mission: () => <MissionControlApp width={width} height={height} live={false} />,
    effects: () => <EffectsPlaygroundApp width={width} height={height} />,
  }
  const directory = resolve(import.meta.dir, "captures")
  await mkdir(directory, { recursive: true })
  for (const [key, scene] of Object.entries(scenes)) {
    if (name !== "all" && name !== key) continue
    const frame = await captureDemo(scene, width, height)
    const path = resolve(directory, `${key}-${width}x${height}.png`)
    await sharp(frame.pixels, { raw: { width, height, channels: 4 } }).png().toFile(path)
    console.log(path)
  }
}
