import { VoidAvatar, VoidBadge } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Avatar and badge" subtitle="Identity and semantic labels">
      <box direction="row" gap={16}>
        <Panel title="Avatars" width={180}>
          <box direction="row" gap={10} alignY="center">
            <VoidAvatar name="Ada" size="sm" />
            <VoidAvatar name="Linus" />
            <VoidAvatar name="Grace" size="lg" color={0x2563ebff} />
          </box>
        </Panel>
        <Panel title="Badges" width={180}>
          <box direction="column" gap={8}>
            <box direction="row" gap={8}>
              <VoidBadge>Stable</VoidBadge>
              <VoidBadge variant="secondary">Beta</VoidBadge>
            </box>
            <box direction="row" gap={8}>
              <VoidBadge variant="outline">Docs</VoidBadge>
              <VoidBadge variant="destructive">Alert</VoidBadge>
            </box>
          </box>
        </Panel>
      </box>
    </SceneFrame>
  )
}
