import { VoidCombobox } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleSelectOptions } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Combobox" subtitle="Autocomplete dropdown">
      <Panel title="Combobox control">
        <box direction="column" gap={12} width={240}>
          <VoidCombobox value="Alpha" options={sampleSelectOptions} width="100%" />
          <VoidCombobox value="" placeholder="Search environments" options={sampleSelectOptions} width="100%" />
        </box>
      </Panel>
    </SceneFrame>
  )
}
