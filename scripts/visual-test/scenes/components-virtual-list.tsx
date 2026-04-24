import { VirtualList } from "@vexart/headless"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

const items = Array.from({ length: 24 }, (_, index) => `Worker ${index + 1}`)

export function Scene() {
  return (
    <SceneFrame title="Components · VirtualList" subtitle="Virtualized collection snapshot">
      <Panel title="Workers">
        <VirtualList
          items={items}
          itemHeight={28}
          height={180}
          width={220}
          selectedIndex={3}
          renderItem={(item, _index, ctx) => (
            <box width="100%" height={24} paddingLeft={8} alignY="center" backgroundColor={ctx.selected ? 0x22c55eff : ctx.highlighted ? 0x1d4ed8ff : 0x18181bff} cornerRadius={6}>
              <text color={0xf8fafcff} fontSize={12}>{item}</text>
            </box>
          )}
        />
      </Panel>
    </SceneFrame>
  )
}
