import type { PixelBuffer } from "@tge/pixel"
import type { LayerComposer } from "@tge/output"

const FINAL_FRAME_IMAGE_ID = 3

export type GpuFrameComposer = {
  renderLayer: (
    buf: PixelBuffer,
    imageId: number,
    pixelX: number,
    pixelY: number,
    z: number,
    cellW: number,
    cellH: number,
  ) => void
  renderLayerRaw: (
    data: Uint8Array,
    width: number,
    height: number,
    imageId: number,
    pixelX: number,
    pixelY: number,
    z: number,
    cellW: number,
    cellH: number,
  ) => void
  renderFinalFrameRaw: (
    data: Uint8Array,
    width: number,
    height: number,
    z: number,
    cellW: number,
    cellH: number,
  ) => void
  patchLayer: (
    regionData: Uint8Array,
    imageId: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ) => boolean
  placeLayer: (
    imageId: number,
    pixelX: number,
    pixelY: number,
    z: number,
    cellW: number,
    cellH: number,
  ) => boolean
  removeLayer: (imageId: number) => void
  clear: () => void
  destroy: () => void
}

export function createGpuFrameComposer(layerComposer: LayerComposer): GpuFrameComposer {
  let mode: "layered-raw" | "final-frame-raw" | null = null

  const ensureLayeredMode = () => {
    if (mode !== "final-frame-raw") return
    layerComposer.removeLayer(FINAL_FRAME_IMAGE_ID)
    mode = "layered-raw"
  }

  const ensureFinalMode = () => {
    if (mode === "final-frame-raw") return
    layerComposer.clear()
    mode = "final-frame-raw"
  }

  return {
    renderLayer(buf, imageId, pixelX, pixelY, z, cellW, cellH) {
      ensureLayeredMode()
      if (mode === null) mode = "layered-raw"
      layerComposer.renderLayer(buf, imageId, pixelX, pixelY, z, cellW, cellH)
    },
    renderLayerRaw(data, width, height, imageId, pixelX, pixelY, z, cellW, cellH) {
      ensureLayeredMode()
      if (mode === null) mode = "layered-raw"
      layerComposer.renderLayerRaw(data, width, height, imageId, pixelX, pixelY, z, cellW, cellH)
    },
    renderFinalFrameRaw(data, width, height, z, cellW, cellH) {
      ensureFinalMode()
      layerComposer.renderLayerRaw(data, width, height, FINAL_FRAME_IMAGE_ID, 0, 0, z, cellW, cellH)
    },
    patchLayer(regionData, imageId, rx, ry, rw, rh) {
      ensureLayeredMode()
      if (mode === null) mode = "layered-raw"
      return layerComposer.patchLayer(regionData, imageId, rx, ry, rw, rh)
    },
    placeLayer(imageId, pixelX, pixelY, z, cellW, cellH) {
      ensureLayeredMode()
      if (mode === null) mode = "layered-raw"
      return layerComposer.placeLayer(imageId, pixelX, pixelY, z, cellW, cellH)
    },
    removeLayer(imageId) {
      if (mode === "final-frame-raw") return
      layerComposer.removeLayer(imageId)
    },
    clear() {
      layerComposer.clear()
      mode = null
    },
    destroy() {
      layerComposer.destroy()
      mode = null
    },
  }
}
