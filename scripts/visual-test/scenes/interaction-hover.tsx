import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

function App() {
  return (
    <SceneFrame title="Interaction · Hover" subtitle="Pointer hover styles after movement">
      <Panel title="Hover target">
        <box width={180} height={96} backgroundColor={0x1f2937ff} cornerRadius={16} hoverStyle={{ backgroundColor: 0x2563ebff, glow: { radius: 14, color: 0x38bdf8ff, intensity: 70 } }} />
      </Panel>
    </SceneFrame>
  )
}

export function render() {
  return renderToBufferAfterInteractions(() => <App />, width, height, async (helpers) => {
    await helpers.pointerMove(72, 122)
  })
}
