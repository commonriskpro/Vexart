import { Button } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Button sizes" subtitle="Size scale and icon buttons">
      <Panel title="Sizes">
        <box direction="row" gap={10} alignY="center">
          <Button size="xs">XS</Button>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </box>
        <box direction="row" gap={10} alignY="center">
          <Button size="icon">★</Button>
          <Button size="icon-sm">✓</Button>
          <Button size="icon-lg">→</Button>
        </box>
      </Panel>
    </SceneFrame>
  )
}
