import { VoidButton } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Button variants" subtitle="Styled button variants">
      <Panel title="Variants">
        <box direction="row" gap={10}>
          <VoidButton>Default</VoidButton>
          <VoidButton variant="secondary">Secondary</VoidButton>
          <VoidButton variant="outline">Outline</VoidButton>
          <VoidButton variant="ghost">Ghost</VoidButton>
        </box>
        <box direction="row" gap={10}>
          <VoidButton variant="destructive">Delete</VoidButton>
          <VoidButton variant="link">Link</VoidButton>
        </box>
      </Panel>
    </SceneFrame>
  )
}
