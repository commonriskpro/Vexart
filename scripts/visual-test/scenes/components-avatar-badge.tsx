import { Avatar, Badge } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Avatar and badge" subtitle="Identity and semantic labels">
      <box direction="row" gap={16}>
        <Panel title="Avatars" width={180}>
          <box direction="row" gap={10} alignY="center">
            <Avatar name="Ada" size="sm" />
            <Avatar name="Linus" />
            <Avatar name="Grace" size="lg" color={0x2563ebff} />
          </box>
        </Panel>
        <Panel title="Badges" width={180}>
          <box direction="row" gap={8}>
            <Badge>Stable</Badge>
            <Badge variant="secondary">Beta</Badge>
            <Badge variant="outline">Docs</Badge>
            <Badge variant="destructive">Alert</Badge>
          </box>
        </Panel>
      </box>
    </SceneFrame>
  )
}
