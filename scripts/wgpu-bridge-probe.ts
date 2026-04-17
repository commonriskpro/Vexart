import { getWgpuCanvasBridgeInfo, probeWgpuCanvasBridge } from "@vexart/engine"

console.log(JSON.stringify({
  probe: probeWgpuCanvasBridge(),
  info: getWgpuCanvasBridgeInfo(),
}, null, 2))
