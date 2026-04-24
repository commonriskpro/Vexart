import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Shadows" subtitle="Single and multi-shadow rendering">
      <box direction="row" gap={16}>
        <Panel title="Soft shadow" width={120}>
          <box width={88} height={88} backgroundColor={0x22c55eff} cornerRadius={16} shadow={{ x: 0, y: 12, blur: 20, color: 0x00000066 }} />
        </Panel>
        <Panel title="Tall card" width={120}>
          <box width={88} height={120} backgroundColor={0x2563ebff} cornerRadius={16} shadow={{ x: 0, y: 10, blur: 18, color: 0x020617aa }} />
        </Panel>
        <Panel title="Multi-shadow" width={120}>
          <box
            width={88}
            height={88}
            backgroundColor={0xf59e0bff}
            cornerRadius={16}
            shadow={[
              { x: 0, y: 6, blur: 10, color: 0x00000055 },
              { x: 0, y: 16, blur: 24, color: 0x7c2d1266 },
            ]}
          />
        </Panel>
      </box>
    </SceneFrame>
  )
}
