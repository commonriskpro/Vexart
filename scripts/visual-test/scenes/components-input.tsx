import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

function Field(props: { value: string; placeholder?: string; disabled?: boolean }) {
  return (
    <box
      direction="row"
      alignY="center"
      width="100%"
      height={36}
      paddingLeft={12}
      paddingRight={12}
      backgroundColor={props.disabled ? 0x27272aff : 0x18181bff}
      borderColor={props.disabled ? 0x3f3f46ff : 0x52525bff}
      borderWidth={1}
      cornerRadius={10}
      opacity={props.disabled ? 0.6 : 1}
    >
      <text color={props.value ? 0xf8fafcff : 0x71717aff} fontSize={12}>{props.value || props.placeholder || ""}</text>
    </box>
  )
}

export function Scene() {
  return (
    <SceneFrame title="Components · Input visuals" subtitle="Single-line field states">
      <Panel title="Field states">
        <box direction="column" gap={10} width={280}>
          <Field value="vexart" />
          <Field value="" placeholder="Empty placeholder" />
          <Field value="disabled@example.com" disabled />
        </box>
      </Panel>
    </SceneFrame>
  )
}
