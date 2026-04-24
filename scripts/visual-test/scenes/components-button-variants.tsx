import { Button } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Button variants" subtitle="Styled button variants">
      <Panel title="Variants">
        <box direction="row" gap={10}>
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </box>
        <box direction="row" gap={10}>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Link</Button>
        </box>
      </Panel>
    </SceneFrame>
  )
}
