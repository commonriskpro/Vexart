import { VoidTable } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleTableColumns, sampleTableData } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Table" subtitle="Styled data table">
      <Panel title="Service metrics">
        <VoidTable columns={sampleTableColumns} data={sampleTableData} selectedRow={1} />
      </Panel>
    </SceneFrame>
  )
}
