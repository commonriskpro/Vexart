import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Linear gradients" subtitle="Angles and color ramps">
      <box direction="row" gap={16}>
        <Panel title="90°" width={120}><box width={88} height={120} cornerRadius={16} gradient={{ type: "linear", from: 0x0ea5e9ff, to: 0x1d4ed8ff, angle: 90 }} /></Panel>
        <Panel title="45°" width={120}><box width={88} height={120} cornerRadius={16} gradient={{ type: "linear", from: 0x22c55eff, to: 0x14532dff, angle: 45 }} /></Panel>
        <Panel title="180°" width={120}><box width={88} height={120} cornerRadius={16} gradient={{ type: "linear", from: 0xf59e0bff, to: 0x7c2d12ff, angle: 180 }} /></Panel>
      </box>
    </SceneFrame>
  )
}
