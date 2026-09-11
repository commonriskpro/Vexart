import { VoidButton, VoidDialog } from "@vexart/styled"
import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Components · Dialog" subtitle="Styled dialog composition">
      <VoidDialog onClose={() => {}} width={280}>
        <VoidDialog.Title>Delete deployment?</VoidDialog.Title>
        <VoidDialog.Description>This action removes the selected preview deployment and clears its cache snapshot.</VoidDialog.Description>
        <VoidDialog.Footer>
          <VoidButton variant="ghost">Cancel</VoidButton>
          <VoidButton variant="destructive">Delete</VoidButton>
        </VoidDialog.Footer>
      </VoidDialog>
    </SceneFrame>
  )
}
