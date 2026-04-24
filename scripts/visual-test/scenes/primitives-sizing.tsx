import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Primitives · Sizing" subtitle="Fixed, grow and percent sizing">
      <Panel title="Row sizing">
        <box direction="row" gap={8} width="grow">
          <box width={64} height={48} backgroundColor={0x0ea5e9ff} cornerRadius={8} />
          <box width="grow" height={48} backgroundColor={0x1d4ed8ff} cornerRadius={8} />
          <box width="25%" height={48} backgroundColor={0x312e81ff} cornerRadius={8} />
        </box>
      </Panel>
      <Panel title="Column sizing">
        <box direction="column" gap={8} width={160}>
          <box width="100%" height={20} backgroundColor={0x22c55eff} cornerRadius={6} />
          <box width="80%" height={20} backgroundColor={0x16a34aff} cornerRadius={6} />
          <box width="60%" height={20} backgroundColor={0x14532dff} cornerRadius={6} />
        </box>
      </Panel>
    </SceneFrame>
  )
}
