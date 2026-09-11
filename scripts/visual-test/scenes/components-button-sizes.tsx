import { VoidButton } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Button sizes" subtitle="Size scale and icon buttons">
      <Panel title="Sizes">
        <box direction="row" gap={10} alignY="center">
          <VoidButton size="xs">XS</VoidButton>
          <VoidButton size="sm">Small</VoidButton>
          <VoidButton size="default">Default</VoidButton>
          <VoidButton size="lg">Large</VoidButton>
        </box>
        <box direction="row" gap={10} alignY="center">
          <VoidButton size="icon">★</VoidButton>
          <VoidButton size="icon-sm">✓</VoidButton>
          <VoidButton size="icon-lg">→</VoidButton>
        </box>
      </Panel>
    </SceneFrame>
  )
}
