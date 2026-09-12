import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { createNode, insertChild, removeChild, type TGENode } from "../ffi/node"
import { nativeImageAssetTouch, releaseSubtreeImages } from "../ffi/native-image-assets"
import { renderNodeToBufferAfterInteractions } from "../testing/render-to-buffer"
import { setProp } from "../reconciler/reconciler"
import { clearImageCache, decodeImageForNode, getImageCacheStats } from "./image"

let directory: string
let nodes: TGENode[]

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "vexart-image-lifecycle-"))
  nodes = []
  clearImageCache()
  for (const [name, background] of [["red", "red"], ["blue", "blue"]]) {
    await sharp({ create: { width: 1, height: 1, channels: 4, background } }).png().toFile(join(directory, `${name}.png`))
  }
})
afterEach(async () => {
  for (const node of nodes) releaseSubtreeImages(node)
  clearImageCache()
  await rm(directory, { recursive: true, force: true })
})
function image(src = "red.png") {
  const node = createNode("img")
  nodes.push(node)
  setProp(node, "src", join(directory, src))
  return node
}
async function loaded(node: TGENode) {
  while (node._imageExtra?.state === "loading") await Bun.sleep(1)
  expect(node._imageExtra?.state).toBe("loaded")
}

test("src replacement and removal invalidate the previous pixels and lease", async () => {
  const node = image()
  decodeImageForNode(node)
  await loaded(node)
  expect(node._imageExtra?.buffer?.data).toEqual(new Uint8Array([255, 0, 0, 255]))
  setProp(node, "src", join(directory, "blue.png"))
  expect(node._imageExtra?.state).toBe("idle")
  expect(node._imageExtra?.buffer).toBeNull()
  decodeImageForNode(node)
  await loaded(node)
  expect(node._imageExtra?.buffer?.data).toEqual(new Uint8Array([0, 0, 255, 255]))
  setProp(node, "src", undefined)
  expect(node._imageExtra?.buffer).toBeNull()
  expect(node._imageExtra?.nativeHandle).toBeNull()
})

test("superseded and detached decode subscribers cannot publish", async () => {
  const root = createNode("box")
  const node = image()
  const detached = image()
  insertChild(root, detached)
  decodeImageForNode(node)
  decodeImageForNode(detached)
  setProp(node, "src", join(directory, "blue.png"))
  decodeImageForNode(node)
  removeChild(root, detached)
  while (getImageCacheStats().pendingCount) await Bun.sleep(1)
  await loaded(node)
  expect(node._imageExtra?.buffer?.data).toEqual(new Uint8Array([0, 0, 255, 255]))
  expect(detached._imageExtra?.buffer).toBeNull()
  expect(detached._imageExtra?.nativeHandle).toBeNull()
  insertChild(root, detached)
  decodeImageForNode(detached)
  await loaded(detached)
  expect(detached._imageExtra?.buffer?.data).toEqual(new Uint8Array([255, 0, 0, 255]))
})

test("cache eviction and clear preserve every live node owner", async () => {
  const first = image()
  const second = image()
  decodeImageForNode(first)
  decodeImageForNode(second)
  await loaded(first)
  await loaded(second)
  const handle = first._imageExtra!.nativeHandle!
  expect(second._imageExtra?.nativeHandle).toBe(handle)
  const bytes = await Bun.file(join(directory, "red.png")).bytes()
  for (let index = 0; index < 128; index++) {
    await Bun.write(join(directory, `${index}.png`), bytes)
    const node = image(`${index}.png`)
    decodeImageForNode(node)
    await loaded(node)
  }
  expect(getImageCacheStats().decodedCount).toBe(128)
  expect(nativeImageAssetTouch(handle)).toBe(true)
  clearImageCache()
  expect(nativeImageAssetTouch(handle)).toBe(true)
  releaseSubtreeImages(first)
  expect(nativeImageAssetTouch(handle)).toBe(true)
  releaseSubtreeImages(second)
  expect(nativeImageAssetTouch(handle)).toBe(false)
})

test("clear invalidates pending requests immediately and permits a new generation", async () => {
  const node = image()
  decodeImageForNode(node)
  clearImageCache()
  expect(node._imageExtra?.state).toBe("idle")
  expect(node._imageExtra?.buffer).toBeNull()
  setProp(node, "src", join(directory, "blue.png"))
  decodeImageForNode(node)
  await loaded(node)
  // Both real file decodes have had an event-loop turn; the cleared red
  // request must not become an entry or overwrite the current blue resource.
  await Bun.sleep(20)
  expect(getImageCacheStats().decodedCount).toBe(1)
  expect(node._imageExtra?.buffer?.data).toEqual(new Uint8Array([0, 0, 255, 255]))
})


test("the real walker and GPU repaint a changed source after cache clear", async () => {
  const node = image()
  setProp(node, "width", 4)
  setProp(node, "height", 4)
  setProp(node, "objectFit", "fill")
  const result = await renderNodeToBufferAfterInteractions(node, 4, 4, async ({ frame }) => {
    await loaded(node)
    setProp(node, "src", join(directory, "blue.png"))
    await frame() // walker initiates the new source, without a manual decode call
    await loaded(node)
    clearImageCache()
    expect(nativeImageAssetTouch(node._imageExtra!.nativeHandle!)).toBe(true)
    await frame()
  }, 8)
  expect(result.pixels).toEqual(new Uint8Array(Array.from({ length: 16 }, () => [0, 0, 255, 255]).flat()))
})
