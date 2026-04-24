import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Rotate transform" subtitle="Matrix-composed rotation">
      <box direction="row" gap={16}>
        <Panel title="-12°" width={120}><box width={88} height={88} backgroundColor={0x14b8a6ff} cornerRadius={14} transform={{ rotate: -12 }} /></Panel>
        <Panel title="18°" width={120}><box width={88} height={88} backgroundColor={0xf97316ff} cornerRadius={14} transform={{ rotate: 18 }} /></Panel>
        <Panel title="32°" width={120}><box width={88} height={88} backgroundColor={0x8b5cf6ff} cornerRadius={14} transform={{ rotate: 32 }} /></Panel>
      </box>
    </SceneFrame>
  )
}
