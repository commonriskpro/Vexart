import { H1, H2, Lead, Muted, P, Small } from "@vexart/styled"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Theming · Typography" subtitle="Void typography primitives">
      <Panel title="Copy scale">
        <box direction="column" gap={8}>
          <H1>Vexart Preview</H1>
          <H2>Engine status</H2>
          <Lead>Pixel-native UI primitives running in the terminal.</Lead>
          <P>Typography tokens should stay consistent across documentation, overlays and dashboards.</P>
          <Muted>Muted helper text for secondary metadata.</Muted>
          <Small>Small print and auxiliary notes.</Small>
        </box>
      </Panel>
    </SceneFrame>
  )
}
