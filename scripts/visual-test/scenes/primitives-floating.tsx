import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Primitives · Floating" subtitle="Floating panels and z-index">
      <box width="grow" height={220} backgroundColor={0x111827ff} cornerRadius={18} padding={18}>
        <box width={180} height={120} backgroundColor={0x1d4ed8ff} cornerRadius={16} />
        <box floating="parent" floatOffset={{ x: 96, y: 54 }} zIndex={10} width={180} height={120} backgroundColor={0x172554dd} borderColor={0x60a5faff} borderWidth={1} cornerRadius={16} shadow={{ x: 0, y: 10, blur: 18, color: 0x020617aa }} />
      </box>
    </SceneFrame>
  )
}
