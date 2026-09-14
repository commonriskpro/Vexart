import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Input,
  Slider,
  ToggleSwitch as Switch,
  onInput,
} from "vexart"
import { Button, DemoFooter, Label, Pane, useDemo, ui } from "./shared"

export type EffectsTab = "surface" | "gradient" | "glass"

export type EffectsValues = {
  color: string
  opacity: number
  radius: number
  blur: number
  saturation: number
  shadow: boolean
  shadowBlur: number
  shadowY: number
}

export const defaultEffectsValues: EffectsValues = {
  color: "#FFFFFF",
  opacity: 12,
  radius: 18,
  blur: 24,
  saturation: 140,
  shadow: true,
  shadowBlur: 32,
  shadowY: 8,
}

export function createEffectsController(initial: EffectsValues = defaultEffectsValues) {
  const [values, setValues] = createSignal<EffectsValues>({ ...initial })
  const setValue = <K extends keyof EffectsValues>(key: K, value: EffectsValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }
  const reset = () => setValues({ ...defaultEffectsValues })
  return { values, setValue, reset }
}

function alphaHex(opacity: number) {
  return Math.round(Math.max(0, Math.min(100, opacity)) * 2.55).toString(16).padStart(2, "0")
}

export function normalizeHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null
}

function colorWithAlpha(color: string, opacity: number) {
  return `${(normalizeHexColor(color) ?? "#FFFFFF").toLowerCase()}${alphaHex(opacity)}`
}

function gradientColors(opacity: number) {
  const alpha = alphaHex(opacity)
  return { from: `#fb6a5f${alpha}`, to: `#064e4e${alpha}` }
}

export function effectsSnippet(tab: EffectsTab, values: EffectsValues) {
  const lines = ["<box"]
  const background = colorWithAlpha(values.color, values.opacity)
  if (tab === "gradient") {
    const colors = gradientColors(values.opacity)
    lines.push(`  backgroundColor="${background}"`)
    lines.push(`  gradient={{ type: "linear", from: "${colors.from}", to: "${colors.to}", angle: 32 }}`)
  } else {
    lines.push(`  backgroundColor="${background}"`)
  }
  lines.push(`  cornerRadius={${values.radius}}`)
  if (tab === "glass") {
    lines.push(`  backdropBlur={${values.blur}}`)
    lines.push(`  backdropSaturate={${values.saturation}}`)
  }
  if (values.shadow) {
    lines.push(`  shadow={{ x: 0, y: ${values.shadowY}, blur: ${values.shadowBlur}, color: "#00000022" }}`)
  }
  lines.push("/>")
  return lines.join("\n")
}

function rangeLabel(value: number, unit = "") {
  return `${value}${unit}`
}

function DemoSlider(props: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  width?: number
}) {
  const demo = useDemo()
  return (
    <Slider
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onChange={props.onChange}
      renderSlider={(ctx) => (
        <box
          {...ctx.trackProps}
          width={demo.s(props.width ?? 218)}
          height={demo.s(28)}
            backgroundColor="#00000000"
          focusStyle={{ borderColor: "#ffffff", borderWidth: demo.s(1) }}
        >
          <box
            width={demo.s(props.width ?? 218)}
            height={demo.s(6)}
            floating="parent"
            floatOffset={{ x: 0, y: demo.s(11) }}
            pointerPassthrough
            backgroundColor="#393d3f"
            cornerRadius={demo.s(3)}
          />
          <box
            width={demo.s((props.width ?? 218) * (ctx.percentage / 100))}
            height={demo.s(6)}
            floating="parent"
            floatOffset={{ x: 0, y: demo.s(11) }}
            pointerPassthrough
            backgroundColor="#f1f2f2"
            cornerRadius={demo.s(3)}
          />
          <box
            width={demo.s(18)}
            height={demo.s(18)}
            floating="parent"
            floatOffset={{ x: demo.s((props.width ?? 218) * (ctx.percentage / 100) - 9), y: demo.s(5) }}
            pointerPassthrough
            backgroundColor="#f1f2f2"
            cornerRadius={demo.s(9)}
          />
        </box>
      )}
    />
  )
}

function PropertySlider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  y: number
  onChange: (value: number) => void
}) {
  const demo = useDemo()
  return (
    <Pane x={22} y={props.y} width={390} height={42}>
      <Label x={0} y={0} size={16} color="#d8dcdd">{props.label}</Label>
      <Pane x={101} y={1} width={220} height={18}>
        <DemoSlider value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
      </Pane>
      <Label x={330} y={0} width={62} size={16} color="#d8dcdd">{rangeLabel(props.value, props.unit)}</Label>
    </Pane>
  )
}

function SectionRule(props: { y: number }) {
  return <Pane x={22} y={props.y} width={386} height={1} fill="#35383a" />
}

function ColorInput(props: { value: string; onChange: (value: string) => void }) {
  return (
    <ColorInputField value={props.value} onChange={props.onChange} />
  )
}

function ColorInputField(props: { value: string; onChange: (value: string) => void }) {
  const demo = useDemo()
  const [draft, setDraft] = createSignal(props.value)
  createEffect(() => setDraft(props.value))
  return (
    <Pane x={22} y={123} width={390} height={34}>
      <Label x={0} y={6} size={16} color="#d8dcdd">Color</Label>
      <Pane x={101} y={0} width={34} height={34} fill={props.value} radius={4} />
      <Pane x={147} y={0} width={238} height={34}>
        <Input
          value={draft()}
          onChange={(value) => {
            setDraft(value)
            const color = normalizeHexColor(value)
            if (color) props.onChange(color)
          }}
          focusId="effects-color"
          renderInput={(ctx) => (
            <box
              {...ctx.inputProps}
              width={demo.s(238)}
              height={demo.s(34)}
              direction="row"
              alignY="center"
              paddingX={demo.s(11)}
              borderWidth={demo.s(1)}
              borderColor={ctx.focused ? "#8f999e" : "#4a4e50"}
              cornerRadius={demo.s(4)}
              backgroundColor="#1d2021"
            >
              <text fontFamily={ui.mono} fontSize={Math.round(demo.s(16))} color="#e2e5e6" pointerPassthrough>{ctx.displayText}</text>
              <Show when={ctx.focused && ctx.blink}>
                <box floating="parent" floatOffset={{ x: demo.s(11 + ctx.cursor * 9.6), y: demo.s(7) }} width={demo.s(1.5)} height={demo.s(19)} backgroundColor="#e2e5e6" pointerPassthrough />
              </Show>
            </box>
          )}
        />
      </Pane>
    </Pane>
  )
}

function ShadowSwitch(props: { checked: boolean; onChange: (checked: boolean) => void }) {
  const demo = useDemo()
  return (
    <Switch
      checked={props.checked}
      onChange={props.onChange}
      renderSwitch={(ctx) => (
        <box
          {...ctx.toggleProps}
          width={demo.s(60)}
          height={demo.s(34)}
          backgroundColor={ctx.checked ? "#dfe2e3" : "#414547"}
          cornerRadius={demo.s(17)}
          focusStyle={{ borderColor: "#ffffff", borderWidth: demo.s(1) }}
        >
          <box
            width={demo.s(28)}
            height={demo.s(28)}
            floating="parent"
            floatOffset={{ x: demo.s(ctx.checked ? 29 : 3), y: demo.s(3) }}
            backgroundColor={ctx.checked ? "#ffffff" : "#aeb4b5"}
            cornerRadius={demo.s(14)}
          />
        </box>
      )}
    />
  )
}

function Preview(props: { tab: EffectsTab; values: EffectsValues; width: number; height: number }) {
  const ribbonPath = new URL("./assets/effects/ribbons.png", import.meta.url).pathname
  const dots = Array.from({ length: 18 * 9 }, (_, index) => ({
    x: (index % 18) * 56 + 15,
    y: Math.floor(index / 18) * 56 + 14,
  }))
  const offsetX = () => Math.max(43, Math.round((props.width - 1020) / 2))
  const offsetY = () => Math.max(44, Math.round((props.height - 535) / 2))
  return (
    <box width="100%" height="grow" backgroundColor="#101313" borderColor="#303435" borderBottom={1} viewportClip>
      <Label x={28} y={19} size={13} mono color="#858b8c">PREVIEW</Label>
      <For each={dots}>{(dot) => <box width={2} height={2} floating="parent" floatOffset={{ x: dot.x, y: dot.y + 18 }} backgroundColor="#ffffff18" cornerRadius={1} />}</For>
      <box floating="parent" floatOffset={{ x: offsetX(), y: offsetY() }} width={1020} height={535}>
        <img src={ribbonPath} width={1020} height={535} objectFit="cover" cornerRadius={2} />
        <box
          floating="parent"
          floatOffset={{ x: 254, y: 122 }}
          width={514}
          height={292}
          backgroundColor={colorWithAlpha(props.values.color, props.values.opacity)}
          gradient={props.tab === "gradient" ? { type: "linear", ...gradientColors(props.values.opacity), angle: 32 } : undefined}
          cornerRadius={props.values.radius}
          borderColor="#ffffffb8"
          borderWidth={1}
          backdropBlur={props.tab === "glass" ? props.values.blur : undefined}
          backdropSaturate={props.tab === "glass" ? props.values.saturation : undefined}
          shadow={props.values.shadow ? { x: 0, y: props.values.shadowY, blur: props.values.shadowBlur, color: "#00000022" } : undefined}
          alignX="center"
          alignY="center"
          direction="column"
          gap={8}
        >
          <text color="#ffffff" fontFamily={ui.sans} fontSize={72} fontWeight={700}>
            {props.tab === "surface" ? "Surface" : props.tab === "gradient" ? "Gradient" : "Glass"}
          </text>
          <text color="#d7dadb" fontFamily={ui.sans} fontSize={24}>
            {props.tab === "surface" ? "Opacity · " + props.values.opacity + "%" : props.tab === "gradient" ? "Linear gradient · 32°" : "Backdrop blur · " + props.values.blur + " px"}
          </text>
        </box>
        <box floating="parent" floatOffset={{ x: 938, y: 492 }} width={62} height={26} alignX="center" alignY="center" backgroundColor="#8b4e3f" cornerRadius={9}>
          <text color="#ffffff" fontSize={13} fontFamily={ui.sans}>100%</text>
        </box>
      </box>
    </box>
  )
}

function Inspector(props: {
  values: EffectsValues
  setValue: <K extends keyof EffectsValues>(key: K, value: EffectsValues[K]) => void
  reset: () => void
}) {
  return (
    <box width={434} height="100%" backgroundColor="#121515" borderColor="#303435" borderLeft={1}>
      <Label x={22} y={21} size={20} weight={700} color="#f1f2f2">Properties</Label>
      <SectionRule y={56} />
      <Label x={22} y={80} size={18} weight={700} color="#f1f2f2">Surface</Label>
      <ColorInput value={props.values.color} onChange={(value) => props.setValue("color", value)} />
      <PropertySlider label="Opacity" value={props.values.opacity} min={0} max={100} unit="%" y={174} onChange={(v) => props.setValue("opacity", v)} />
      <SectionRule y={227} />
      <Label x={22} y={249} size={18} weight={700} color="#f1f2f2">Corners</Label>
      <PropertySlider label="Radius" value={props.values.radius} min={0} max={48} unit=" px" y={300} onChange={(v) => props.setValue("radius", v)} />
      <SectionRule y={354} />
      <Label x={22} y={376} size={18} weight={700} color="#f1f2f2">Backdrop</Label>
      <PropertySlider label="Blur" value={props.values.blur} min={0} max={48} unit=" px" y={427} onChange={(v) => props.setValue("blur", v)} />
      <PropertySlider label="Saturation" value={props.values.saturation} min={0} max={200} unit="%" y={478} onChange={(v) => props.setValue("saturation", v)} />
      <SectionRule y={532} />
      <Label x={22} y={551} size={18} weight={700} color="#f1f2f2">Shadow</Label>
      <Pane x={22} y={589} width={390} height={40}>
        <Label x={0} y={6} size={16} color="#d8dcdd">Enabled</Label>
        <Pane x={326} y={0} width={60} height={34}><ShadowSwitch checked={props.values.shadow} onChange={(v) => props.setValue("shadow", v)} /></Pane>
      </Pane>
      <PropertySlider label="Blur" value={props.values.shadowBlur} min={0} max={64} unit=" px" y={652} onChange={(v) => props.setValue("shadowBlur", v)} />
      <PropertySlider label="Y offset" value={props.values.shadowY} min={0} max={24} unit=" px" y={702} onChange={(v) => props.setValue("shadowY", v)} />
      <SectionRule y={758} />
      <Button x={22} y={776} width={160} height={38} id="reset" icon="arrow-counter-clockwise" label="Reset values" border={false} onPress={props.reset} align="left" />
    </box>
  )
}

function CopyAction(props: { x: number; y: number; tab: EffectsTab; values: EffectsValues; copy?: (text: string) => void | Promise<void> }) {
  const [status, setStatus] = createSignal<"idle" | "copied" | "error">("idle")
  const snippet = createMemo(() => effectsSnippet(props.tab, props.values))
  async function copySnippet() {
    if (!props.copy) {
      setStatus("error")
      return
    }
    try {
      await props.copy(snippet())
      setStatus("copied")
    } catch {
      setStatus("error")
    }
  }
  return <>
    <Button x={props.x} y={props.y} width={136} height={38} id="copy-jsx" icon="copy" label={status() === "copied" ? "Copied" : status() === "error" ? "Copy failed" : "Copy JSX"} primary onPress={copySnippet} />
    <Show when={status() !== "idle"}>
      <Label x={props.x - 78} y={props.y + 45} width={214} size={12} align="right" color={status() === "copied" ? "#7cdda4" : "#ff8585"}>{status() === "copied" ? "Copied to clipboard" : "Clipboard unavailable"}</Label>
    </Show>
  </>
}

function CodeLine(props: { line: string; y: number }) {
  const parts = props.line.match(/^(\s*)([A-Za-z]+)(.*)$/)
  return (
    <box floating="parent" floatOffset={{ x: 65, y: props.y }} width={980} height={20} direction="row" pointerPassthrough>
      <text flexShrink={0} fontFamily={ui.mono} fontSize={15} lineHeight={20} color="#5fc4f1" whiteSpace="pre-wrap" pointerPassthrough>{parts ? parts[1] + parts[2] : props.line}</text>
      <Show when={parts}>
        {match => <text flexShrink={0} fontFamily={ui.mono} fontSize={15} lineHeight={20} color="#e5b878" pointerPassthrough>{match()[3]}</text>}
      </Show>
    </box>
  )
}

function CodePanel(props: { tab: EffectsTab; values: EffectsValues; width: number }) {
  const snippet = createMemo(() => effectsSnippet(props.tab, props.values))
  const lines = createMemo(() => snippet().split("\n"))
  const boxWidth = () => Math.max(400, props.width - 56)
  return (
    <box width="100%" height={234} backgroundColor="#111414">
      <Label x={28} y={19} size={19} weight={700} color="#f1f2f2">JSX</Label>
      <Label x={82} y={21} size={15} color="#8a9091">Illustrative snippet</Label>
      <box floating="parent" floatOffset={{ x: 28, y: 50 }} width={boxWidth()} height={170} backgroundColor="#0d1010" borderColor="#383c3d" borderWidth={1} cornerRadius={5}>
        <For each={lines()}>{(_, index) => <Label x={22} y={14 + index() * 20} size={15} mono color="#7f8788">{String(index() + 1)}</Label>}</For>
        <For each={lines()}>{(line, index) => <CodeLine line={line} y={14 + index() * 20} />}</For>
      </box>
    </box>
  )
}

export function EffectsPlaygroundApp(props: {
  width?: number
  height?: number
  copy?: (text: string) => void | Promise<void>
  controller?: ReturnType<typeof createEffectsController>
}) {
  const width = () => props.width ?? 1536
  const height = () => props.height ?? 1024
  const [tab, setTab] = createSignal<EffectsTab>("glass")
  const controller = props.controller ?? createEffectsController()
  onMount(() => {
    const stopInput = onInput((event) => {
      if (event.type === "key" && event.key === "r") controller.reset()
    })
    onCleanup(stopInput)
  })

  const contentWidth = () => width() - 434
  const bodyHeight = () => height() - 60 - 44
  const previewHeight = () => Math.max(300, bodyHeight() - 234)
  const copyActionX = () => width() - 162

  return (
    <box width={width()} height={height()} direction="column" backgroundColor="#101313">
      {/* Top Header Bar */}
      <box width="100%" height={60} backgroundColor="#121515" borderColor="#303435" borderBottom={1}>
        <Label x={28} y={20} size={21} weight={700} color="#f1f2f2">Effects Playground</Label>
        <Button x={260} y={0} width={88} height={60} id="surface" label="Surface" border={false} onPress={() => setTab("surface")} />
        <Button x={348} y={0} width={92} height={60} id="gradient" label="Gradient" border={false} onPress={() => setTab("gradient")} />
        <Button x={440} y={0} width={88} height={60} id="glass" label="Glass" border={false} onPress={() => setTab("glass")} />
        <Show when={tab() === "surface"}><Pane x={276} y={57} width={56} height={3} fill="#f1f2f2" /></Show>
        <Show when={tab() === "gradient"}><Pane x={366} y={57} width={56} height={3} fill="#f1f2f2" /></Show>
        <Show when={tab() === "glass"}><Pane x={456} y={57} width={56} height={3} fill="#f1f2f2" /></Show>
        <CopyAction x={copyActionX()} y={12} tab={tab()} values={controller.values()} copy={props.copy} />
      </box>

      {/* Main Body */}
      <box width="100%" height="grow" direction="row">
        {/* Left Column: Preview + CodePanel */}
        <box width="grow" height="100%" direction="column">
          <Preview tab={tab()} values={controller.values()} width={contentWidth()} height={previewHeight()} />
          <CodePanel tab={tab()} values={controller.values()} width={contentWidth()} />
        </box>

        {/* Right Column: Inspector */}
        <Inspector values={controller.values()} setValue={controller.setValue} reset={controller.reset} />
      </box>

      {/* Footer */}
      <DemoFooter hints={[
        { keys: "Tab", label: "Next control" },
        { keys: "← →", label: "Adjust" },
        { keys: "R", label: "Reset" },
      ]} />
    </box>
  )
}

export default EffectsPlaygroundApp
