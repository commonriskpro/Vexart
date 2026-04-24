import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Effects · Backdrop blur" subtitle="Glassmorphism over layered gradients">
      <box width="grow" height={220} cornerRadius={18} gradient={{ type: "linear", from: 0x0f172aff, to: 0x1d4ed8ff, angle: 30 }}>
        <box direction="row" gap={16} padding={18}>
          <box width={120} height={140} backgroundColor={0xffffff14} backdropBlur={8} cornerRadius={18} borderColor={0xffffff24} borderWidth={1} />
          <box width={120} height={140} backgroundColor={0xffffff18} backdropBlur={14} cornerRadius={18} borderColor={0xffffff2e} borderWidth={1} />
          <box width={120} height={140} backgroundColor={0xffffff10} backdropBlur={20} cornerRadius={18} borderColor={0xffffff22} borderWidth={1} />
        </box>
      </box>
    </SceneFrame>
  )
}
