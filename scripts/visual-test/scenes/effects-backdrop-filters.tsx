import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Backdrop filters" subtitle="Brightness, contrast and saturate adjustments">
      <box width="grow" height={220} cornerRadius={18} gradient={{ type: "linear", from: 0x7c3aedff, to: 0x0f172aff, angle: 120 }}>
        <box direction="row" gap={16} padding={18}>
          <box width={110} height={140} backgroundColor={0xffffff18} backdropBlur={10} backdropBrightness={130} cornerRadius={18} />
          <box width={110} height={140} backgroundColor={0xffffff16} backdropBlur={10} backdropContrast={140} cornerRadius={18} />
          <box width={110} height={140} backgroundColor={0xffffff16} backdropBlur={10} backdropSaturate={40} cornerRadius={18} />
        </box>
      </box>
    </SceneFrame>
  )
}
