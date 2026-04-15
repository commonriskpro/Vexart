import { getWgpuCanvasBridgeInfo, probeWgpuCanvasBridge } from "../packages/renderer/src/wgpu-canvas-bridge"

console.log(JSON.stringify({
  probe: probeWgpuCanvasBridge(),
  info: getWgpuCanvasBridgeInfo(),
}, null, 2))
