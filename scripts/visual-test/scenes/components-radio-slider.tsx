import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH, sampleRadioOptions } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

function Radio(props: { selected: boolean; label: string }) {
  return (
    <box direction="row" gap={8} alignY="center">
      <box width={16} height={16} backgroundColor={0x18181bff} cornerRadius={999} borderColor={props.selected ? 0x22c55eff : 0x52525bff} borderWidth={1} alignX="center" alignY="center">
        {props.selected ? <box width={8} height={8} backgroundColor={0x22c55eff} cornerRadius={999} /> : null}
      </box>
      <text color={0xe4e4e7ff} fontSize={12}>{props.label}</text>
    </box>
  )
}

function SliderBar(props: { percentage: number }) {
  return (
    <box direction="row" gap={8} alignY="center">
      <box width={160} height={6} backgroundColor={0x3f3f46ff} cornerRadius={999}>
        <box width={`${props.percentage}%`} height={6} backgroundColor={0x2563ebff} cornerRadius={999} />
      </box>
      <text color={0xe4e4e7ff} fontSize={11}>{props.percentage}</text>
    </box>
  )
}

export function Scene() {
  return (
    <SceneFrame title="Components · Radio and slider visuals" subtitle="Selection and range controls">
      <box direction="row" gap={16}>
        <Panel title="Release channel" width={180}>
          <box direction="column" gap={10}>
            {sampleRadioOptions.map((option) => <Radio selected={option.value === "stable"} label={option.label} />)}
          </box>
        </Panel>
        <Panel title="Concurrency" width={180}>
          <box direction="column" gap={14}>
            <SliderBar percentage={72} />
            <SliderBar percentage={24} />
          </box>
        </Panel>
      </box>
    </SceneFrame>
  )
}
