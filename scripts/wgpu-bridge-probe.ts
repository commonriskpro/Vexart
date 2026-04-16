import { getWgpuCanvasBridgeInfo, probeWgpuCanvasBridge } from "@tge/gpu"

console.log(JSON.stringify({
  probe: probeWgpuCanvasBridge(),
  info: getWgpuCanvasBridgeInfo(),
}, null, 2))
