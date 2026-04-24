import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

function Checkbox(props: { checked: boolean; label: string; disabled?: boolean }) {
  return (
    <box direction="row" gap={8} alignY="center" opacity={props.disabled ? 0.55 : 1}>
      <box width={16} height={16} cornerRadius={4} backgroundColor={props.checked ? 0x2563ebff : 0x18181bff} borderColor={props.checked ? 0x60a5faff : 0x52525bff} borderWidth={1} alignX="center" alignY="center">
        {props.checked ? <text color={0xf8fafcff} fontSize={10}>✓</text> : null}
      </box>
      <text color={0xe4e4e7ff} fontSize={12}>{props.label}</text>
    </box>
  )
}

function Switch(props: { checked: boolean; label: string; disabled?: boolean }) {
  return (
    <box direction="row" gap={8} alignY="center" opacity={props.disabled ? 0.55 : 1}>
      <box width={36} height={20} backgroundColor={props.checked ? 0x22c55eff : 0x3f3f46ff} cornerRadius={999}>
        <box width={14} height={14} backgroundColor={0xf8fafcff} cornerRadius={999} paddingLeft={props.checked ? 19 : 3} paddingTop={3} />
      </box>
      <text color={0xe4e4e7ff} fontSize={12}>{props.label}</text>
    </box>
  )
}

export function Scene() {
  return (
    <SceneFrame title="Components · Checkbox and switch visuals" subtitle="Boolean control states">
      <box direction="row" gap={16}>
        <Panel title="Checkboxes" width={180}>
          <box direction="column" gap={10}>
            <Checkbox checked label="Auto refresh" />
            <Checkbox checked={false} label="Notify on deploy" />
            <Checkbox checked label="Disabled" disabled />
          </box>
        </Panel>
        <Panel title="Switches" width={180}>
          <box direction="column" gap={10}>
            <Switch checked label="Production" />
            <Switch checked={false} label="Preview mode" />
            <Switch checked label="Locked" disabled />
          </box>
        </Panel>
      </box>
    </SceneFrame>
  )
}
