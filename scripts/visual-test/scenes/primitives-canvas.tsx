import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Primitives · Layered shapes" subtitle="Stable primitive composition snapshot">
      <box width={388} height={220} backgroundColor={0x0f172aff} cornerRadius={16} padding={20}>
        <box width={120} height={72} backgroundColor={0x2563ebff} cornerRadius={16} shadow={{ x: 0, y: 10, blur: 16, color: 0x020617aa }} />
        <box width={88} height={88} backgroundColor={0x22c55eff} cornerRadius={999} floating="parent" floatOffset={{ x: 164, y: 18 }} />
        <box width={120} height={48} gradient={{ type: "linear", from: 0xf59e0bff, to: 0x7c2d12ff, angle: 20 }} cornerRadius={14} floating="parent" floatOffset={{ x: 228, y: 122 }} />
      </box>
    </SceneFrame>
  )
}
