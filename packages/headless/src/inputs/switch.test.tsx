import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import {
  createNode,
  resetFocus,
  solidRender,
  type TGENode,
} from "@vexart/engine/internal"
import { Switch } from "./switch"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function first(root: TGENode) {
  const node = root.children[0]
  if (!node) throw new Error("expected a rendered root child")
  return node
}

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

beforeEach(() => resetFocus())
afterEach(() => resetFocus())

suite("headless Switch", () => {
  test("renders renderSwitch directly without a wrapper box", () => {
    const root = createNode("root")
    const [checked, setChecked] = createSignal(false)

    const dispose = renderScene(root, () => (
      <Switch
        checked={checked()}
        onChange={setChecked}
        renderSwitch={(ctx) => (
          <box {...ctx.toggleProps} className="custom-switch-node">
            <text>{ctx.checked ? "on" : "off"}</text>
          </box>
        )}
      />
    ))

    try {
      // The child of root should directly be the element returned by renderSwitch
      const visual = first(root)
      expect(visual.props.className).toBe("custom-switch-node")
      expect(typeof visual.props.onPress).toBe("function")

      // Toggle via click
      ;(visual.props.onPress as () => void)()
      expect(checked()).toBe(true)
    } finally {
      dispose()
    }
  })
})
