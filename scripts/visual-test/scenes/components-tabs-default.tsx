import { VoidTabs } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleTabs } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Tabs default" subtitle="Pill tabs variant">
      <Panel title="Overview tabs">
        <VoidTabs activeTab={1} tabs={sampleTabs} />
      </Panel>
    </SceneFrame>
  )
}
