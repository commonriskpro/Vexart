import { ScrollView } from "@vexart/headless"
import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Primitives · ScrollView" subtitle="Static snapshot of clipped scroll content">
      <ScrollView width="grow" height={220} scrollY backgroundColor={0x18181bff} cornerRadius={12} padding={12} gap={8}>
        {Array.from({ length: 12 }, (_, index) => (
          <box width="100%" height={28} backgroundColor={index % 2 === 0 ? 0x27272aff : 0x3f3f46ff} cornerRadius={6}>
            <text color={0xe4e4e7ff} fontSize={12}>Row {index + 1}</text>
          </box>
        ))}
      </ScrollView>
    </SceneFrame>
  )
}
