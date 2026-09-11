import {
  VoidButton,
  VoidCard,
  VoidCardContent,
  VoidCardDescription,
  VoidCardFooter,
  VoidCardHeader,
  VoidCardTitle,
} from "@vexart/styled"
import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Theming · Cards" subtitle="Composed styled surfaces">
      <box direction="row" gap={16}>
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Deployment</VoidCardTitle>
            <VoidCardDescription>Production environment is healthy.</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <text color={0xe4e4e7ff} fontSize={13}>Latency 31ms · Error rate 0.02%</text>
          </VoidCardContent>
          <VoidCardFooter>
            <VoidButton size="sm">Open</VoidButton>
          </VoidCardFooter>
        </VoidCard>
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Preview</VoidCardTitle>
            <VoidCardDescription>Branch preview is building.</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <text color={0xe4e4e7ff} fontSize={13}>Commit 8a1f4b2 · ETA 12s</text>
          </VoidCardContent>
          <VoidCardFooter>
            <VoidButton size="sm" variant="secondary">Inspect</VoidButton>
          </VoidCardFooter>
        </VoidCard>
      </box>
    </SceneFrame>
  )
}
