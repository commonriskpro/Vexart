/**
 * Runtime theme switching and form interaction parity scene.
 *
 * The scene deliberately uses the public theme signals and the real headless
 * Input/createForm APIs. Its render oracle exercises the state transitions
 * before the final light-theme frame is returned to the parity harness.
 */

import assert from "node:assert/strict"
import { createSignal } from "solid-js"
import { Input, createForm, type FormHandle } from "@vexart/headless"
import { focusedId, setFocus } from "@vexart/engine"
import {
  darkTheme,
  getTheme,
  lightTheme,
  setTheme,
  themeColors,
} from "@vexart/styled"
import {
  renderToBuffer,
  renderToBufferAfterInteractions,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 620
export const height = 420

type Values = { name: string; email: string }

type FormProbe = {
  form: FormHandle<Values>
  submitted: () => boolean
  submittedName: () => string
}

type AppProps = {
  onReady?: (probe: FormProbe) => void
}

function App(props: AppProps = {}) {
  const [submitted, setSubmitted] = createSignal(false)
  const [submittedName, setSubmittedName] = createSignal("")
  const form = createForm<Values>({
    initialValues: { name: "", email: "" },
    validate: {
      name: (value) => value.trim().length < 2 ? "Name needs 2+ characters" : undefined,
      email: (value) => value.includes("@") ? undefined : "Email must include @",
    },
    validateOnChange: true,
    onSubmit: (values) => {
      setSubmittedName(`${values.name}/${values.email}`)
      setSubmitted(true)
    },
  })

  props.onReady?.({ form, submitted, submittedName })

  const submit = () => { void form.submit() }

  return (
    <box
      width={width}
      height={height}
      backgroundColor={themeColors.background}
      direction="column"
      gap={14}
      padding={24}
    >
      <box
        width="grow"
        height={72}
        backgroundColor={themeColors.card}
        borderColor={themeColors.border}
        borderWidth={1}
        cornerRadius={10}
        padding={16}
        direction="column"
        gap={5}
      >
        <text color={themeColors.foreground} fontSize={20}>Runtime theme + form</text>
        <text color={themeColors.mutedForeground} fontSize={12}>Dark → light keeps focus and updates rendered tokens</text>
      </box>

      <box width="grow" height={286} direction="row" gap={14}>
        <box
          width={388}
          height={286}
          backgroundColor={themeColors.card}
          borderColor={themeColors.border}
          borderWidth={1}
          cornerRadius={10}
          padding={16}
          direction="column"
          gap={5}
        >
          <text color={themeColors.foreground} fontSize={16}>Create account</text>
          <text color={themeColors.mutedForeground} fontSize={12}>Name</text>
          <box width={350} height={34}>
            <Input
              value={form.values.name()}
              onChange={(value) => form.setValue("name", value)}
              onSubmit={submit}
              placeholder="your name"
              focusId="form-name"
              width={350}
              height={34}
              renderInput={(ctx) => (
                <box
                  {...ctx.inputProps}
                  width={350}
                  height={34}
                  backgroundColor={themeColors.card}
                  borderColor={ctx.focused ? themeColors.ring : themeColors.input}
                  borderWidth={1}
                  cornerRadius={8}
                  paddingLeft={12}
                  alignY="center"
                >
                  <text color={ctx.showPlaceholder ? themeColors.mutedForeground : themeColors.foreground} fontSize={14}>{ctx.displayText}</text>
                </box>
              )}
            />
          </box>
          <text color={form.errors.name() ? themeColors.destructive : themeColors.mutedForeground} fontSize={11}>
            {form.errors.name() ?? "Name is ready"}
          </text>
          <text color={themeColors.mutedForeground} fontSize={12}>Email</text>
          <box width={350} height={34}>
            <Input
              value={form.values.email()}
              onChange={(value) => form.setValue("email", value)}
              onSubmit={submit}
              placeholder="you@example.com"
              focusId="form-email"
              width={350}
              height={34}
              renderInput={(ctx) => (
                <box
                  {...ctx.inputProps}
                  width={350}
                  height={34}
                  backgroundColor={themeColors.card}
                  borderColor={ctx.focused ? themeColors.ring : themeColors.input}
                  borderWidth={1}
                  cornerRadius={8}
                  paddingLeft={12}
                  alignY="center"
                >
                  <text color={ctx.showPlaceholder ? themeColors.mutedForeground : themeColors.foreground} fontSize={14}>{ctx.displayText}</text>
                </box>
              )}
            />
          </box>
          <text color={form.errors.email() ? themeColors.destructive : themeColors.mutedForeground} fontSize={11}>
            {form.errors.email() ?? "Email is ready"}
          </text>
          <box
            width={350}
            height={32}
            backgroundColor={themeColors.primary}
            cornerRadius={8}
            focusable
            onPress={submit}
            alignX="center"
            alignY="center"
          >
            <text color={themeColors.primaryForeground} fontSize={12}>
              {form.submitting() ? "Saving" : submitted() ? `Submitted ${submittedName()}` : "Submit (Enter)"}
            </text>
          </box>
          <text color={form.isValid() ? themeColors.mutedForeground : themeColors.destructive} fontSize={11}>
            {form.isValid() ? `Valid · dirty name=${form.dirty.name() ? "yes" : "no"}` : "Needs valid fields"}
          </text>
        </box>

        <box
          width={170}
          height={286}
          backgroundColor={themeColors.card}
          borderColor={themeColors.border}
          borderWidth={1}
          cornerRadius={10}
          padding={16}
          direction="column"
          gap={8}
        >
          <text color={themeColors.foreground} fontSize={14}>Theme tokens</text>
          <box width={138} height={42} backgroundColor={themeColors.primary} cornerRadius={6} />
          <box width={138} height={42} backgroundColor={themeColors.secondary} cornerRadius={6} />
          <box width={138} height={42} backgroundColor={themeColors.accent} cornerRadius={6} />
          <text color={themeColors.mutedForeground} fontSize={11}>
            {getTheme().colors.background === lightTheme.colors.background ? "Light active" : "Dark active"}
          </text>
          <text color={themeColors.mutedForeground} fontSize={10}>Global theme signals</text>
        </box>
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

function countNear(frame: RenderToBufferResult, color: readonly number[], left: number, top: number, right: number, bottom: number, tolerance: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sample = pixel(frame, x, y)
      if (sample[3] > 200 && sample.every((value, channel) => Math.abs(value - color[channel]) <= tolerance)) count++
    }
  }
  return count
}

export async function render(options?: RenderToBufferOptions) {
  const originalTheme = getTheme()

  try {
    // Establish a deterministic dark baseline, then render a separately
    // mounted scene so the pixel comparison observes a real signal update.
    setTheme(darkTheme)
    const dark = await renderToBuffer(() => <Scene />, width, height, 2, options)
    assert.equal(themeColors.background, darkTheme.colors.background)

    let probe: FormProbe | undefined
    const light = await renderToBufferAfterInteractions(
      () => <App onReady={(value) => { probe = value }} />,
      width,
      height,
      async ({ frame, keyPress }) => {
        if (!probe) throw new Error("form probe was not mounted")
        const { form } = probe

        // Drive a real Input through its onChange and onSubmit callbacks.
        setFocus("form-name")
        await frame()
        await keyPress("a", "a")
        assert.equal(form.values.name(), "a")
        assert.equal(form.dirty.name(), true)

        // Enter submits the mounted Input and exposes both validation errors.
        await keyPress("enter")
        await frame()
        assert.equal(form.touched.name(), true)
        assert.equal(form.touched.email(), true)
        assert.equal(form.errors.name(), "Name needs 2+ characters")
        assert.equal(form.errors.email(), "Email must include @")
        assert.equal(form.isValid(), false)
        assert.equal(probe.submitted(), false)

        // Correct both fields through the real Input controls, then submit
        // again through the email Input's onSubmit callback.
        await keyPress("l", "l")
        setFocus("form-email")
        await frame()
        await keyPress("a", "a")
        await keyPress("@", "@")
        await keyPress("b", "b")
        assert.deepEqual(form.getValues(), { name: "al", email: "a@b" })
        assert.equal(form.isValid(), true)
        await keyPress("enter")
        await frame()
        assert.equal(probe.submitted(), true)
        assert.equal(probe.submittedName(), "al/a@b")

        // Theme updates must not disturb the currently focused mounted Input.
        const beforeFocus = focusedId()
        assert.equal(beforeFocus, "form-email")
        const beforeColor = themeColors.background
        setTheme(lightTheme)
        assert.notEqual(beforeColor, themeColors.background)
        assert.equal(themeColors.background, lightTheme.colors.background)
        assert.equal(getTheme().colors.background, lightTheme.colors.background)
        await frame()
        assert.equal(focusedId(), beforeFocus)
      },
      2,
      options,
    )

    // Root and card probes are opaque interior pixels, making this a direct
    // assertion that computed theme colors changed the rendered frame.
    assert.deepEqual(pixel(dark, 2, 2), new Uint8Array([10, 10, 10, 255]))
    assert.deepEqual(pixel(light, 2, 2), new Uint8Array([255, 255, 255, 255]))
    assert.deepEqual(pixel(dark, 40, 40), new Uint8Array([23, 23, 23, 255]))
    assert.deepEqual(pixel(light, 40, 40), new Uint8Array([245, 245, 245, 255]))
    assert.notDeepEqual(pixel(dark, 2, 2), pixel(light, 2, 2))

    return light
  } finally {
    // Theme state is module-global; never leak the parity scene's preset.
    setTheme(originalTheme)
  }
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)
  assert.deepEqual(pixel(frame, 2, 2), new Uint8Array([255, 255, 255, 255]))
  assert.deepEqual(pixel(frame, 40, 40), new Uint8Array([245, 245, 245, 255]))
  assert.ok(countColor(frame, [23, 23, 23, 255], 40, 305, 390, 345) > 4_000, "submitted control surface is missing")
  assert.ok(countNear(frame, [250, 250, 250, 255], 50, 305, 380, 345, 16) > 10, "submitted label is missing")
}
