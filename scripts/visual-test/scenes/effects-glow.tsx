import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Glow" subtitle="Outer glow and halo behavior">
      <box direction="row" gap={16}>
        <Panel title="Teal glow" width={120}>
          <box width={88} height={88} backgroundColor={0x0f172aff} cornerRadius={18} glow={{ radius: 18, color: 0x2dd4bfff, intensity: 72 }} />
        </Panel>
        <Panel title="Purple glow" width={120}>
          <box width={88} height={88} backgroundColor={0x111827ff} cornerRadius={18} glow={{ radius: 22, color: 0xa78bfaFF, intensity: 80 }} />
        </Panel>
        <Panel title="Glow + border" width={120}>
          <box width={88} height={88} backgroundColor={0x09090bff} cornerRadius={18} borderColor={0xf43f5eff} borderWidth={2} glow={{ radius: 16, color: 0xf43f5eff, intensity: 68 }} />
        </Panel>
      </box>
    </SceneFrame>
  )
}
