/**
 * Production-route input interaction parity scene.
 *
 * The final frame is reached through the public Void components and their
 * real callbacks.  The render oracle checks each callback state before the
 * direct-vs-SHM pixel comparison runs.
 */

import assert from "node:assert/strict"
import { createSignal, type JSX } from "solid-js"
import { setFocus } from "@vexart/engine"
import {
  VoidCheckbox,
  VoidCombobox,
  VoidInput,
  VoidRadioGroup,
  VoidSelect,
  VoidSlider,
  VoidSwitch,
  VoidTextarea,
  darkTheme,
  getTheme,
  setTheme,
  themeColors,
} from "@vexart/styled"
import {
  renderToBufferAfterInteractions,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 840
export const height = 620

const SUCCESS = 0x22c55eff
const FAILURE = 0xdc2626ff

type InputProbe = {
  text: () => string
  area: () => string
  checked: () => boolean
  switched: () => boolean
  radio: () => string
  slider: () => number
  selected: () => string
  combo: () => string
  events: string[]
}

type AppProps = {
  onReady?: (probe: InputProbe) => void
}

function Marker(props: { ok: boolean }) {
  return (
    <box
      width={8}
      height={8}
      cornerRadius={4}
      backgroundColor={props.ok ? SUCCESS : FAILURE}
    />
  )
}

function Label(props: { children: string }) {
  return (
    <box height={16}>
      <text color={themeColors.mutedForeground} fontSize={10}>{props.children}</text>
    </box>
  )
}

function Result(props: { ok: boolean; children: string }) {
  return (
    <box direction="row" gap={8} alignY="center" height={20}>
      <Marker ok={props.ok} />
      <text color={props.ok ? themeColors.mutedForeground : themeColors.destructive} fontSize={10}>{props.children}</text>
    </box>
  )
}

function Card(props: { title: string; children?: JSX.Element }) {
  return (
    <box
      width={380}
      height={470}
      direction="column"
      gap={6}
      padding={16}
      backgroundColor={themeColors.card}
      borderColor={themeColors.border}
      borderWidth={1}
      cornerRadius={10}
    >
      <box height={20}>
        <text color={themeColors.foreground} fontSize={16}>{props.title}</text>
      </box>
      {props.children}
    </box>
  )
}

function App(props: AppProps = {}) {
  const [text, setText] = createSignal("")
  const [area, setArea] = createSignal("Draft\nNotes")
  const [checked, setChecked] = createSignal(false)
  const [switched, setSwitched] = createSignal(false)
  const [radio, setRadio] = createSignal("preview")
  const [slider, setSlider] = createSignal(40)
  const [selected, setSelected] = createSignal("alpha")
  const [combo, setCombo] = createSignal("")
  const events: string[] = []
  const [eventCount, setEventCount] = createSignal(0)

  const record = (event: string) => {
    events.push(event)
    setEventCount(events.length)
  }
  const changeText = (value: string) => { record(`text:${value}`); setText(value) }
  const changeArea = (value: string) => { record(`area:${value}`); setArea(value) }
  const changeChecked = (value: boolean) => { record(`checked:${value}`); setChecked(value) }
  const changeSwitched = (value: boolean) => { record(`switch:${value}`); setSwitched(value) }
  const changeRadio = (value: string) => { record(`radio:${value}`); setRadio(value) }
  const changeSlider = (value: number) => { record(`slider:${value}`); setSlider(value) }
  const changeSelected = (value: string) => { record(`select:${value}`); setSelected(value) }
  const changeCombo = (value: string) => { record(`combo:${value}`); setCombo(value) }

  props.onReady?.({ text, area, checked, switched, radio, slider, selected, combo, events })

  return (
    <box
      width={width}
      height={height}
      backgroundColor={themeColors.background}
      direction="column"
      gap={16}
      padding={24}
    >
      <box height={50} direction="column" gap={4}>
        <box height={28}>
          <text color={themeColors.foreground} fontSize={22}>Inputs · mounted interaction</text>
        </box>
        <text color={themeColors.mutedForeground} fontSize={11}>Void production controls · callbacks and pixel surfaces</text>
      </box>

      <box direction="row" gap={16} height={470}>
        <Card title="Text editing">
          <Label>VoidInput · printable edit</Label>
          <VoidInput
            value={text()}
            onChange={changeText}
            placeholder="Type a value"
            focusId="inputs-text"
            width={340}
          />
          <Result ok={text() === "ok"}>{`value=${text() || "(empty)"}`}</Result>

          <Label>VoidTextarea · multiline edit</Label>
          <VoidTextarea
            value={area()}
            onChange={changeArea}
            focusId="inputs-area"
            width={340}
            height={96}
          />
          <Result ok={area() === "Draft\nNotes!"}>{`lines=${area().split("\n").length} · ${area().endsWith("!") ? "edited" : "initial"}`}</Result>

          <box height={72} direction="column" gap={4}>
            <text color={themeColors.foreground} fontSize={11}>Real callback log</text>
            <text color={themeColors.mutedForeground} fontSize={10}>{`${eventCount()} changes · ${events.at(-1) ?? "waiting"}`}</text>
            <text color={themeColors.mutedForeground} fontSize={10}>Input and textarea remain controlled</text>
          </box>
        </Card>

        <Card title="Selection and controls">
          <VoidCheckbox
            checked={checked()}
            onChange={changeChecked}
            label="Enable notifications"
            focusId="inputs-checkbox"
          />
          <Result ok={checked()}>{`checkbox=${checked() ? "on" : "off"}`}</Result>

          <VoidSwitch
            checked={switched()}
            onChange={changeSwitched}
            label="Dark mode"
            focusId="inputs-switch"
          />
          <Result ok={switched()}>{`switch=${switched() ? "on" : "off"}`}</Result>

          <VoidRadioGroup
            value={radio()}
            onChange={changeRadio}
            focusId="inputs-radio"
            options={[
              { value: "preview", label: "Preview" },
              { value: "stable", label: "Stable" },
              { value: "canary", label: "Canary" },
            ]}
          />
          <Result ok={radio() === "stable"}>{`radio=${radio()}`}</Result>

          <VoidSlider
            value={slider()}
            onChange={changeSlider}
            min={0}
            max={100}
            step={5}
            focusId="inputs-slider"
            width={340}
          />
          <Result ok={slider() === 50}>{`slider=${slider()}`}</Result>

          <VoidSelect
            value={selected()}
            onChange={changeSelected}
            focusId="inputs-select"
            width={340}
            options={[
              { value: "alpha", label: "Alpha" },
              { value: "beta", label: "Beta" },
              { value: "gamma", label: "Gamma" },
            ]}
          />
          <Result ok={selected() === "beta"}>{`select=${selected()}`}</Result>

          <VoidCombobox
            value={combo()}
            onChange={changeCombo}
            placeholder="Search frameworks"
            focusId="inputs-combo"
            width={340}
            options={[
              { value: "rust", label: "Rust" },
              { value: "ruby", label: "Ruby" },
              { value: "go", label: "Go" },
            ]}
          />
          <Result ok={combo() === "rust"}>{`combobox=${combo() || "(empty)"}`}</Result>
        </Card>
      </box>

      <box height={16} direction="row" gap={8} alignY="center">
        <Marker ok={eventCount() >= 10} />
        <text color={themeColors.mutedForeground} fontSize={10}>Interaction oracle: all mounted controls updated through callbacks</text>
      </box>
    </box>
  )
}

export function Scene() {
  return <App />
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

function countColor(frame: RenderToBufferResult, color: readonly number[], left: number, top: number, right: number, bottom: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sample = pixel(frame, x, y)
      if (sample.every((value, channel) => value === color[channel])) count++
    }
  }
  return count
}

export async function render(options?: RenderToBufferOptions) {
  const originalTheme = getTheme()
  setTheme(darkTheme)
  let probe: InputProbe | undefined

  try {
    const frame = await renderToBufferAfterInteractions(
      () => <App onReady={(value) => { probe = value }} />,
      width,
      height,
      async ({ frame: nextFrame, keyPress }) => {
        if (!probe) throw new Error("input probe was not mounted")

        setFocus("inputs-text")
        await nextFrame()
        await keyPress("o", "o")
        await keyPress("k", "k")
        assert.equal(probe.text(), "ok")

        setFocus("inputs-area")
        await nextFrame()
        await keyPress("!", "!")
        assert.equal(probe.area(), "Draft\nNotes!")

        setFocus("inputs-checkbox")
        await nextFrame()
        await keyPress(" ")
        assert.equal(probe.checked(), true)

        setFocus("inputs-switch")
        await nextFrame()
        await keyPress(" ")
        assert.equal(probe.switched(), true)

        setFocus("inputs-radio")
        await nextFrame()
        await keyPress("down")
        assert.equal(probe.radio(), "stable")

        setFocus("inputs-slider")
        await nextFrame()
        await keyPress("right")
        await keyPress("right")
        assert.equal(probe.slider(), 50)

        setFocus("inputs-select")
        await nextFrame()
        await keyPress("enter")
        await keyPress("down")
        await keyPress("enter")
        assert.equal(probe.selected(), "beta")

        setFocus("inputs-combo")
        await nextFrame()
        await keyPress("r", "r")
        await keyPress("u", "u")
        await keyPress("enter")
        assert.equal(probe.combo(), "rust")

        assert.ok(probe.events.includes("text:ok"))
        assert.ok(probe.events.includes("area:Draft\nNotes!"))
        assert.ok(probe.events.includes("checked:true"))
        assert.ok(probe.events.includes("switch:true"))
        assert.ok(probe.events.includes("radio:stable"))
        assert.ok(probe.events.includes("slider:50"))
        assert.ok(probe.events.includes("select:beta"))
        assert.ok(probe.events.includes("combo:rust"))
      },
      2,
      options,
    )

    assert.ok(probe)
    assert.ok(probe.events.length >= 10, `expected mounted callbacks, got ${probe.events.length}`)
    return frame
  } finally {
    setTheme(originalTheme)
  }
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)
  assert.deepEqual(pixel(frame, 2, 2), new Uint8Array([10, 10, 10, 255]))
  assert.deepEqual(pixel(frame, 30, 100), new Uint8Array([23, 23, 23, 255]))
  assert.deepEqual(pixel(frame, 426, 100), new Uint8Array([23, 23, 23, 255]))

  // Each status marker is rendered only after its control reaches the
  // callback-backed final value; exact centers check fixed geometry and color.
  const success = new Uint8Array([34, 197, 94, 255])
  assert.deepEqual(pixel(frame, 44, 204), success, "input callback marker is missing")
  assert.deepEqual(pixel(frame, 44, 354), success, "textarea callback marker is missing")
  assert.deepEqual(pixel(frame, 440, 164), success, "checkbox callback marker is missing")
  assert.deepEqual(pixel(frame, 440, 216), success, "switch callback marker is missing")
  assert.deepEqual(pixel(frame, 440, 312), success, "radio callback marker is missing")
  assert.deepEqual(pixel(frame, 440, 356), success, "slider callback marker is missing")
  assert.deepEqual(pixel(frame, 440, 424), success, "select callback marker is missing")
  assert.deepEqual(pixel(frame, 440, 492), success, "combobox callback marker is missing")
  assert.deepEqual(pixel(frame, 28, 584), success, "aggregate callback marker is missing")
  assert.ok(countColor(frame, [229, 229, 229, 255], 420, 90, 800, 560) > 100, "selected control geometry/color is missing")
}
