import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { renderToBufferAfterInteractions, type RenderToBufferOptions, type RenderToBufferResult } from "../../../packages/engine/src/testing/render-to-buffer"
import type { TGENode } from "../../../packages/engine/src/ffi/node"
import type { NodeHandle } from "../../../packages/engine/src/reconciler/handle"

export const width = 240
export const height = 180

const IMAGE_SRC = fileURLToPath(new URL("./fixtures/quadrants.png", import.meta.url))
const BACKGROUND = [8, 11, 22, 255]
let rootHandle: NodeHandle | TGENode | undefined

type ImageState = "idle" | "loading" | "loaded" | "error"

function findImageState(node: TGENode): ImageState | undefined {
  if (node.kind === "img") return node._imageExtra?.state
  for (const child of node.children) {
    const state = findImageState(child)
    if (state) return state
  }
  return undefined
}

function rootNode(ref: NodeHandle | TGENode) {
  return "_node" in ref ? ref._node : ref
}

function readImageState() {
  return rootHandle ? findImageState(rootNode(rootHandle)) : undefined
}

export function Scene() {
  return (
    <box ref={(handle) => { rootHandle = handle }} width={width} height={height} backgroundColor={0x080b16ff} padding={16} direction="column">
      <img src={IMAGE_SRC} width={160} height={120} objectFit="fill" />
    </box>
  )
}

/**
 * The <img> decoder is intentionally asynchronous. Poll the actual node state
 * across real render-loop turns until loaded, with a bounded deadline.
 */
export function render(options?: RenderToBufferOptions) {
  rootHandle = undefined
  return renderToBufferAfterInteractions(
    () => <Scene />,
    width,
    height,
    async ({ frame }) => {
      const deadline = Date.now() + 3000
      while (true) {
        const state = readImageState()
        if (state === "loaded") return
        if (state === "error") throw new Error(`image decode failed for ${IMAGE_SRC}`)
        if (Date.now() >= deadline) throw new Error(`image decode did not settle before deadline (${IMAGE_SRC})`)
        await frame()
      }
    },
    2,
    options,
  )
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)

  // The image starts at (16,16), is scaled to 160x120, and contains four
  // intentionally high-contrast source quadrants.
  assert.deepEqual(pixel(frame, 56, 46), new Uint8Array([255, 64, 32, 255]))
  assert.deepEqual(pixel(frame, 136, 46), new Uint8Array([32, 220, 96, 255]))
  assert.deepEqual(pixel(frame, 56, 106), new Uint8Array([48, 112, 240, 255]))
  assert.deepEqual(pixel(frame, 136, 106), new Uint8Array([248, 220, 48, 255]))
  assert.deepEqual(pixel(frame, 8, 8), new Uint8Array(BACKGROUND))
}
