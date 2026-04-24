import { Button, VoidDropdownMenu } from "@vexart/styled"
import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Dropdown" subtitle="Open dropdown menu panel">
      <VoidDropdownMenu open onOpenChange={() => {}}>
        <VoidDropdownMenu.Trigger>
          <Button variant="outline">Actions</Button>
        </VoidDropdownMenu.Trigger>
        <VoidDropdownMenu.Content width={180}>
          <VoidDropdownMenu.Label>Project</VoidDropdownMenu.Label>
          <VoidDropdownMenu.Separator />
          <VoidDropdownMenu.Item>Open dashboard</VoidDropdownMenu.Item>
          <VoidDropdownMenu.Item>Copy link</VoidDropdownMenu.Item>
          <VoidDropdownMenu.Item variant="destructive">Archive</VoidDropdownMenu.Item>
        </VoidDropdownMenu.Content>
      </VoidDropdownMenu>
    </SceneFrame>
  )
}
