import { VoidTabs } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleTabs } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Tabs line" subtitle="Underline tabs variant">
      <Panel title="Metrics tabs">
        <VoidTabs activeTab={2} tabs={sampleTabs} variant="line" />
      </Panel>
    </SceneFrame>
  )
}
