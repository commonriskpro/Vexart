import { expect, test } from "bun:test"
import { focusedId } from "vexart"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

const width = 1280
const height = 720

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

test("source-public shell selects a boot user and returns from simulated rest", async () => {
  const store = createPs5Store(createDefaultSeed())
  let bootFocus: string | null = null
  let movedFocus: string | null = null
  let selectedFocus: string | null = null
  let returnedFocus: string | null = null

  const result = await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ clickAt, keyPress, frame }) => {
      // Timers are part of the mounted app. Waiting here deliberately avoids
      // dispatching boot/finish by hand in a test of the shell.
      await wait(540)
      await frame()
      bootFocus = focusedId()
      expect(store.state().boot.status).toBe("ready")
      expect(bootFocus).toBe(`boot-user-${store.state().users[0]?.id}`)

      // Boot's F2 path is handled by the focused user card, not by a
      // preselected store action. Escape must return to that exact card.
      await keyPress("f2")
      expect(focusedId()).toBe("boot-user-options-select")
      await keyPress("escape")
      expect(focusedId()).toBe(bootFocus)

      await keyPress("right")
      movedFocus = focusedId()
      expect(movedFocus).toBe(`boot-user-${store.state().users[1]?.id}`)

      // Pointer activation is intentionally used for the selected card. The
      // centre of the responsive user row is the second card at both QA
      // viewports; this is the offscreen pointer-dispatch path, not a store
      // shortcut or a physical-terminal assertion.
      await clickAt(width * 0.5, height * 0.5)
      expect(store.state().boot.userSelected).toBe(true)
      expect(store.state().activeUserId).toBe(store.state().users[1]?.id)
      expect(store.state().screen).toBe("home")
      selectedFocus = focusedId()

      // F1 is dispatched through the mounted public app input layer. Traverse
      // the real control row, open Sound with Enter, and close exactly one
      // overlay at a time with Escape. This catches a bare control row that
      // never owns Escape, as well as accidental two-level pops.
      await keyPress("f1")
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-center")
      expect(focusedId()).toBe("control-home")
      for (let index = 0; index < 5; index++) await keyPress("right")
      expect(focusedId()).toBe("control-sound")
      await keyPress("enter")
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-sound")
      expect(focusedId()).toBe("sound-mute")
      await keyPress("escape")
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-center")
      expect(focusedId()).toBe("control-sound")
      await keyPress("escape")
      expect(store.state().overlayStack).toHaveLength(0)
      // The selected card is the actual Home entry point for this seed.  The
      // shell must restore that entry focus rather than assuming the utility
      // row's play action is still focused after nested overlays close.
      expect(focusedId()).toBe(selectedFocus)

      // Enter the documented local power transition through the real store
      // action and exercise the mounted PowerOverlay's wake button by pointer.
      store.actions.requestPower("rest")
      await frame()
      expect(store.state().overlayStack.at(-1)?.id).toBe("power-confirm")
      store.actions.dispatch({ type: "power/complete", mode: "rest" })
      await frame()
      expect(store.state().powerMode).toBe("rest")
      expect(focusedId()).toBe("power-wake")

      await clickAt(width * 0.5, height * 0.53)
      await frame()
      expect(store.state().powerMode).toBe("on")
      expect(store.state().screen).toBe("home")
      returnedFocus = focusedId()
      expect(returnedFocus).toBe(selectedFocus)
    },
    2,
  )

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
  expect(result.pixels.some((pixel, index) => index % 4 === 3 && pixel > 0)).toBe(true)
  expect(bootFocus).toBeTruthy()
  expect(movedFocus).toBeTruthy()
  expect(selectedFocus).toBeTruthy()
  expect(returnedFocus).toBeTruthy()
})

test("F1 toggles the whole control center from a child branch", async () => {
  const store = createPs5Store(createDefaultSeed())
  store.actions.dispatch({ type: "boot/finish" })
  store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      const homeFocus = focusedId()
      expect(homeFocus?.startsWith("home-tile-")).toBe(true)
      await keyPress("f1")
      await frame()
      for (let index = 0; index < 5; index++) await keyPress("right")
      expect(focusedId()).toBe("control-sound")
      await keyPress("enter")
      await frame()
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-sound")
      await keyPress("f1")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)
      expect(focusedId()).toBe(homeFocus)
    },
    3,
  )
})
