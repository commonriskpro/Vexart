import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Radial gradients" subtitle="Center-to-edge color transitions">
      <box direction="row" gap={16}>
        <Panel title="Sky"><box width={88} height={88} cornerRadius={18} gradient={{ type: "radial", from: 0x38bdf8ff, to: 0x0f172aff }} /></Panel>
        <Panel title="Emerald"><box width={88} height={88} cornerRadius={18} gradient={{ type: "radial", from: 0x4ade80ff, to: 0x052e16ff }} /></Panel>
        <Panel title="Rose"><box width={88} height={88} cornerRadius={18} gradient={{ type: "radial", from: 0xfb7185ff, to: 0x4c0519ff }} /></Panel>
      </box>
    </SceneFrame>
  )
}
