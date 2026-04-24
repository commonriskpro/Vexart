import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Primitives · Border and padding" subtitle="Uniform and per-side borders">
      <box direction="row" gap={16}>
        <Panel title="Uniform border" width={180}>
          <box padding={12} borderColor={0x38bdf8ff} borderWidth={2} cornerRadius={10}>
            <text color={0xe4e4e7ff} fontSize={13}>Padded content</text>
          </box>
        </Panel>
        <Panel title="Per-side border" width={180}>
          <box padding={12} borderColor={0xf59e0bff} borderTop={3} borderRight={1} borderBottom={5} borderLeft={2} cornerRadius={10}>
            <text color={0xe4e4e7ff} fontSize={13}>Asymmetric border</text>
          </box>
        </Panel>
      </box>
    </SceneFrame>
  )
}
