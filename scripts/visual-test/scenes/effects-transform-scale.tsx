import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Scale and skew" subtitle="Transform size changes without relayout">
      <box direction="row" gap={16}>
        <Panel title="Scale 1.15" width={120}><box width={88} height={88} backgroundColor={0x2563ebff} cornerRadius={14} transform={{ scale: 1.15 }} /></Panel>
        <Panel title="ScaleX/Y" width={120}><box width={88} height={88} backgroundColor={0x22c55eff} cornerRadius={14} transform={{ scaleX: 1.2, scaleY: 0.8 }} /></Panel>
        <Panel title="Skew" width={120}><box width={88} height={88} backgroundColor={0xf43f5eff} cornerRadius={14} transform={{ skewX: 14, skewY: -6 }} /></Panel>
      </box>
    </SceneFrame>
  )
}
