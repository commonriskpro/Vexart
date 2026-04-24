import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Corner radii" subtitle="Per-corner radius composition">
      <box direction="row" gap={16}>
        <Panel title="Uniform" width={120}><box width={88} height={88} backgroundColor={0x38bdf8ff} cornerRadius={20} /></Panel>
        <Panel title="Top heavy" width={120}><box width={88} height={88} backgroundColor={0x22c55eff} cornerRadii={{ tl: 28, tr: 28, br: 6, bl: 6 }} /></Panel>
        <Panel title="Diagonal" width={120}><box width={88} height={88} backgroundColor={0xf59e0bff} cornerRadii={{ tl: 28, tr: 6, br: 28, bl: 6 }} /></Panel>
      </box>
    </SceneFrame>
  )
}
