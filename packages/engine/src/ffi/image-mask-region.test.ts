import { expect, test } from "bun:test"
import { ptr } from "bun:ffi"
import {
  vexartCompositeImageMaskRoundedRect,
  vexartCompositeImageMaskRoundedRectRegion,
  vexartCompositeReadbackRgba,
  vexartCompositeRenderImageLayer,
  vexartCompositeTargetBeginLayer,
  vexartCompositeTargetCreate,
  vexartCompositeTargetDestroy,
  vexartCompositeTargetEndLayer,
  vexartRemoveImage,
  vexartUploadImage,
} from "./gpu-composite-ops"
import { openVexartLibrary } from "./vexart-bridge"

function renderImage(ctx: bigint, image: bigint, width: number, height: number) {
  const target = vexartCompositeTargetCreate(ctx, width, height)
  expect(target).not.toBe(0n)
  vexartCompositeTargetBeginLayer(ctx, target, 0, 0x00000000)
  vexartCompositeRenderImageLayer(ctx, target, image, 0, 0, width, height, 0, 0x00000000)
  vexartCompositeTargetEndLayer(ctx, target)
  const pixels = vexartCompositeReadbackRgba(ctx, target, width * height * 4)
  vexartCompositeTargetDestroy(ctx, target)
  return pixels ? new Uint8Array(pixels) : null
}

test("preserves the original rounded-box mask through a partial image crop", () => {
  const { symbols } = openVexartLibrary()
  const contextOut = new BigUint64Array(1)
  const contextOptions = new Uint8Array(1)
  expect(symbols.vexart_context_create(ptr(contextOptions), 0, ptr(contextOut))).toBe(0)
  const ctx = contextOut[0]

  const boxWidth = 24
  const boxHeight = 24
  const cropX = 5
  const cropWidth = 12
  const source = new Uint8Array(boxWidth * boxHeight * 4)
  const crop = new Uint8Array(cropWidth * boxHeight * 4)
  for (let y = 0; y < boxHeight; y++) {
    for (let x = 0; x < boxWidth; x++) {
      const offset = (y * boxWidth + x) * 4
      source[offset] = (x * 9 + y * 3) & 0xff
      source[offset + 1] = (x * 5 + 40) & 0xff
      source[offset + 2] = (y * 7 + 16) & 0xff
      // Keep a few source texels semi-transparent so the mask is also checked
      // against the straight-alpha image path, not only opaque RGBA data.
      source[offset + 3] = x % 3 === 0 ? 0x80 : 0xff
      if (x >= cropX && x < cropX + cropWidth) {
        const cropOffset = (y * cropWidth + x - cropX) * 4
        crop.set(source.subarray(offset, offset + 4), cropOffset)
      }
    }
  }

  const sourceImage = vexartUploadImage(ctx, source, boxWidth, boxHeight)
  const cropImage = vexartUploadImage(ctx, crop, cropWidth, boxHeight)
  const radii = new Float32Array([0, 12, 12, 12, 12, 1])
  const fullMasked = vexartCompositeImageMaskRoundedRect(ctx, sourceImage, radii)
  // Region mask rectangle in the cropped output's bottom-left NDC. Its
  // width/height still describe the original 24×24 image box at x=-5.
  const region = new Float32Array([0, 12, 12, 12, 12, 1, -1 - (cropX / cropWidth) * 2, -1, (boxWidth / cropWidth) * 2, 2])
  const cropMasked = vexartCompositeImageMaskRoundedRectRegion(ctx, cropImage, region)
  expect(fullMasked).not.toBe(0n)
  expect(cropMasked).not.toBe(0n)

  try {
    const fullPixels = renderImage(ctx, fullMasked, boxWidth, boxHeight)
    const cropPixels = renderImage(ctx, cropMasked, cropWidth, boxHeight)
    expect(fullPixels).not.toBeNull()
    expect(cropPixels).not.toBeNull()
    for (let y = 0; y < boxHeight; y++) {
      for (let x = 0; x < cropWidth; x++) {
        const croppedOffset = (y * cropWidth + x) * 4
        const fullOffset = (y * boxWidth + x + cropX) * 4
        expect(cropPixels!.slice(croppedOffset, croppedOffset + 4)).toEqual(fullPixels!.slice(fullOffset, fullOffset + 4))
      }
    }
  } finally {
    vexartRemoveImage(ctx, fullMasked)
    vexartRemoveImage(ctx, cropMasked)
    vexartRemoveImage(ctx, sourceImage)
    vexartRemoveImage(ctx, cropImage)
    symbols.vexart_context_destroy(ctx)
  }
})
