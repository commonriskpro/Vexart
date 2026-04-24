import { createSignal } from "solid-js"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"
import { Panel, SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

function App() {
  const [pressed, setPressed] = createSignal(false)

  return (
    <SceneFrame title="Interaction · Press" subtitle="State update after onPress">
      <Panel title="Press target">
        <box
          width={180}
          height={88}
          backgroundColor={pressed() ? 0x22c55eff : 0x1f2937ff}
          cornerRadius={16}
          onPress={() => setPressed(true)}
          alignX="center"
          alignY="center"
        >
          <text color={0xf8fafcff} fontSize={14}>{pressed() ? "Pressed" : "Waiting"}</text>
        </box>
      </Panel>
    </SceneFrame>
  )
}

export function render() {
  return renderToBufferAfterInteractions(() => <App />, width, height, async (helpers) => {
    await helpers.clickAt(82, 126)
  })
}
