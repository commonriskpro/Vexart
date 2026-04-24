import { Separator, Skeleton } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Skeleton and separator" subtitle="Loading placeholders and dividers">
      <Panel title="Loading card">
        <box direction="column" gap={10}>
          <Skeleton width={120} height={20} />
          <Skeleton width="100%" height={16} />
          <Skeleton width="80%" height={16} />
          <Separator />
          <box direction="row" gap={10} alignY="center">
            <Skeleton width={56} height={56} cornerRadius={999} />
            <box direction="column" gap={8} width="grow">
              <Skeleton width="70%" height={14} />
              <Skeleton width="55%" height={14} />
            </box>
          </box>
        </box>
      </Panel>
    </SceneFrame>
  )
}
