import { PiMarkdown } from "./markdown"
import { PiButton as VoidButton, PiIcon, PiToggle } from "./controls"
import type { PiIconName } from "./controls"
import { Box, Text } from "@vexart/app"
import {
  VoidDialog,
  VoidDialogDescription,
  VoidDialogFooter,
  VoidDialogTitle,
  VoidInput,
  VoidSelect,
} from "@vexart/styled"
import { Textarea, ScrollView } from "@vexart/headless"
import { focusedId, pushFocusScope, onInput, setFocus, useTerminalDimensions } from "@vexart/engine"
import type { KeyEvent, ScrollHandle } from "@vexart/engine"
import type { KeyBinding, TextareaHandle } from "@vexart/headless"
import { useAppTerminal } from "@vexart/app"
import { createEffect, createMemo, createSignal, onCleanup, onMount, For, Show } from "solid-js"
import type { PiController, PiExtensionRequest, PiMessage, PiModel, PiSnapshot, PiTreeNode, SubmitMode } from "./protocol"
import type { SessionSummary } from "./sessions"
import { buildTimeline, contentText, type TimelineBlock, type TimelineTool, type TimelineWorkItem } from "./timeline"
import { piColors, piFocus, piSpace, piType, type PiRailView } from "./theme"

export type PiAppProps = {
  controller: PiController
  cwd?: string
  width?: number
  height?: number
}

type AppSnapshot = () => PiSnapshot
type DisplaySettings = { thinking: boolean; tools: boolean }

const composerBindings: KeyBinding[] = [
  { key: "enter", action: "submit" },
  { key: "enter", alt: true, action: "submit" },
]

const localCommands = [
  { name: "model", description: "Cambiar modelo" },
  { name: "resume", description: "Abrir una sesión" },
  { name: "tree", description: "Explorar la conversación" },
  { name: "settings", description: "Abrir ajustes" },
  { name: "new", description: "Iniciar una sesión" },
  { name: "compact", description: "Compactar el contexto" },
]

function safeText(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function compactPath(path: string): string {
  const parts = path.split("/").filter(Boolean)
  if (parts.length <= 3) return path
  return `…/${parts.slice(-3).join("/")}`
}

function modelLabel(model: PiModel | null | undefined): string {
  if (!model) return "Modelo no disponible"
  const id = safeText(model.id) || safeText(model.name)
  const provider = safeText(model.provider)
  if (id === "unknown" && provider === "unknown") return "Modelo"
  if (!id && !provider) return "Modelo no disponible"
  return provider && id ? `${provider}/${id}` : provider || id
}

function modelKey(model: PiModel): string {
  const provider = safeText(model.provider)
  const id = safeText(model.id)
  return provider && id ? `${provider}/${id}` : id || provider
}

function modelCanSelect(model: PiModel): model is PiModel & { provider: string; id: string } {
  return safeText(model.provider).length > 0 && safeText(model.id).length > 0
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function focusSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 72)
}

function formatStat(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString()
  if (typeof value === "string") return value
  return ""
}

function RailButton(props: { active: boolean; focusId: string; label: string; glyph: PiIconName; onPress: () => void }) {
  return (
    <Box width={56} direction="row" alignY="center" gap={6}>
      <Box width={3} height={42} cornerRadius={2} backgroundColor={props.active ? piColors.mint : "#00000000"} />
    <VoidButton
      size="icon"
      variant={props.active ? "secondary" : "ghost"}
      focusId={props.focusId}
      onPress={props.onPress}
    >
      <PiIcon name={props.glyph} active={props.active} />
    </VoidButton>
    </Box>
  )
}

function PiRail(props: { view: PiRailView; setView: (view: PiRailView) => void }) {
  return (
    <Box
      width={piSpace.rail}
      height="grow"
      direction="column"
      alignX="center"
      paddingY={piSpace.row}
      gap={piSpace.compact}
      backgroundColor={piColors.surface}
      borderColor={piColors.border}
      borderWidth={1}
    >
      <Text color={piColors.text} fontSize={32} fontWeight={700}>π</Text>
      <Box height={24} />
      <RailButton active={props.view === "chat"} focusId={piFocus.railChat} label="Chat" glyph="chat" onPress={() => props.setView("chat")} />
      <RailButton active={props.view === "sessions"} focusId={piFocus.railSessions} label="Sesiones" glyph="sessions" onPress={() => props.setView("sessions")} />
      <RailButton active={props.view === "tree"} focusId={piFocus.railTree} label="Tree" glyph="tree" onPress={() => props.setView("tree")} />
      <Box height="grow" />
      <RailButton active={props.view === "settings"} focusId={piFocus.railSettings} label="Ajustes" glyph="settings" onPress={() => props.setView("settings")} />
    </Box>
  )
}

function Header(props: { snapshot: AppSnapshot; cwd?: string; view: PiRailView }) {
  const session = () => props.snapshot().extensionTitle || safeText(props.snapshot().state?.sessionName) || "Nueva conversación"
  return <Box height={62} width="grow" direction="row" alignY="center" paddingX={piSpace.page} gap={20} borderColor={piColors.border} borderWidth={1}>
    <Text color={piColors.text} fontSize={17} fontWeight={600}>pi / vexart</Text>
    <Box width={1} height={22} backgroundColor={piColors.borderStrong} />
    <Box width="grow"><Text color={piColors.secondary} fontSize={14}>{props.view === "chat" ? session() : props.view === "tree" ? "Árbol de conversación" : props.view === "sessions" ? "Sesiones" : "Ajustes"}</Text></Box>
    <Text color={piColors.secondary} fontSize={13}>{props.cwd?.split("/").filter(Boolean).at(-1) || "project"}</Text>
    <Show when={props.snapshot().busy}><Text color={piColors.mint} fontSize={12}>LIVE</Text></Show>
  </Box>
}

function workLabel(block: Extract<TimelineBlock, { kind: "work" }>) {
  if (block.items.some((item) => item.kind === "tool" && item.state === "running")) return "Working"
  if (block.durationMs === undefined) return "Worked"
  const seconds = Math.floor(block.durationMs / 1000)
  return `Worked for ${seconds >= 60 ? `${Math.floor(seconds / 60)}m ` : ""}${seconds % 60}s`
}

function TimelineToolRow(props: { tool: TimelineTool; expand: boolean }) {
  const [open, setOpen] = createSignal(props.expand)
  return <Box direction="column" width="grow" gap={12}>
    <VoidButton width="grow" variant="ghost" focusId={`pi-tool-${focusSlug(props.tool.id)}`} onPress={() => setOpen(!open())}>
      <Box direction="row" width="grow" alignY="center" gap={16}>
        <PiIcon name={props.tool.state === "done" ? "check" : "terminal"} active={props.tool.state === "done"} />
        <Text width="grow" color={props.tool.state === "error" ? piColors.red : piColors.secondary} fontSize={16}>{props.tool.name}{props.tool.summary ? `  ${props.tool.summary}` : ""}{props.tool.state === "running" ? " · ejecutando" : ""}</Text>
        <PiIcon name={open() ? "down" : "chevron"} />
      </Box>
    </VoidButton>
    <Show when={open()}><Box width="grow" paddingLeft={40}><Text color={piColors.secondary} fontSize={15} width="grow" whiteSpace="pre-wrap">{props.tool.detail}</Text></Box></Show>
  </Box>
}

function TimelineWorkItemView(props: { item: TimelineWorkItem; expand: boolean }) {
  if (props.item.kind === "commentary") {
    return (
      <Box direction="column" gap={4} paddingY={4} width="grow">
        <Show when={props.item.thinking}><Text color={piColors.dim} fontSize={piType.eyebrow}>Thinking</Text></Show>
        <Text color={props.item.thinking ? piColors.dim : piColors.secondary} fontSize={piType.body} whiteSpace="pre-wrap">{props.item.text}</Text>
      </Box>
    )
  }
  return <TimelineToolRow tool={props.item} expand={props.expand} />
}

function TimelineBlockView(props: { block: TimelineBlock; open: boolean; toggle: () => void; display: DisplaySettings }) {
  if (props.block.kind === "user") {
    return (
      <Box width="100%" direction="column" alignX="right" paddingY={piSpace.row}>
        <Box width="72%" padding={piSpace.row} backgroundColor={piColors.charcoal} cornerRadius={10}>
          <Text color={piColors.text} fontSize={piType.body} whiteSpace="pre-wrap">{props.block.text}</Text>
        </Box>
      </Box>
    )
  }
  if (props.block.kind === "assistant") {
    return (
      <Box width="100%" direction="column" paddingY={piSpace.row} gap={piSpace.compact}>
        <PiMarkdown content={props.block.text} />
        <Show when={props.block.streaming}>
          <Text color={piColors.mint} fontSize={piType.small}>Generating…</Text>
        </Show>
      </Box>
    )
  }
  if (props.block.kind === "system") {
    return (
      <Box width="100%" paddingY={piSpace.compact}>
        <Text color={piColors.dim} fontSize={piType.small} whiteSpace="pre-wrap">{props.block.text}</Text>
      </Box>
    )
  }
  return (
    <Box width="100%" direction="column" paddingY={piSpace.row}>
      <VoidButton width="grow" variant="ghost" size="sm" focusId={`pi-work-${focusSlug(props.block.id)}`} onPress={props.toggle}>
        <Box width="grow" direction="row" gap={16} alignY="center"><Show when={props.open} fallback={<PiIcon name="chevron" />}><PiIcon name="down" /></Show><Text width="grow" color={piColors.secondary} fontSize={piType.body}>{workLabel(props.block)}</Text></Box>
      </VoidButton>
      <Box width="grow" height={1} backgroundColor={piColors.borderStrong} marginTop={8} />
      <Show when={props.open}>
        <Box direction="column" width="grow" paddingTop={16} gap={16}>
          <For each={props.block.items.filter((item) => props.display.thinking || item.kind !== "commentary" || !item.thinking)}>{(item) => <TimelineWorkItemView item={item} expand={props.display.tools} />}</For>
        </Box>
      </Show>
    </Box>
  )
}

function TimelineView(props: { snapshot: AppSnapshot; display: DisplaySettings }) {
  const blocks = createMemo(() => buildTimeline(props.snapshot().messages, props.snapshot().events, props.snapshot().busy))
  const [open, setOpen] = createSignal<Record<string, boolean>>({})
  const isOpen = (block: TimelineBlock) => block.kind === "work" ? open()[block.id] ?? block.open : false
  const toggle = (block: TimelineBlock) => {
    if (block.kind !== "work") return
    setOpen((previous) => ({ ...previous, [block.id]: !isOpen(block) }))
  }
  return (
    <Box width="grow" height="grow" direction="column" paddingX={piSpace.page}>
      <Box width="grow" height="grow" scrollY scrollId="pi-timeline" direction="column" paddingY={piSpace.section}>
        <Show when={!props.snapshot().connected && props.snapshot().error}>
          <Text color={piColors.red} fontSize={piType.small}>{props.snapshot().error}</Text>
        </Show>
        <Show when={props.snapshot().compacting}>
          <Text color={piColors.amber} fontSize={piType.small}>Pi is compacting this session…</Text>
        </Show>
        <For each={blocks()}>{(block) => <TimelineBlockView block={block} open={isOpen(block)} toggle={() => toggle(block)} display={props.display} />}</For>
        <Show when={blocks().length === 0 && props.snapshot().connected}>
          <Box width="grow" height="grow" alignX="center" alignY="center" padding={piSpace.page}>
            <Text color={piColors.dim} fontSize={piType.body}>Start a prompt to begin this session.</Text>
          </Box>
        </Show>
      </Box>
    </Box>
  )
}

function ComposerField(props: { palette: boolean; value: string; width: number; busy: boolean; onChange: (value: string) => void; onSubmit: (value: string) => void; onKeyDown: (event: KeyEvent) => void; onComplete: () => string }) {
  // The slash editor is the sole keyboard entry in its temporary scope.
  // Tab therefore completes rather than traversing unrelated app controls.
  if (props.palette) onCleanup(pushFocusScope())
  let editor: TextareaHandle | undefined
  const stop = onInput((event) => {
    if (props.palette && event.type === "key" && event.key === "tab" && !event.mods.shift && focusedId() === piFocus.composer) { editor?.setText(props.onComplete()); setFocus(piFocus.composer) }
  })
  onCleanup(stop)
  return <Textarea ref={(handle) => { editor = handle }} value={props.value} onChange={props.onChange} onSubmit={props.onSubmit} onKeyDown={props.onKeyDown}
    placeholder={props.busy ? "Dirige a Pi o añade un mensaje a la cola…" : "Pregunta a Pi…"} width={props.width} height={58} focusId={piFocus.composer} keyBindings={composerBindings}
    theme={{ accent: piColors.mint, fg: piColors.text, muted: piColors.secondary, bg: "#00000000", disabledBg: piColors.surface, border: "#00000000", radius: 10, padding: piSpace.compact }} />
}

function Composer(props: { snapshot: AppSnapshot; controller: PiController; onError: (error: unknown) => void; width: () => number; draft: () => string; onDraftChange: (value: string) => void; onModel?: () => void; onView?: (view: PiRailView) => void; onAutocomplete?: (open: boolean) => void }) {
  const draft = props.draft
  const setDraft = props.onDraftChange
  const [mode, setMode] = createSignal<SubmitMode>("prompt")
  const [sending, setSending] = createSignal(false)
  const [dismissed, setDismissed] = createSignal(false)
  const [active, setActive] = createSignal(0)
  let menu: ScrollHandle | undefined
  createEffect(() => { draft(); setDismissed(false); setActive(0) })
  const suggestions = createMemo(() => {
    const text = draft()
    if (dismissed() || !text.startsWith("/") || /\s/.test(text)) return []
    const query = text.slice(1).split(/\s/, 1)[0].toLowerCase()
    const all = [...localCommands, ...props.snapshot().commands]
    const names = new Set<string>()
    return all.filter((command) => {
      if (!command.name.toLowerCase().startsWith(query) || names.has(command.name)) return false
      names.add(command.name)
      return true
    })
  })
  const stopAutocomplete = onInput((event) => { if (event.type === "key" && event.key === "escape" && suggestions().length > 0) { setDismissed(true); setFocus(piFocus.composer) } })
  onCleanup(stopAutocomplete)
  createEffect(() => props.onAutocomplete?.(suggestions().length > 0))
  onCleanup(() => props.onAutocomplete?.(false))
  const submit = (value: string) => {
    const text = value.trim()
    if (!text || sending()) return
    const local = text.match(/^\/([a-z-]+)(?:\s|$)/i)?.[1].toLowerCase()
    if (local && localCommands.some((command) => command.name === local)) {
      setDraft("")
      if (local === "model") props.onModel?.()
      if (local === "resume") props.onView?.("sessions")
      if (local === "tree") props.onView?.("tree")
      if (local === "settings") props.onView?.("settings")
      if (local === "new") void props.controller.command("new_session").then(() => props.controller.refresh()).catch(props.onError)
      if (local === "compact") void props.controller.command("compact").then(() => props.controller.refresh()).catch(props.onError)
      return
    }
    const shell = text.startsWith("!!") ? text.slice(2).trim() : text.startsWith("!") ? text.slice(1).trim() : ""
    if (shell) {
      setSending(true)
      void props.controller.command("bash", { command: shell, ...(text.startsWith("!!") ? { excludeFromContext: true } : {}) }).then(() => props.controller.refresh()).then(() => {
        if (draft().trim() === text) setDraft("")
      }).catch(props.onError).finally(() => setSending(false))
      return
    }
    const selectedMode = props.snapshot().busy
      ? mode() === "follow_up" ? "follow_up" : "steer"
      : mode()
    setSending(true)
    void props.controller.submit(text, selectedMode).then(() => {
      if (draft().trim() === text) setDraft("")
    }).catch(props.onError).finally(() => setSending(false))
  }
  const onKeyDown = (event: KeyEvent) => {
    if (suggestions().length && (event.key === "up" || event.key === "down")) {
      const next = Math.max(0, Math.min(suggestions().length - 1, active() + (event.key === "down" ? 1 : -1)))
      setActive(next)
      menu?.scrollIntoView(next * 40, 40)
      return
    }
    if (event.key !== "enter") return
    setMode(event.mods.alt ? "follow_up" : props.snapshot().busy ? "steer" : "prompt")
  }
  const chooseCommand = (name: string) => { setDraft(`/${name} `); setFocus(piFocus.composer) }
  const selectedText = () => suggestions()[active()] ? `/${suggestions()[active()].name} ` : draft()
  const submitEditor = (value: string) => submit(suggestions().length ? selectedText() : value)
  return (
    <Box width="grow" direction="column" paddingX={piSpace.page} paddingBottom={piSpace.section} gap={piSpace.compact}>
      <Show when={props.snapshot().queue.steering.length > 0 || props.snapshot().queue.followUp.length > 0}>
        <Box width="grow" direction="column" gap={4}>
          <Text color={piColors.secondary} fontSize={piType.eyebrow}>QUEUED</Text>
          <For each={[...props.snapshot().queue.steering, ...props.snapshot().queue.followUp]}>{(item) => <Text color={piColors.dim} fontSize={piType.small} whiteSpace="pre-wrap">↳ {item}</Text>}</For>
        </Box>
      </Show>
      <Show when={suggestions().length > 0}>
        <Box width="grow" direction="column" backgroundColor={piColors.surface} cornerRadius={12} shadow={{ x: 0, y: 8, blur: 28, color: 0x00000090 }} borderColor={piColors.borderStrong} borderWidth={1} padding={piSpace.compact}>
          <Text color={piColors.secondary} fontSize={16} padding={8}>Comandos</Text>
          <ScrollView ref={(handle) => { menu = handle }} width="grow" height={240} scrollY direction="column" showScrollbar={false}>
            <For each={suggestions()}>{(command, index) => <VoidButton variant={active() === index() ? "secondary" : "ghost"} height={40} size="sm" width="grow" focusId={`pi-command-${focusSlug(command.name)}`} onPress={() => chooseCommand(command.name)}>
              <Box direction="row" width="grow" gap={12} alignY="center">
                <Text color={active() === index() ? piColors.mint : piColors.text} fontSize={16}>/{command.name}</Text>
                <Box width="grow" />
                <Text color={piColors.secondary} fontSize={14}>{command.description || ("source" in command ? command.source : "") || ""}</Text>
              </Box>
            </VoidButton>}</For>
          </ScrollView>
          <Text color={piColors.secondary} fontSize={13} padding={12}>↑ ↓ navegar · Tab completar · Enter abrir · Esc cerrar</Text>
        </Box>
      </Show>
      <Box width="grow" direction="column" backgroundColor={piColors.surface} gradient={{ type: "linear", from: "#1b1e1d", to: "#101817", angle: 110 }} borderColor={piColors.mint} borderWidth={1.5} shadow={[{ x: 0, y: 2, blur: 18, color: 0x99f5d418 }, { x: 0, y: 6, blur: 24, color: 0x00000070 }]} cornerRadius={16} padding={12}>
        <Show when={suggestions().length > 0} fallback={<ComposerField palette={false} value={draft()} width={props.width()} busy={props.snapshot().busy} onChange={setDraft} onSubmit={submitEditor} onKeyDown={onKeyDown} onComplete={selectedText} />}>
          <ComposerField palette value={draft()} width={props.width()} busy={props.snapshot().busy} onChange={setDraft} onSubmit={submitEditor} onKeyDown={onKeyDown} onComplete={selectedText} />
        </Show>
        <Box direction="row" alignY="center" gap={piSpace.compact} paddingTop={piSpace.compact}>
          <VoidButton variant="ghost" size="sm" focusId="pi-open-commands" onPress={() => { setDraft("/"); setFocus(piFocus.composer) }}>/ comandos</VoidButton>
          <Box width="grow" />
          <VoidButton variant="ghost" size="sm" focusId={piFocus.model} onPress={props.onModel}>{modelLabel(props.snapshot().state?.model)}</VoidButton>
          <Show when={props.snapshot().busy} fallback={<VoidButton variant="default" size="icon" focusId="pi-submit" onPress={() => submit(draft())}><PiIcon name="send" ink /></VoidButton>}>
            <VoidButton variant="destructive" size="xs" focusId="pi-abort" onPress={() => void props.controller.stop().catch(props.onError)}>Stop</VoidButton>
          </Show>
        </Box>
      </Box>
    </Box>
  )
}

function StatusFooter(props: { snapshot: AppSnapshot }) {
  const state = () => props.snapshot().state
  const stats = () => props.snapshot().stats
  const pieces = createMemo(() => {
    const result: string[] = []
    const thinking = safeText(state()?.thinkingLevel)
    if (thinking) result.push(`Thinking: ${thinking}`)
    const count = formatStat(state()?.messageCount)
    if (count) result.push(`${count } mensajes`)
    const context = formatStat(stats()?.contextUsage)
    if (context) result.push(`context ${context}`)
    return result
  })
  return (
    <Box width="grow" height={48} borderWidth={1} borderColor={piColors.border} direction="row" alignY="center" paddingX={piSpace.page} gap={piSpace.row}>
      <Text color={props.snapshot().error ? piColors.red : piColors.dim} fontSize={piType.eyebrow}>{props.snapshot().error || (props.snapshot().connected ? "Pi connected" : "Connecting to Pi")}</Text>
      <Box width="grow" />
      <For each={pieces()}>{(piece, index) => <><Show when={index() > 0}><Text color={piColors.dim} fontSize={piType.eyebrow}>·</Text></Show><Text color={piColors.dim} fontSize={piType.eyebrow}>{piece}</Text></>}</For>
    </Box>
  )
}

function ChatView(props: { display: DisplaySettings; snapshot: AppSnapshot; controller: PiController; cwd?: string; onModel: () => void; onError: (error: unknown) => void; width: () => number; draft: () => string; onDraftChange: (value: string) => void; onView?: (view: PiRailView) => void; onAutocomplete?: (open: boolean) => void }) {
  return (
    <Box width="grow" height="grow" direction="column" backgroundColor={piColors.background}>
      <TimelineView snapshot={props.snapshot} display={props.display} />
      <Composer snapshot={props.snapshot} controller={props.controller} onError={props.onError} width={props.width} draft={props.draft} onDraftChange={props.onDraftChange} onModel={props.onModel} onView={props.onView} onAutocomplete={props.onAutocomplete} />
    </Box>
  )
}

function SessionsView(props: { snapshot: AppSnapshot; controller: PiController; onError: (error: unknown) => void; onOpen: () => void }) {
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [loading, setLoading] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [all, setAll] = createSignal(false)
  let generation = 0
  const load = () => {
    const current = ++generation
    setLoading(true)
    void props.controller.listSessions(all()).then((items) => { if (current === generation) setSessions(items) }).catch(props.onError).finally(() => { if (current === generation) setLoading(false) })
  }
  createEffect(load)
  onCleanup(() => generation++)
  const filtered = () => sessions().filter((item) => `${item.name || item.id} ${item.cwd}`.toLowerCase().includes(query().toLowerCase()))
  const open = (session: SessionSummary) => void props.controller.command("switch_session", { sessionPath: session.path }).then(props.onOpen).catch(props.onError)
  const fresh = () => void props.controller.command("new_session").then(props.onOpen).catch(props.onError)
  return <Box width="grow" height="grow" direction="column" padding={piSpace.page} gap={24}>
    <Box width="grow" direction="row" alignY="center" gap={12}>
      <Box width="grow"><Text color={piColors.text} fontSize={28} fontWeight={600}>Sesiones</Text></Box>
      <VoidButton variant="secondary" outlined focusId="pi-new-session" onPress={fresh}>+ Nueva sesión</VoidButton>
    </Box>
    <Box width="grow" direction="row" gap={12}>
      <Box width="grow" direction="row" gap={10} alignY="center"><PiIcon name="search" /><VoidInput value={query()} onChange={setQuery} placeholder="Buscar sesiones…" width="grow" focusId="pi-session-search" /></Box>
      <VoidButton outlined={!all()} variant={!all() ? "secondary" : "ghost"} onPress={() => setAll(false)}>Proyecto actual</VoidButton>
      <VoidButton outlined={all()} variant={all() ? "secondary" : "ghost"} onPress={() => setAll(true)}>Todos</VoidButton>
    </Box>
    <Box width="grow" height="grow" direction="column" scrollY scrollId="pi-sessions">
      <Show when={!loading()} fallback={<Text color={piColors.secondary} fontSize={16}>Cargando sesiones…</Text>}>
        <Show when={filtered().length} fallback={<Box direction="column" gap={12} paddingY={20}><Text color={piColors.text} fontSize={18}>{query() ? "No hay sesiones que coincidan" : "Todavía no hay sesiones guardadas"}</Text><Text color={piColors.secondary} fontSize={15}>Inicia una conversación para crear tu primera sesión en Pi.</Text></Box>}>
          <For each={filtered()}>{(session) => <Box width="grow" direction="column">
            <Box width="grow" direction="row" alignY="center" backgroundColor={session.path === props.snapshot().state?.sessionFile ? piColors.mintSoft : "#00000000"} cornerRadius={8}>
            <Box width={4} height={84} cornerRadius={2} backgroundColor={session.path === props.snapshot().state?.sessionFile ? piColors.mint : "#00000000"} />
            <VoidButton width="grow" height={84} variant="ghost" focusId={`pi-session-${focusSlug(session.path)}`} onPress={() => open(session)}>
              <Box width="grow" direction="column" gap={10}>
                <Text color={piColors.text} fontSize={19}>{session.name || session.id}</Text>
                <Text color={piColors.secondary} fontSize={15}>{session.cwd.split("/").at(-1)} · {session.path === props.snapshot().state?.sessionFile ? "sesión actual" : `${session.messageCount } mensajes`}</Text>
              </Box>
            </VoidButton></Box><Box width="grow" height={1} backgroundColor={piColors.border} />
          </Box>}</For>
        </Show>
      </Show>
    </Box>
    <Box direction="row" alignY="center" gap={16}><Text width="grow" color={piColors.dim} fontSize={13}>Tab navegar · Enter abrir</Text><VoidButton variant="ghost" focusId="pi-session-refresh" onPress={load}>Actualizar</VoidButton></Box>
  </Box>
}

function treeEntryMessage(node: PiTreeNode): PiMessage | null {
  const entry = node.entry
  const message = entry.message
  if (typeof message !== "object" || message === null || Array.isArray(message)) return null
  const role = safeText((message as Record<string, unknown>).role)
  if (!role) return null
  return message as PiMessage
}

function TreeNodeView(props: { node: PiTreeNode; depth: number; leafId: string | null; controller: PiController; onError: (error: unknown) => void; onForkText: (text: string) => void }) {
  const [expanded, setExpanded] = createSignal(true)
  const entryId = safeText(props.node.entry.id)
  const message = treeEntryMessage(props.node)
  const role = message?.role || safeText(props.node.entry.type)
  const activity = message && Array.isArray(message.content) ? message.content.filter((part) => part.type === "toolCall").map((part) => {
    const args = typeof part.arguments === "object" && part.arguments !== null && !Array.isArray(part.arguments) ? part.arguments : {}
    return `${safeText(part.name)} ${safeText(args.path) || safeText(args.command)}`.trim()
  }).join(" · ") : ""
  const label = props.node.label || (message ? contentText(message.content).split("\n")[0] || safeText(message.command) || activity : "") || role.replaceAll("_", " ")
  const canFork = message?.role.toLowerCase() === "user" && entryId.length > 0
  const fork = () => {
    if (!canFork) return
    void props.controller.command("fork", { entryId }).then((result) => {
      const data = typeof result === "object" && result !== null ? result as Record<string, unknown> : null
      const payload = data?.data && typeof data.data === "object" && data.data !== null ? data.data as Record<string, unknown> : data
      const text = safeText(payload?.text)
      if (text) props.onForkText(text)
      return props.controller.refresh()
    }).catch(props.onError)
  }
  return (
    <Box direction="column" width="grow" paddingLeft={props.depth > 0 ? 16 : 0}>
      <Box direction="row" width="grow" alignY="center" gap={12} paddingY={14} paddingX={8} cornerRadius={8} backgroundColor={props.leafId === entryId ? piColors.mintSoft : "#00000000"}>
        <Show when={props.node.children.length} fallback={<Box width={24} />}><VoidButton size="icon-sm" focusId={`pi-tree-toggle-${focusSlug(entryId)}`} onPress={() => setExpanded(!expanded())}><PiIcon name={expanded() ? "down" : "chevron"} /></VoidButton></Show>
        <Box direction="column" width="grow" gap={8}>
          <Text color={props.leafId === entryId ? piColors.mint : piColors.text} fontSize={16}>{role === "assistant" ? "Pi" : role === "user" ? "Usuario" : role === "bashExecution" ? "Comando" : role === "toolResult" ? "Herramienta" : role} {props.leafId === entryId ? "· actual" : ""}</Text>
          <Text color={piColors.secondary} fontSize={15} width="grow" whiteSpace="pre-wrap">{label}</Text>
        </Box>
        <Show when={canFork}><VoidButton size="xs" variant="outline" focusId={`pi-fork-${focusSlug(entryId)}`} onPress={fork}>Bifurcar</VoidButton></Show>
      </Box>
      <Show when={expanded()}><For each={props.node.children}>{(child) => <TreeNodeView node={child} depth={props.depth + 1} leafId={props.leafId} controller={props.controller} onError={props.onError} onForkText={props.onForkText} />}</For></Show>
    </Box>
  )
}

function TreeView(props: { snapshot: AppSnapshot; controller: PiController; onError: (error: unknown) => void; onForkText: (text: string) => void }) {
  const [query, setQuery] = createSignal("")
  const [filter, setFilter] = createSignal("Todo")
  const prune = (nodes: PiTreeNode[]): PiTreeNode[] => nodes.flatMap((node) => {
    const message = treeEntryMessage(node)
    const role = message?.role.toLowerCase() || ""
    const children = prune(node.children)
    const matches = (filter() === "Todo" || filter() === "Usuario" && role === "user" || filter() === "Sin herramientas" && !["toolresult", "bashexecution"].includes(role) || filter() === "Etiquetas" && Boolean(node.label)) && `${node.label || ""} ${message ? contentText(message.content) || safeText(message.command) : safeText(node.entry.type)}`.toLowerCase().includes(query().toLowerCase())
    return matches && (message || node.label) ? [{ ...node, children }] : children
  })
  const nodes = createMemo(() => prune(props.snapshot().tree?.tree ?? []))
  return <Box width="grow" height="grow" direction="column" padding={piSpace.page} gap={20}>
    <Text color={piColors.text} fontSize={28} fontWeight={600}>Árbol de conversación</Text>
    <VoidInput value={query()} onChange={setQuery} placeholder="Buscar en la conversación…" width="grow" focusId="pi-tree-search" />
    <Box direction="row" gap={12}><For each={["Todo", "Sin herramientas", "Usuario", "Etiquetas"]}>{(item) => <VoidButton variant={filter() === item ? "secondary" : "outline"} onPress={() => setFilter(item)}>{item}</VoidButton>}</For></Box>
    <Box width="grow" height="grow" scrollY scrollId="pi-tree" direction="column">
      <Show when={nodes().length} fallback={<Text color={piColors.secondary} fontSize={16}>No hay entradas que coincidan.</Text>}><For each={nodes()}>{(node) => <TreeNodeView node={node} depth={0} leafId={props.snapshot().tree?.leafId ?? null} controller={props.controller} onError={props.onError} onForkText={props.onForkText} />}</For></Show>
    </Box>
    <Text color={piColors.secondary} fontSize={14}>Bifurca desde un mensaje de usuario. Pi RPC no permite mover la rama actual.</Text>
    <Text color={piColors.dim} fontSize={13}>Tab navegar · Enter desplegar o bifurcar · Esc volver</Text>
  </Box>
}

function SettingRow(props: { label: string; detail: string; children: import("solid-js").JSX.Element }) {
  return <Box width="grow" direction="column">
    <Box width="grow" direction="row" alignY="center" paddingY={20} gap={20}>
      <Box width="grow" direction="column" gap={8}><Text color={piColors.text} fontSize={18}>{props.label}</Text><Text color={piColors.secondary} fontSize={15}>{props.detail}</Text></Box>
      {props.children}
    </Box><Box width="grow" height={1} backgroundColor={piColors.border} />
  </Box>
}

function SettingsView(props: { display: DisplaySettings; setDisplay: (value: DisplaySettings) => void; snapshot: AppSnapshot; controller: PiController; onError: (error: unknown) => void }) {
  const state = () => props.snapshot().state
  const [section, setSection] = createSignal("conversation")
  const [levels, setLevels] = createSignal<string[]>([])
  onMount(() => void props.controller.command("get_available_thinking_levels").then((result) => {
    const data = result as { levels?: unknown }
    if (Array.isArray(data?.levels) && data.levels.every((item) => typeof item === "string")) setLevels(data.levels)
  }).catch(props.onError))
  const send = (type: string, fields: Record<string, unknown>) => void props.controller.command(type, fields).catch(props.onError)
  return <Box width="grow" height="grow" direction="column" padding={piSpace.page} gap={24}>
    <Text color={piColors.text} fontSize={28} fontWeight={600}>Ajustes</Text>
    <Box direction="row" gap={16}><VoidButton variant={section() === "conversation" ? "secondary" : "outline"} onPress={() => setSection("conversation")}>Conversación</VoidButton><VoidButton variant={section() === "appearance" ? "secondary" : "outline"} onPress={() => setSection("appearance")}>Apariencia</VoidButton></Box>
    <Box width="grow" height="grow" direction="column" scrollY scrollId="pi-settings">
      <Show when={section() === "conversation"}>
      <Text color={piColors.secondary} fontSize={14} paddingY={12}>CONVERSACIÓN</Text>
      <Box width="grow" height={1} backgroundColor={piColors.border} />
      <SettingRow label="Mostrar pensamiento" detail="Mostrar el contenido de pensamiento disponible."><PiToggle checked={props.display.thinking} onChange={(thinking) => props.setDisplay({ ...props.display, thinking })} focusId="pi-setting-show-thinking" /></SettingRow>
      <SettingRow label="Expandir herramientas" detail="Mostrar la salida completa al abrir el trabajo."><PiToggle checked={props.display.tools} onChange={(tools) => props.setDisplay({ ...props.display, tools })} focusId="pi-setting-expand-tools" /></SettingRow>
      <Show when={state()?.autoCompactionEnabled !== undefined}>
        <SettingRow label="Compactación automática" detail="Reducir el contexto cuando sea necesario."><PiToggle checked={state()?.autoCompactionEnabled === true} onChange={(enabled) => send("set_auto_compaction", { enabled })} focusId={piFocus.autoCompaction} /></SettingRow>
      </Show>
      <Show when={levels().length > 0}>
        <SettingRow label="Nivel de pensamiento" detail="Esfuerzo de razonamiento del modelo seleccionado."><VoidSelect value={state()?.thinkingLevel} onChange={(level) => send("set_thinking_level", { level })} options={levels().map((level) => ({ value: level, label: level }))} width={160} focusId="pi-setting-thinking" /></SettingRow>
      </Show>
      <SettingRow label="Mensajes de dirección" detail="Cómo recibe Pi instrucciones mientras trabaja."><VoidSelect value={state()?.steeringMode} onChange={(mode) => send("set_steering_mode", { mode })} options={[{ value: "all", label: "Deliver all" }, { value: "one-at-a-time", label: "One at a time" }]} width={160} focusId="pi-setting-steering" /></SettingRow>
      <SettingRow label="Mensajes en cola" detail="Cómo inicia Pi el trabajo al terminar su turno."><VoidSelect value={state()?.followUpMode} onChange={(mode) => send("set_follow_up_mode", { mode })} options={[{ value: "all", label: "Deliver all" }, { value: "one-at-a-time", label: "One at a time" }]} width={160} focusId="pi-setting-follow-up" /></SettingRow>
      </Show>
      <Show when={section() === "appearance"}>
      <Text color={piColors.secondary} fontSize={14} paddingTop={12} paddingBottom={12}>APARIENCIA</Text>
      <SettingRow label="Tema" detail="Apariencia local; no cambia los proveedores de Pi."><Text color={piColors.secondary} fontSize={15}>Vexart oscuro</Text></SettingRow>
      </Show>
      <Text color={piColors.dim} fontSize={13} paddingTop={24}>Los controles de conversación están conectados a la configuración de Pi.</Text>
    </Box>
  </Box>
}

function ModelDialog(props: { snapshot: AppSnapshot; controller: PiController; onClose: () => void; onError: (error: unknown) => void }) {
  const [query, setQuery] = createSignal("")
  const models = () => props.snapshot().models.filter((model) => modelLabel(model).toLowerCase().includes(query().toLowerCase())).sort((a, b) => Number(modelKey(b) === modelKey(props.snapshot().state?.model ?? {})) - Number(modelKey(a) === modelKey(props.snapshot().state?.model ?? {})))
  let scroll: ScrollHandle | undefined
  const stopKeys = onInput((event) => {
    if (event.type !== "key" || !["up", "down"].includes(event.key) || models().length === 0) return
    const current = models().findIndex((model) => `pi-model-${focusSlug(modelKey(model) || "unavailable")}` === focusedId())
    const next = Math.max(0, Math.min(models().length - 1, current + (event.key === "down" ? 1 : -1)))
    setFocus(`pi-model-${focusSlug(modelKey(models()[next]) || "unavailable")}`)
    scroll?.scrollIntoView(next * 88, 80)
  })
  onCleanup(stopKeys)
  const select = (model: PiModel) => {
    if (!modelCanSelect(model)) return
    void props.controller.command("set_model", { provider: model.provider, modelId: model.id }).then(props.onClose).catch(props.onError)
  }
  return (
    <VoidDialog onClose={props.onClose} width={520}>
      <Text color={piColors.text} fontSize={22} fontWeight={600}>Seleccionar modelo</Text>
      <Box width="grow" direction="row" gap={10} alignY="center"><PiIcon name="search" /><VoidInput value={query()} onChange={setQuery} placeholder="Buscar modelo o proveedor…" width="grow" focusId="pi-model-search" /></Box>
      <Text color={piColors.secondary} fontSize={13}>MODELOS CONFIGURADOS</Text>
      <ScrollView ref={(handle) => { scroll = handle }} width="grow" height={280} scrollY direction="column" gap={piSpace.compact}>
        <Show when={models().length > 0} fallback={<Text color={piColors.dim} fontSize={piType.small}>Pi no devolvió modelos configurados.</Text>}>
          <For each={models()}>{(model) => <VoidButton outlined={modelKey(model) === modelKey(props.snapshot().state?.model ?? {})} variant={modelKey(model) === modelKey(props.snapshot().state?.model ?? {}) ? "secondary" : "ghost"} size="sm" height={80} width="grow" disabled={!modelCanSelect(model)} focusId={`pi-model-${focusSlug(modelKey(model) || "unavailable")}`} onPress={() => select(model)}>
            <Box width="grow" direction="row" alignY="center" gap={18}>
              <Box width={20} height={20} cornerRadius={10} borderWidth={1.5} borderColor={modelKey(model) === modelKey(props.snapshot().state?.model ?? {}) ? piColors.mint : piColors.text} backgroundColor={modelKey(model) === modelKey(props.snapshot().state?.model ?? {}) ? piColors.mint : "#00000000"} />
              <Box direction="column" gap={8} width="grow"><Text color={piColors.text} fontSize={17}>{safeText(model.name) || safeText(model.id)}</Text><Text color={piColors.secondary} fontSize={14}>{safeText(model.provider)}</Text></Box>
            </Box>
          </VoidButton>}</For>
        </Show>
      </ScrollView>
      <VoidDialogFooter><VoidButton variant="ghost" onPress={props.onClose}>Cerrar</VoidButton></VoidDialogFooter>
    </VoidDialog>
  )
}

function ExtensionDialog(props: { request: () => PiExtensionRequest; controller: PiController; onError: (error: unknown) => void }) {
  const [value, setValue] = createSignal(props.request().prefill || "")
  let valueRequestId = props.request().id
  let timeout: ReturnType<typeof setTimeout> | undefined
  const respond = (fields: Record<string, unknown>) => {
    try {
      props.controller.respond(props.request().id, fields)
    } catch (error: unknown) {
      props.onError(error)
    }
  }
  const cancel = () => respond({ cancelled: true })
  const clearTimeout = () => {
    if (timeout !== undefined) globalThis.clearTimeout(timeout)
    timeout = undefined
  }
  createEffect(() => {
    const request = props.request()
    if (request.id !== valueRequestId) {
      valueRequestId = request.id
      setValue(request.prefill || "")
      clearTimeout()
    }
    if (request.id === valueRequestId && timeout === undefined && typeof request.timeout === "number" && request.timeout > 0) {
      timeout = globalThis.setTimeout(() => {
        timeout = undefined
        if (props.request().id === request.id) cancel()
      }, request.timeout)
    }
  })
  onCleanup(clearTimeout)
  return (
    <VoidDialog onClose={cancel} width={520}>
      <VoidDialogTitle>{props.request().title || "Extension request"}</VoidDialogTitle>
      <Show when={props.request().method === "confirm"}>
        <VoidDialogDescription>{props.request().message || ""}</VoidDialogDescription>
        <VoidDialogFooter><VoidButton variant="ghost" size="sm" onPress={cancel}>Cancel</VoidButton><VoidButton size="sm" focusId="pi-extension-confirm" onPress={() => respond({ confirmed: true })}>Confirm</VoidButton></VoidDialogFooter>
      </Show>
      <Show when={props.request().method === "select"}>
        <Box direction="column" gap={piSpace.compact}><For each={props.request().options || []}>{(option) => <VoidButton variant="outline" size="sm" focusId={`pi-extension-option-${focusSlug(option)}`} onPress={() => respond({ value: option })}>{option}</VoidButton>}</For></Box>
        <VoidDialogFooter><VoidButton variant="ghost" size="sm" onPress={cancel}>Cancel</VoidButton></VoidDialogFooter>
      </Show>
      <Show when={props.request().method === "input"}>
        <VoidInput value={value()} onChange={setValue} placeholder={props.request().placeholder} focusId="pi-extension-input" onSubmit={(text) => respond({ value: text })} width="grow" />
        <VoidDialogFooter><VoidButton variant="ghost" size="sm" onPress={cancel}>Cancel</VoidButton><VoidButton size="sm" onPress={() => respond({ value: value() })}>Submit</VoidButton></VoidDialogFooter>
      </Show>
      <Show when={props.request().method === "editor"}>
        <Textarea value={value()} onChange={setValue} onSubmit={(text) => respond({ value: text })} focusId="pi-extension-editor" width={460} height={180} placeholder="Write a response…" theme={{ accent: piColors.mint, fg: piColors.text, muted: piColors.secondary, bg: piColors.charcoal, disabledBg: piColors.surface, border: piColors.borderStrong, radius: 10, padding: piSpace.compact }} />
        <VoidDialogFooter><VoidButton variant="ghost" size="sm" onPress={cancel}>Cancel</VoidButton><VoidButton size="sm" onPress={() => respond({ value: value() })}>Submit</VoidButton></VoidDialogFooter>
      </Show>
    </VoidDialog>
  )
}

function ExtensionOverlay(props: { snapshot: AppSnapshot; controller: PiController; onError: (error: unknown) => void }) {
  const request = createMemo(() => props.snapshot().extensionRequests.find((item) => ["select", "confirm", "input", "editor"].includes(item.method)))
  const requestId = createMemo(() => request()?.id)
  const hasPanel = createMemo(() => Object.keys(props.snapshot().extensionStatus).length > 0 || Object.keys(props.snapshot().extensionWidgets).length > 0 || props.snapshot().extensionRequests.some((item) => item.method === "notify"))
  return (
    <>
      <Show when={requestId()} keyed>{(_requestId) => <ExtensionDialog request={() => request()!} controller={props.controller} onError={props.onError} />}</Show>
      <Show when={hasPanel()}>
        <Box width={320} height="grow" direction="column" gap={piSpace.compact} padding={piSpace.row} backgroundColor={piColors.surface} borderColor={piColors.border} borderWidth={1}>
          <For each={props.snapshot().extensionRequests.filter((item) => item.method === "notify")}>{(item) => <Box backgroundColor={(item as { notifyType?: string }).notifyType === "error" ? piColors.red : piColors.raised} borderColor={piColors.borderStrong} borderWidth={1} padding={piSpace.compact} cornerRadius={8}><Text color={piColors.text} fontSize={piType.small}>{item.message || ""}</Text></Box>}</For>
          <For each={Object.entries(props.snapshot().extensionStatus)}>{([key, status]) => <Box direction="row" gap={piSpace.compact}><Text color={piColors.dim} fontSize={piType.eyebrow}>{key}</Text><Text color={piColors.secondary} fontSize={piType.small}>{status}</Text></Box>}</For>
          <For each={Object.entries(props.snapshot().extensionWidgets)}>{([key, lines]) => <Box direction="column" gap={4} paddingTop={piSpace.compact}><Text color={piColors.dim} fontSize={piType.eyebrow}>{key}</Text><For each={lines}>{(line) => <Text color={piColors.secondary} fontSize={piType.small} whiteSpace="pre-wrap">{line}</Text>}</For></Box>}</For>
        </Box>
      </Show>
    </>
  )
}

export function PiApp(props: PiAppProps) {
  const terminal = props.width === undefined || props.height === undefined ? useAppTerminal() : undefined
  const dimensions = terminal ? useTerminalDimensions(terminal) : undefined
  const width = () => props.width ?? dimensions?.width() ?? 1080
  const height = () => props.height ?? dimensions?.height() ?? 720
  const [snapshot, setSnapshot] = createSignal<PiSnapshot>(props.controller.snapshot())
  const [display, setDisplay] = createSignal<DisplaySettings>({ thinking: true, tools: false })
  const [view, setView] = createSignal<PiRailView>("chat")
  const [dialog, setDialog] = createSignal<"model" | null>(null)
  const [draft, setDraft] = createSignal("")
  const [autocompleteOpen, setAutocompleteOpen] = createSignal(false)
  const [localError, setLocalError] = createSignal("")
  const consumedEditorEvents = new Set<string>()
  const reportError = (error: unknown) => setLocalError(errorText(error))

  createEffect(() => {
    for (const event of snapshot().events) {
      if (event.type !== "extension_ui_request" || event.method !== "set_editor_text") continue
      const id = typeof event.id === "string" ? event.id : ""
      const text = typeof event.text === "string" ? event.text : undefined
      if (!id || text === undefined || consumedEditorEvents.has(id)) continue
      consumedEditorEvents.add(id)
      setDraft(text)
    }
  })

  onMount(() => {
    const unsubscribe = props.controller.subscribe(() => setSnapshot(props.controller.snapshot()))
    if (props.controller.snapshot().connected) void props.controller.refresh().catch(reportError)
    setFocus(piFocus.composer)
    onCleanup(unsubscribe)
  })
  const stopInput = onInput((event) => {
    if (event.type !== "key" || event.key !== "escape") return
    if (view() !== "chat" && dialog() === null) { setView("chat"); return }
    if (!snapshot().busy || view() !== "chat" || dialog() !== null || autocompleteOpen() || snapshot().extensionRequests.some((item) => ["select", "confirm", "input", "editor"].includes(item.method))) return
    void props.controller.stop().catch(reportError)
  })
  onCleanup(stopInput)

  const body = () => {
    if (view() === "sessions") return <SessionsView snapshot={snapshot} controller={props.controller} onError={reportError} onOpen={() => setView("chat")} />
    if (view() === "tree") return <TreeView snapshot={snapshot} controller={props.controller} onError={reportError} onForkText={(text) => { setDraft(text); setView("chat") }} />
    if (view() === "settings") return <SettingsView display={display()} setDisplay={setDisplay} snapshot={snapshot} controller={props.controller} onError={reportError} />
    const contentWidth = () => Math.max(240, width() - piSpace.rail - piSpace.page * 2 - piSpace.compact * 2 - 4)
    return <ChatView display={display()} snapshot={snapshot} controller={props.controller} cwd={props.cwd} onModel={() => setDialog("model")} onError={reportError} width={contentWidth} draft={draft} onDraftChange={setDraft} onView={setView} onAutocomplete={setAutocompleteOpen} />
  }
  return (
    <Box width={width()} height={height()} direction="row" backgroundColor={piColors.background}>
      <PiRail view={view()} setView={setView} />
      <Box width="grow" height="grow" direction="column">
        <Header snapshot={snapshot} cwd={props.cwd} view={view()} />
        <Box width="grow" height="grow">{body()}</Box>
        <StatusFooter snapshot={snapshot} />
        <Show when={localError()}><Box width="grow" backgroundColor={piColors.red} padding={piSpace.compact} cornerRadius={8}><Text color={piColors.text} fontSize={piType.small}>{localError()}</Text></Box></Show>
      </Box>
      <Show when={dialog() === "model" && !snapshot().extensionRequests.some((item) => ["select", "confirm", "input", "editor"].includes(item.method))}><ModelDialog snapshot={snapshot} controller={props.controller} onClose={() => setDialog(null)} onError={reportError} /></Show>
      <ExtensionOverlay snapshot={snapshot} controller={props.controller} onError={reportError} />
    </Box>
  )
}
