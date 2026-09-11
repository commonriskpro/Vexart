import { VoidSeparator, VoidSkeleton } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Skeleton and separator" subtitle="Loading placeholders and dividers">
      <Panel title="Loading card">
        <box direction="column" gap={10}>
          <VoidSkeleton width={120} height={20} />
          <VoidSkeleton width="100%" height={16} />
          <VoidSkeleton width="80%" height={16} />
          <VoidSeparator />
          <box direction="row" gap={10} alignY="center">
            <VoidSkeleton width={56} height={56} cornerRadius={999} />
            <box direction="column" gap={8} width="grow">
              <VoidSkeleton width="70%" height={14} />
              <VoidSkeleton width="55%" height={14} />
            </box>
          </box>
        </box>
      </Panel>
    </SceneFrame>
  )
}
