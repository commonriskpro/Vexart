import { VoidProgress } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Progress" subtitle="Progress bars at different ratios">
      <Panel title="Deploy pipeline">
        <box direction="column" gap={14}>
          <VoidProgress value={18} width={280} />
          <VoidProgress value={54} width={280} />
          <VoidProgress value={88} width={280} />
        </box>
      </Panel>
    </SceneFrame>
  )
}
