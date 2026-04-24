import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Opacity" subtitle="Element-level alpha compositing">
      <Panel title="Opacity stack">
        <box direction="row" gap={12} alignY="center">
          <box width={88} height={88} backgroundColor={0x2563ebff} cornerRadius={16} opacity={1} />
          <box width={88} height={88} backgroundColor={0x2563ebff} cornerRadius={16} opacity={0.66} />
          <box width={88} height={88} backgroundColor={0x2563ebff} cornerRadius={16} opacity={0.33} />
        </box>
      </Panel>
      <Panel title="Nested alpha">
        <box width={140} height={80} backgroundColor={0x7c3aedff} cornerRadius={16} opacity={0.75} alignX="center" alignY="center">
          <box width={80} height={36} backgroundColor={0xf8fafcff} cornerRadius={10} opacity={0.6} />
        </box>
      </Panel>
    </SceneFrame>
  )
}
