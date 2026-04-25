import { For } from "solid-js"
import { Box, Text } from "@vexart/app"
import type { LightcodeOsWindowSnapshot } from "./window-manager"
import { lightcodeTheme } from "./theme"

function Label(props: { children: string; color?: number; width?: number }) {
  return <Text color={props.color ?? lightcodeTheme.color.textSoft} fontSize={11}>{props.children}</Text>
}

function Pill(props: { label: string; active?: boolean; width?: number }) {
  return (
    <Box width={props.width ?? 88} height={22} className="rounded-md" alignX="center" alignY="center" backgroundColor={props.active ? 0xffc96a24 : 0xffffff0d} borderColor={props.active ? 0xffc96a77 : 0xffffff15} borderWidth={1}>
      <Text color={props.active ? lightcodeTheme.color.gold : lightcodeTheme.color.textSoft} fontSize={10}>{props.label}</Text>
    </Box>
  )
}

function CodeLine(props: { n: number; text: string; accent?: boolean; warn?: boolean }) {
  return (
    <box width="grow" height={20} direction="row" gap={10} alignY="center" backgroundColor={props.accent ? 0xffc96a0c : props.warn ? 0xff5a3d14 : 0x00000000}>
      <box width={24} alignX="right"><text color={lightcodeTheme.color.faint} fontSize={10}>{String(props.n)}</text></box>
      <text color={props.accent ? lightcodeTheme.color.gold : props.warn ? lightcodeTheme.color.red : lightcodeTheme.color.text} fontSize={11}>{props.text}</text>
    </box>
  )
}

export function EditorPanel() {
  const lines = [
    "fn compute_shader_pipeline(engine) {",
    "  const graph = engine.graph();",
    "  let shader = graph.bind('vertex');",
    "  let color = vec4(1.0, 0.77, 0.31, 1.0);",
    "",
    "  if (memory.vertex_buffer) {",
    "    shader.dispatch(memory.vertex_buffer);",
    "    engine.emit('golden_path');",
    "  } else {",
    "    engine.rebuild_camera_matrix();",
    "  }",
    "}",
  ]

  return (
    <box width="grow" height="grow" direction="column" gap={8}>
      <box width="grow" height={28} direction="row" alignY="center" alignX="space-between" paddingX={8} cornerRadius={8} backgroundColor={0x00000026} borderColor={0xffffff14} borderWidth={1}>
        <box direction="row" gap={6}><Pill label="v_engine.zig" active width={98} /><Pill label="pipeline" width={82} /></box>
        <text color={lightcodeTheme.color.muted} fontSize={10}>GPU / compute</text>
      </box>
      <box width="grow" height="grow" direction="column" padding={8} cornerRadius={9} backgroundColor={0x05070c88} borderColor={0xffffff12} borderWidth={1}>
        <For each={lines}>{(line, index) => <CodeLine n={index() + 1} text={line} accent={index() === 3 || index() === 7} />}</For>
      </box>
      <box width="grow" height={24} direction="row" alignY="center" alignX="space-between">
        <text color={lightcodeTheme.color.muted} fontSize={10}>main / return v_engine</text>
        <box width={112} height={22} alignX="center" alignY="center" cornerRadius={7} gradient={lightcodeTheme.gradient.gold}><text color={0x15100aff} fontSize={10}>Ship Change</text></box>
      </box>
    </box>
  )
}

export function DiffPanel() {
  return (
    <box width="grow" height="grow" direction="column" gap={8}>
      <box width="grow" height={28} direction="row" alignY="center" alignX="space-between" paddingX={8} cornerRadius={8} backgroundColor={0xffffff0b} borderColor={0xffffff16} borderWidth={1}>
        <text color={lightcodeTheme.color.gold} fontSize={11}>LightEngine.zig</text>
        <text color={lightcodeTheme.color.muted} fontSize={10}>+42 -8</text>
      </box>
      <box width="grow" height="grow" direction="column" padding={8} cornerRadius={9} backgroundColor={0x05070c88} borderColor={0xffffff12} borderWidth={1}>
        <CodeLine n={1} text="+ import light.compute;" accent />
        <CodeLine n={2} text="+ import graph.dispatch;" accent />
        <CodeLine n={3} text="" />
        <CodeLine n={4} text="- type EngineState = old.Context" warn />
        <CodeLine n={5} text="+ type EngineState = LightcodeEffects" accent />
        <CodeLine n={6} text="+ pub fn compile_pipeline()" accent />
      </box>
    </box>
  )
}

export function MemoryPanel() {
  return (
    <box width="grow" height="grow" direction="column" gap={9}>
      <Label color={lightcodeTheme.color.gold}>LC_TOKENS: accentGolden.focusView</Label>
      <box width="grow" height={34} direction="row" gap={8}>
        <box width={150} height={34} padding={8} cornerRadius={7} backgroundColor={0xffffff0c} borderColor={0xffffff16} borderWidth={1}><Label>bufferSize    888:3704</Label></box>
        <box width={126} height={34} padding={8} cornerRadius={7} backgroundColor={0xffffff0c} borderColor={0xffffff16} borderWidth={1}><Label>{"buffer > [396]"}</Label></box>
      </box>
      <box width="grow" height="grow" direction="column" padding={8} cornerRadius={8} backgroundColor={0x05070c88} borderColor={0xffffff12} borderWidth={1} gap={4}>
        <box direction="row" alignX="space-between"><Label>References</Label><Label color={lightcodeTheme.color.muted}>score</Label></box>
        <box height={22} direction="row" alignY="center" alignX="space-between" paddingX={6} backgroundColor={0xffffff0b}><Label>function_buffer.init()</Label><Label color={lightcodeTheme.color.faint}>25</Label></box>
        <box height={22} direction="row" alignY="center" alignX="space-between" paddingX={6} backgroundColor={0xffffff12}><Label>buffer.size + bundle.zig</Label><Label color={lightcodeTheme.color.faint}>23</Label></box>
      </box>
    </box>
  )
}

export function AgentPanel() {
  return (
    <box width="grow" height="grow" direction="column" gap={8}>
      <box height={30} direction="row" alignY="center" alignX="space-between" paddingX={8} cornerRadius={8} backgroundColor={0xffc96a16} borderColor={0xffc96a66} borderWidth={1}>
        <text color={lightcodeTheme.color.gold} fontSize={11}>Task.compute_shader_pipeline</text>
        <text color={lightcodeTheme.color.muted} fontSize={10}>running</text>
      </box>
      <box width="grow" height="grow" direction="column" padding={9} gap={6} cornerRadius={9} backgroundColor={0x05070c88} borderColor={0xffffff12} borderWidth={1}>
        <Label>Success: subtask graph resolved</Label>
        <Label color={lightcodeTheme.color.green}>✓ Buffer contract verified</Label>
        <Label>• file batch compiled 12.68ms / 766 nodes</Label>
        <Label>• shader pipeline completed by compute agent</Label>
      </box>
      <box height={24} direction="row" gap={7} alignY="center"><Pill label="logs" active width={58} /><Pill label="trace" width={58} /><Pill label="cancel" width={66} /></box>
    </box>
  )
}

export function RunnerPanel() {
  return (
    <box width="grow" height="grow" alignX="center" alignY="center" direction="column" gap={8}>
      <box width={44} height={44} cornerRadius={12} gradient={lightcodeTheme.gradient.gold} glow={lightcodeTheme.shadow.glow} alignX="center" alignY="center"><text color={0x17110aff} fontSize={13}>run</text></box>
      <Label>Pipeline hot reload ready</Label>
      <Label color={lightcodeTheme.color.muted}>click taskbar buttons to restore minimized tools</Label>
    </box>
  )
}

export function LightcodeWindowContent(props: { window: LightcodeOsWindowSnapshot }) {
  if (props.window.kind === "editor") return <EditorPanel />
  if (props.window.kind === "diff") return <DiffPanel />
  if (props.window.kind === "memory") return <MemoryPanel />
  if (props.window.kind === "agent") return <AgentPanel />
  return <RunnerPanel />
}
