import { createWindowManager, LIGHTCODE_WINDOW_STATUS, type LightcodeWindowManager, type LightcodeWindowSnapshot } from "./window-manager"
import { LightcodeDesktop } from "./desktop"
import { lightcodeWindowTokens } from "./tokens"

export interface LightcodeAppProps {
  width: number
  height: number
}

function rect(width: number, height: number, x: number, y: number, w: number, h: number) {
  const scale = Math.max(1, Math.min(width / 1280, height / 760))
  return {
    x: Math.round(x * scale),
    y: Math.round(y * scale),
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  }
}

export function createLightcodeDemoManager(width: number, height: number): LightcodeWindowManager {
  const manager = createWindowManager({
    desktop: { width, height, inset: 18 },
    windows: [
      {
        id: "memory",
        title: "Memory",
        subtitle: "LC_TOKENS",
        rect: rect(width, height, 46, 310, 440, 230),
      },
      {
        id: "diff",
        title: "Diff / Changes",
        subtitle: "review",
        rect: rect(width, height, 775, 86, 470, 270),
      },
      {
        id: "editor",
        title: "Compute Shader Pipeline",
        subtitle: "v_engine.zig",
        rect: rect(width, height, 470, 210, 610, 360),
      },
      {
        id: "agent",
        title: "Agent",
        subtitle: "Running",
        rect: rect(width, height, 810, 560, 440, 220),
      },
      {
        id: "runner",
        title: "Runner",
        subtitle: "minimized",
        rect: rect(width, height, 540, 510, 320, 180),
        status: LIGHTCODE_WINDOW_STATUS.MINIMIZED,
      },
    ],
  })
  manager.focus("editor")
  return manager
}

function CodeLine(props: { line: string; number: number; accent?: boolean }) {
  const tokens = lightcodeWindowTokens
  return (
    <box
      direction="row"
      gap={10}
      height={18}
      alignY="center"
      paddingLeft={4}
      paddingRight={4}
      backgroundColor={props.accent ? tokens.colors.accentWash : "#00000000"}
      borderColor={props.accent ? tokens.colors.contentBorder : "#00000000"}
      borderWidth={props.accent ? 1 : 0}
      cornerRadius={3}
    >
      <text color="#ffffff55" fontSize={11} lineHeight={13}>{String(props.number).padStart(2, " ")}</text>
      <text color={props.accent ? tokens.colors.accent : tokens.colors.foreground} fontSize={12} lineHeight={14}>{props.line}</text>
    </box>
  )
}

function EditorContent() {
  const tokens = lightcodeWindowTokens
  return (
    <box direction="column" gap={8} width="grow" height="grow">
      <box direction="row" alignY="center" alignX="space-between" height={24} paddingX={8} backgroundColor="#ffffff08" borderColor={tokens.colors.contentBorder} borderWidth={1} cornerRadius={4}>
        <box direction="row" alignY="center" gap={7}>
          <text color={tokens.colors.accent} fontSize={12}>[]</text>
          <text color={tokens.colors.foreground} fontSize={12}>v_engine.zig</text>
        </box>
        <box direction="row" gap={8}>
          <text color={tokens.colors.faint} fontSize={11}>*</text>
          <text color={tokens.colors.faint} fontSize={11}>[]</text>
          <text color={tokens.colors.faint} fontSize={11}>...</text>
        </box>
      </box>
      <box direction="row" alignY="center" gap={8} paddingBottom={4} borderBottom={1} borderColor={tokens.colors.divider}>
        <text color={tokens.colors.accent} fontSize={13}>[]</text>
        <text color={tokens.colors.foreground} fontSize={14} fontWeight={600}>Compute Shader Pipeline</text>
        <text color={tokens.colors.muted} fontSize={12}>{"> GPU"}</text>
      </box>
      <box direction="column" gap={2}>
        <CodeLine number={1} accent line="fn compute_shader_pipeline(engine) {" />
        <CodeLine number={2} line="  const shader = shader();" />
        <CodeLine number={3} line="  let color = { 0, 0, 1 };" />
        <CodeLine number={4} line="  let coff = 0;" />
        <CodeLine number={5} line="  let p: f32 = 0;" />
        <CodeLine number={6} line="" />
        <CodeLine number={7} accent line="  if (memory::vertex_buffer)" />
        <CodeLine number={8} line="    color = sample(memory.x, a0);" />
        <CodeLine number={9} line="  else if" />
        <CodeLine number={10} line="    memory::camera_matrix[0, 1];" />
        <CodeLine number={11} line="}" />
      </box>
      <box direction="row" alignY="center" gap={8} height={24} borderTop={1} borderColor={tokens.colors.divider}>
        <text color={tokens.colors.muted} fontSize={11}>o</text>
        <text color={tokens.colors.muted} fontSize={11}>return v_engine</text>
      </box>
    </box>
  )
}

function MemoryContent() {
  const tokens = lightcodeWindowTokens
  return (
    <box direction="column" gap={10} width="grow">
      <box direction="row" gap={5}>
        <text color={tokens.colors.foreground} fontSize={14} fontWeight={600}>LC_TOKENS :</text>
        <text color={tokens.colors.accent} fontSize={14} fontWeight={600}>accentGolden.focusView</text>
      </box>
      <box direction="row" gap={8}>
        <box padding={8} backgroundColor="#ffffff08" borderColor={tokens.colors.divider} borderWidth={1} cornerRadius={4}>
          <text color={tokens.colors.accent} fontSize={12}>bufferSize  888:3704</text>
        </box>
        <box padding={8} backgroundColor="#ffffff05" borderColor={tokens.colors.divider} borderWidth={1} cornerRadius={4}>
          <text color={tokens.colors.muted} fontSize={12}>{"buffer > [396]"}</text>
        </box>
      </box>
      <box direction="column" gap={6}>
        <text color={tokens.colors.muted} fontSize={13}>References</text>
        <box padding={7} backgroundColor="#ffffff08" borderColor={tokens.colors.contentBorder} borderWidth={1} cornerRadius={4} direction="row" alignX="space-between">
          <text color={tokens.colors.foreground} fontSize={11}>function_buffer_init()</text>
          <text color={tokens.colors.muted} fontSize={11}>25</text>
        </box>
        <box padding={7} backgroundColor="#ffffff0d" borderColor={tokens.colors.contentBorder} borderWidth={1} cornerRadius={4} direction="row" alignX="space-between">
          <text color={tokens.colors.foreground} fontSize={11}>{"buffer.size > builtin.zig"}</text>
          <text color={tokens.colors.muted} fontSize={11}>33</text>
        </box>
      </box>
    </box>
  )
}

function DiffContent() {
  const tokens = lightcodeWindowTokens
  return (
    <box direction="column" gap={8} width="grow">
      <box direction="row" alignY="center" gap={8} padding={7} backgroundColor="#ffffff09" borderColor={tokens.colors.borderFocused} borderWidth={1} cornerRadius={4}>
        <text color={tokens.colors.accent} fontSize={13}>{">"}</text>
        <text color={tokens.colors.foreground} fontSize={13}>LightEngine.zig</text>
      </box>
      <CodeLine number={1} line="import lightcomponents;" />
      <CodeLine number={2} line="import lightcompute;" />
      <CodeLine number={3} line="" />
      <CodeLine number={4} accent line="type: EngineStatement.LightConfig" />
      <box alignX="right" paddingTop={4}>
        <box paddingX={12} paddingY={6} backgroundColor="#d8a85333" borderColor={tokens.colors.borderFocused} borderWidth={1} cornerRadius={4}>
          <text color={tokens.colors.accent} fontSize={11}>Swap Changes</text>
        </box>
      </box>
    </box>
  )
}

function AgentContent() {
  const tokens = lightcodeWindowTokens
  return (
    <box direction="column" gap={8} width="grow">
      <box padding={8} backgroundColor="#ffffff09" borderColor={tokens.colors.borderFocused} borderWidth={1} cornerRadius={4}>
        <text color={tokens.colors.foreground} fontSize={12}>Task. compute_shader_pipeline</text>
      </box>
      <box direction="row" gap={8}>
        <text color={tokens.colors.muted} fontSize={12}>Status ·</text>
        <text color={tokens.colors.accent} fontSize={12}>Success</text>
      </box>
      <text color={tokens.colors.foreground} fontSize={12}>Runtime · Buffer</text>
      <text color={tokens.colors.muted} fontSize={12}>· file batch compiled 12.60, 7/6</text>
      <text color={tokens.colors.muted} fontSize={12}>· sprite pipeline completed by compositor</text>
      <box height={24} borderColor={tokens.colors.divider} borderWidth={1} cornerRadius={4} paddingX={8} alignY="center">
        <text color={tokens.colors.muted} fontSize={11}>{">"}</text>
      </box>
    </box>
  )
}

function WindowContent(props: { window: LightcodeWindowSnapshot }) {
  if (props.window.id === "editor") return <EditorContent />
  if (props.window.id === "memory") return <MemoryContent />
  if (props.window.id === "diff") return <DiffContent />
  return <AgentContent />
}

export function LightcodeApp(props: LightcodeAppProps) {
  const manager = createLightcodeDemoManager(props.width, props.height)
  return (
    <LightcodeDesktop
      manager={manager}
      width={props.width}
      height={props.height}
      renderWindow={(window) => <WindowContent window={window} />}
    />
  )
}
