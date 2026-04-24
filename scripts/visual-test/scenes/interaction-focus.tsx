import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Interaction · Focus visual" subtitle="Focused-state snapshot">
      <Panel title="Focus ring">
        <box width={180} height={72} backgroundColor={0x18181bff} borderColor={0x22c55eff} borderWidth={2} cornerRadius={14} glow={{ radius: 12, color: 0x22c55eff, intensity: 68 }} />
      </Panel>
    </SceneFrame>
  )
}
