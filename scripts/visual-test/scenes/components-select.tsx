import { VoidSelect } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleSelectOptions } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Select" subtitle="Styled dropdown select">
      <Panel title="Select control">
        <box direction="column" gap={12} width={240}>
          <VoidSelect value="beta" options={sampleSelectOptions} width="100%" />
          <VoidSelect options={sampleSelectOptions} placeholder="Choose a track" width="100%" />
        </box>
      </Panel>
    </SceneFrame>
  )
}
