import { List } from "@vexart/headless"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleListItems } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · List" subtitle="Headless selectable list">
      <Panel title="Navigation list" width={220}>
        <List
          items={sampleListItems}
          selectedIndex={2}
          renderItem={(item, ctx) => (
            <box {...ctx.itemProps} width="100%" padding={8} backgroundColor={ctx.selected ? 0x1d4ed8ff : 0x18181bff} cornerRadius={8}>
              <text color={ctx.selected ? 0xf8fafcff : 0xe4e4e7ff} fontSize={13}>{item}</text>
            </box>
          )}
          renderList={(children) => <box direction="column" gap={8}>{children}</box>}
        />
      </Panel>
    </SceneFrame>
  )
}
