/**
 * Focused real-Solid interaction smoke tests for the Void/headless controls.
 *
 * This intentionally runs as a script instead of a Bun test: Bun's test
 * loader can compile imported TSX before the repository Solid JSX plugin is
 * registered. Running this file with `bun --conditions=browser run` exercises
 * the same universal JSX renderer used by the examples.
 */

import assert from "node:assert/strict"
import { createSignal } from "solid-js"
import { dispatchInput } from "../packages/engine/src/loop/input"
import { renderToBuffer, renderToBufferAfterInteractions } from "../packages/engine/src/testing/render-to-buffer"
import { Tabs } from "../packages/headless/src/containers/tabs"
import { Textarea, type TextareaHandle } from "../packages/headless/src/inputs/textarea"

const mods = { shift: false, alt: false, ctrl: false, meta: false }

function keyPress(key: string, char = "") {
  dispatchInput({ type: "key", key, char, mods })
}

function pixelDelta(left: Uint8Array, right: Uint8Array) {
  let delta = 0
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) delta++
  }
  return delta
}

async function textareaSmoke() {
  const [value, setValue] = createSignal("one")
  let handle: TextareaHandle | undefined
  const scene = () => (
    <box width={360} height={160}>
      <Textarea
        ref={(next) => { handle = next }}
        value={value()}
        onChange={setValue}
        width={320}
        height={120}
      />
    </box>
  )

  const initial = await renderToBuffer(scene, 360, 160)

  const result = await renderToBufferAfterInteractions(
    scene,
    360,
    160,
    async ({ frame }) => {
      // First focus is assigned by the real focus registry. Exercise a
      // multiline edit, vertical navigation, and deletion in one burst.
      keyPress("end")
      keyPress("x", "x")
      keyPress("enter")
      keyPress("a", "a")
      keyPress("up")
      keyPress("end")
      keyPress("backspace")
      await frame()
    },
  )

  const litPixels = result.pixels.reduce((count, value, index) => count + (index % 4 === 3 && value > 0 ? 1 : 0), 0)
  assert.equal(value(), "one\na")
  assert.equal(handle?.cursorRow, 0)
  assert.equal(handle?.cursorCol, 3)
  assert.ok(litPixels > 500, `Textarea render was empty (${litPixels} non-transparent pixels)`)
  assert.ok(pixelDelta(initial.pixels, result.pixels) > 32, "Textarea pixels did not change after multiline edit")
}

async function tabsSmoke() {
  const [active, setActive] = createSignal(0)
  const transitions: number[] = []
  const tabs = Array.from({ length: 4 }, (_, index) => ({
    label: `Tab ${index}`,
    content: () => (
      <box width={320} height={80} backgroundColor={0x123456ff}>
        <text color={0xffffffff}>{`Panel ${index}`}</text>
      </box>
    ),
  }))

  const result = await renderToBufferAfterInteractions(
    () => (
      <Tabs
        activeTab={active()}
        onTabChange={(index) => { transitions.push(index); setActive(index) }}
        tabs={tabs}
        renderTab={(tab, ctx) => (
          <box {...ctx.tabProps} focusable width={80} height={24}>
            <text>{tab.label}</text>
          </box>
        )}
      />
    ),
    420,
    220,
    async ({ frame }) => {
      // No inter-frame delay: this is the regression trigger for the previous
      // recursive Solid update/RangeError during rapid tab navigation.
      for (let index = 0; index < 65; index++) {
        keyPress("right")
        if (index % 8 === 0) await Promise.resolve()
      }
      await frame()
    },
  )

  const litPixels = result.pixels.reduce((count, value, index) => count + (index % 4 === 3 && value > 0 ? 1 : 0), 0)
  assert.equal(transitions.length, 65, `Expected 65 tab transitions, got ${transitions.length}`)
  assert.deepEqual(transitions.slice(0, 4), [1, 2, 3, 0])
  assert.equal(active(), 1)
  assert.ok(litPixels > 500, `Tabs render was empty (${litPixels} non-transparent pixels)`)
}

async function tabsFocusPanelSmoke() {
  const [active, setActive] = createSignal(0)
  const transitions: number[] = []
  const tabs = Array.from({ length: 3 }, (_, index) => ({
    label: `Tab ${index}`,
    content: () => (
      <box width={320} height={80} backgroundColor={0x234567ff}>
        <box focusable width={120} height={20}><text color={0xffffffff}>{`Panel ${index} A`}</text></box>
        <box focusable width={120} height={20}><text color={0xffffffff}>{`Panel ${index} B`}</text></box>
      </box>
    ),
  }))

  const result = await renderToBufferAfterInteractions(
    () => (
      <Tabs
        activeTab={active()}
        onTabChange={(index) => { transitions.push(index); setActive(index) }}
        tabs={tabs}
        renderTab={(tab, ctx) => (
          <box {...ctx.tabProps} focusable width={80} height={24}>
            <text>{tab.label}</text>
          </box>
        )}
      />
    ),
    420,
    220,
    async ({ frame }) => {
      // This interleaves active-panel replacement with focus cleanup. Before
      // the focus repair fix it overflowed the Solid reconciliation stack.
      for (let index = 0; index < 100; index++) {
        keyPress("right")
        keyPress("tab")
        if (index % 8 === 0) await Promise.resolve()
      }
      await frame()
    },
  )

  const litPixels = result.pixels.reduce((count, value, index) => count + (index % 4 === 3 && value > 0 ? 1 : 0), 0)
  assert.ok(transitions.length > 0, "Rapid focus/panel navigation produced no tab transitions")
  assert.ok(transitions.every((index) => index >= 0 && index < tabs.length))
  assert.ok(litPixels > 500, `Rapid focus/panel render was empty (${litPixels} non-transparent pixels)`)
}

await textareaSmoke()
await tabsSmoke()
await tabsFocusPanelSmoke()
console.log("void interaction smoke: PASS (Textarea multiline + rapid Tabs navigation + focus/panel cleanup)")
