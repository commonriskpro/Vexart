import { For, Show, createSignal, type Accessor, type JSX } from "solid-js"
import { Box, Page, Text, type AppBoxProps } from "@vexart/app"
import type { CanvasContext } from "@vexart/engine"
import { OPENCODE_WINDOW_ID, createOpenCodeShellWindows, createOpenCodeWindowManager, type OpenCodeWindowId, type OpenCodeWindowSnapshot } from "./window-manager"

const APP_KEY = {
  EDITOR: "editor",
  EXPLORER: "explorer",
  TERMINAL: "terminal",
  GIT: "git",
  PACKAGES: "packages",
  SETTINGS: "settings",
  OVERVIEW: "overview",
  PROJECTS: "projects",
  AGENTS: "agents",
  ASSISTANT: "assistant",
  DATASETS: "datasets",
  SNIPPETS: "snippets",
  PROCESSES: "processes",
  PERFORMANCE: "performance",
  NETWORK: "network",
  STORAGE: "storage",
} as const

const DOCK_KEY = {
  HOME: "home",
  EDITOR: APP_KEY.EDITOR,
  TERMINAL: APP_KEY.TERMINAL,
  EXPLORER: APP_KEY.EXPLORER,
  GIT: APP_KEY.GIT,
  ASSISTANT: APP_KEY.ASSISTANT,
} as const

const ICON = {
  BOT: "AI",
  BOXES: "BX",
  CHEVRON: ">",
  CIRCLE: "○",
  CODE: "</>",
  COMMAND: "⌘",
  DATABASE: "DB",
  DRIVE: "DR",
  FOLDER: "▱",
  GAUGE: "GA",
  GIT: "⎇",
  LOGO: "✦",
  NETWORK: "NW",
  NOVA: "N7",
  PACKAGE: "◇",
  PLUS: "+",
  SEARCH: "⌕",
  SEND: "→",
  SETTINGS: "⚙",
  SLIDERS: "SL",
  SPARKLES: "✶",
  TERMINAL: "▹_",
  TS: "TS",
  USER: "U",
  X: "×",
} as const

type AppKey = (typeof APP_KEY)[keyof typeof APP_KEY]
type DockKey = (typeof DOCK_KEY)[keyof typeof DOCK_KEY]
type IconName = (typeof ICON)[keyof typeof ICON]

interface FileItem {
  name: string
  kind: string
  content: string
}

interface LauncherItem {
  key: AppKey
  label: string
  icon: IconName
  dot?: boolean
}

interface LauncherGroup {
  label: string
  items: LauncherItem[]
}

interface AppCard {
  title: string
  subtitle: string
  body: string[]
}

interface DockItem {
  key: DockKey
  label: string
  sub: string
  icon: IconName
}

interface ButtonShellProps {
  children?: JSX.Element
  width?: number | string
  height?: number | string
  active?: boolean
  onPress?: AppBoxProps["onPress"]
}

interface ShellProps {
  width: number
  height: number
  /** Benchmark hook: when set, overrides the cursor line text in the editor.
   *  Returns the setter so the bench can drive reactive typing. */
  onTypingReady?: (tick: (index: number) => void) => void
}

interface SurfaceProps extends Pick<AppBoxProps, "width" | "height" | "children" | "floating" | "floatOffset" | "zIndex"> {
  direction?: "row" | "column"
  gap?: number
  padding?: number
  paddingX?: number
  paddingY?: number
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  backgroundColor?: number
  borderColor?: number
  borderWidth?: number
  cornerRadius?: number
  backdropBlur?: number
  shadow?: AppBoxProps["shadow"]
  glow?: AppBoxProps["glow"]
  gradient?: AppBoxProps["gradient"]
  layer?: boolean
  contain?: AppBoxProps["contain"]
  scrollY?: boolean
  pointerPassthrough?: boolean
  onPress?: AppBoxProps["onPress"]
  focusable?: boolean
  hoverStyle?: AppBoxProps["hoverStyle"]
  activeStyle?: AppBoxProps["activeStyle"]
}

const color = {
  void: 0x030711ff,
  panel: 0x0b1428d8,
  panelSoft: 0x101a34cc,
  panelDeep: 0x081225e6,
  card: 0x111a35cc,
  row: 0xffffff0a,
  rowHover: 0xffffff12,
  activeRow: 0x7c3aed38,
  border: 0xffffff24,
  borderStrong: 0xa78bff66,
  borderSoft: 0xffffff14,
  text: 0xe5e7ebff,
  textSoft: 0x94a3b8ff,
  muted: 0x64748bff,
  faint: 0x475569ff,
  violet: 0xa78bffff,
  violetDeep: 0x7c3aed66,
  cyan: 0x67e8f9ff,
  fuchsia: 0xf0abfcff,
  amber: 0xfde68aff,
  sky: 0x7dd3fcff,
  green: 0x34d399ff,
  orange: 0xfdba74ff,
  blackGlass: 0x02061799,
}

const shadow = {
  panel: [
    { x: 0, y: 24, blur: 80, color: 0x0206178f },
    { x: 0, y: 0, blur: 36, color: 0x6366f114 },
  ],
  dock: [
    { x: 0, y: 18, blur: 60, color: 0x00000073 },
    { x: 0, y: 0, blur: 30, color: 0x7c3aed1f },
  ],
  active: { x: 0, y: 0, blur: 28, color: 0x7c3aed35 },
  glow: { radius: 22, color: 0xa78bff88, intensity: 70 },
  cyan: { radius: 18, color: 0x67e8f988, intensity: 60 },
}

const files: FileItem[] = [
  {
    name: "orbit-traffic.tsx",
    kind: "TypeScript",
    content: `import { useEffect, useMemo, useState } from 'react';
import { html } from 'react-helmet-async';
import { Card, CardHeader, CardTitle, CardContent } from '@components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area } from 'recharts';
import { fetchTraffic } from '@/services/metrics.service';
import { formatBytes, formatLatency } from '@/lib/format';

type Point = {
  time: string;
  requests: number;
  latency: number;
  bandwidth: number;
}

export default function OrbitTraffic() {
  const [data, setData] = useState<Point[]>([]);
  const [range, setRange] = useState<'1h' | '6h' | '24h' | '7d'>('6h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchTraffic(range).then(res => {
      if (mounted) {
        setData(res);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    return () => { mounted = false };
  }, [range]);

  const chartData = useMemo(() => data.map(d => ({
    time: new Date(d.time).toLocaleTimeString(),
    requests: d.requests,
    latency: d.latency,
    bandwidth: d.bandwidth
  })), [data]);

  return (
    <Card className="orbit-panel">
      <CardHeader>
        <CardTitle>Orbit Traffic</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Area dataKey="bandwidth" />
            <Line dataKey="requests" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}`,
  },
  {
    name: "metrics.service.ts",
    kind: "TypeScript",
    content: `export async function fetchTraffic(range: string) {
  const response = await fetch('/api/metrics/traffic?range=' + range);
  if (!response.ok) throw new Error('Unable to load metrics');
  return response.json();
}

export function subscribeToTraffic(cb: (event: unknown) => void) {
  const source = new EventSource('/api/metrics/stream');
  source.onmessage = event => cb(JSON.parse(event.data));
  return () => source.close();
}`,
  },
  {
    name: "useRealtime.ts",
    kind: "TypeScript",
    content: `import { onCleanup } from 'solid-js';

export function useRealtime(channel: string, onMessage: (payload: unknown) => void) {
  const socket = new WebSocket('wss://orbit.local/realtime/' + channel);
  socket.onmessage = event => onMessage(JSON.parse(event.data));
  onCleanup(() => socket.close());
}`,
  },
]

const launcherGroups: LauncherGroup[] = [
  {
    label: "LAUNCHER",
    items: [
      { key: APP_KEY.EDITOR, label: "Editor", icon: ICON.CODE },
      { key: APP_KEY.EXPLORER, label: "Explorer", icon: ICON.FOLDER },
      { key: APP_KEY.TERMINAL, label: "Terminal", icon: ICON.TERMINAL },
      { key: APP_KEY.GIT, label: "Git", icon: ICON.GIT },
      { key: APP_KEY.PACKAGES, label: "Packages", icon: ICON.PACKAGE },
      { key: APP_KEY.SETTINGS, label: "Settings", icon: ICON.SETTINGS },
    ],
  },
  {
    label: "WORKBENCH",
    items: [
      { key: APP_KEY.OVERVIEW, label: "Overview", icon: ICON.GAUGE },
      { key: APP_KEY.PROJECTS, label: "Projects", icon: ICON.BOXES },
      { key: APP_KEY.AGENTS, label: "Agents", icon: ICON.USER },
      { key: APP_KEY.ASSISTANT, label: "Assistant", icon: ICON.BOT, dot: true },
      { key: APP_KEY.DATASETS, label: "Datasets", icon: ICON.DATABASE },
      { key: APP_KEY.SNIPPETS, label: "Snippets", icon: ICON.COMMAND },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { key: APP_KEY.PROCESSES, label: "Processes", icon: ICON.SLIDERS },
      { key: APP_KEY.PERFORMANCE, label: "Performance", icon: ICON.GAUGE },
      { key: APP_KEY.NETWORK, label: "Network", icon: ICON.NETWORK },
      { key: APP_KEY.STORAGE, label: "Storage", icon: ICON.DRIVE },
    ],
  },
]

const appCards: Record<AppKey, AppCard> = {
  editor: { title: "Editor", subtitle: "orbit-traffic.tsx", body: ["Active file", "TypeScript", "Orbit Dashboard"] },
  explorer: { title: "Project Explorer", subtitle: "Orbit Dashboard", body: ["src/app/dashboard/orbit-traffic.tsx", "src/services/metrics.service.ts", "src/hooks/useRealtime.ts", "src/lib/format.ts"] },
  terminal: { title: "Terminal", subtitle: "zsh / active session", body: ["$ bun dev", "ready - vexart terminal app mounted", "$ git status", "on branch cosmic-ui"] },
  git: { title: "Git Timeline", subtitle: "main + cosmic-ui", body: ["feat(shell): add cosmic workbench", "fix(metrics): stream reconnect guard", "style(nova): neon glass panel"] },
  packages: { title: "Packages", subtitle: "Workspace dependencies", body: ["@vexart/app", "@vexart/engine", "solid-js", "Bun native runtime", "zero DOM dependencies"] },
  settings: { title: "Settings", subtitle: "OpenCode OS / Cosmic Edition", body: ["Theme: Nova violet", "Shader: cosmic glass", "Dock: enabled", "Assistant: floating panel"] },
  overview: { title: "System Overview", subtitle: "Live workspace telemetry", body: ["CPU orbit load: 42%", "Memory: 5.8 GB", "Latency: 38ms", "AI context: 3 files"] },
  projects: { title: "Projects", subtitle: "Recent environments", body: ["Orbit Dashboard", "Nova Shell", "Metrics API", "Realtime Gateway"] },
  agents: { title: "Agents", subtitle: "AI worker pool", body: ["NOVA-7: online", "Refactor Agent: idle", "QA Agent: idle", "Docs Agent: idle"] },
  assistant: { title: "NOVA Assistant", subtitle: "Context aware core assistant", body: ["Explain this code", "Optimize performance", "Add unit tests", "Refactor module"] },
  datasets: { title: "Datasets", subtitle: "Local vector stores", body: ["orbit_events.jsonl", "codebase_embeddings", "traffic_samples", "assistant_memory"] },
  snippets: { title: "Snippets", subtitle: "Reusable code blocks", body: ["useRealtime hook", "animated glass panel", "typed API route", "SSE reconnect helper"] },
  processes: { title: "Processes", subtitle: "Runtime tasks", body: ["vexart-dev", "worker-metrics", "cache-layer", "route-manifest"] },
  performance: { title: "Performance", subtitle: "Renderer and UI stats", body: ["FPS target: 120", "Paint cost: low", "GPU layer: active", "Backdrop blur: optimized"] },
  network: { title: "Network", subtitle: "Realtime routes", body: ["/api/metrics/traffic", "/api/metrics/stream", "wss://orbit.local", "terminal://vexart"] },
  storage: { title: "Storage", subtitle: "Workspace data", body: ["Project: 412 MB", "Cache: 86 MB", "Snapshots: 9", "Logs: 14 MB"] },
}

const dockItems: DockItem[] = [
  { key: DOCK_KEY.HOME, label: "OpenCode OS", sub: "Cosmic Edition", icon: ICON.LOGO },
  { key: DOCK_KEY.EDITOR, label: "Editor", sub: "orbit-traffic.tsx", icon: ICON.CODE },
  { key: DOCK_KEY.TERMINAL, label: "Terminal", sub: "zsh", icon: ICON.TERMINAL },
  { key: DOCK_KEY.EXPLORER, label: "Explorer", sub: "Orbit Dashboard", icon: ICON.FOLDER },
  { key: DOCK_KEY.GIT, label: "Git", sub: "main", icon: ICON.GIT },
  { key: DOCK_KEY.ASSISTANT, label: "Assistant", sub: "NOVA", icon: ICON.NOVA },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function safeFileIndex(value: number) {
  return clamp(value, 0, files.length - 1)
}

function dockTarget(key: DockKey): AppKey {
  if (key === DOCK_KEY.HOME) return APP_KEY.EDITOR
  return key
}

function lineColor(part: string) {
  if (/^(import|from|export|default|function|const|return|type|if)$/.test(part)) return color.violet
  if (/^(useEffect|useMemo|useState|createSignal|createMemo|onCleanup)$/.test(part)) return color.cyan
  if (/^'[^']*'$|^"[^"]*"$/.test(part)) return color.amber
  if (/^\d+$/.test(part)) return color.sky
  return color.textSoft
}

function splitCodeLine(line: string) {
  return line.split(/(import|from|export|default|function|const|let|return|type|if|then|catch|useEffect|useMemo|useState|createSignal|createMemo|onCleanup|'[^']*'|"[^"]*"|\b\d+\b)/g)
}

function GlassButton(props: ButtonShellProps) {
  return (
    <Box
      width={props.width ?? "grow"}
      height={props.height ?? 44}
      direction="row"
      alignY="center"
      paddingX={12}
      cornerRadius={9}
      backgroundColor={props.active ? color.activeRow : 0x00000000}
      borderColor={props.active ? color.borderStrong : 0x00000000}
      borderWidth={1}
      shadow={props.active ? shadow.active : undefined}
      focusable
      onPress={props.onPress}
      activeStyle={{ backgroundColor: 0x7c3aed55 }}
    >
      {props.children}
    </Box>
  )
}

function Surface(props: SurfaceProps) {
  return (
    <Box
      width={props.width}
      height={props.height}
      direction={props.direction ?? "column"}
      gap={props.gap}
      padding={props.padding}
      paddingX={props.paddingX}
      paddingY={props.paddingY}
      alignX={props.alignX}
      alignY={props.alignY}
      floating={props.floating}
      floatOffset={props.floatOffset}
      zIndex={props.zIndex}
      backgroundColor={props.backgroundColor ?? color.panel}
      borderColor={props.borderColor ?? color.border}
      borderWidth={props.borderWidth ?? 1}
      cornerRadius={props.cornerRadius ?? 18}
      backdropBlur={props.backdropBlur}
      shadow={props.shadow ?? shadow.panel}
      glow={props.glow}
      gradient={props.gradient}
      layer={props.layer}
      contain={props.contain}
      scrollY={props.scrollY}
      pointerPassthrough={props.pointerPassthrough}
      focusable={props.focusable}
      onPress={props.onPress}
      hoverStyle={props.hoverStyle}
      activeStyle={props.activeStyle}
    >
      {props.children}
    </Box>
  )
}

function WindowLayer(props: { window: OpenCodeWindowSnapshot; children?: JSX.Element }) {
  return (
    <Box
      layer
      contain="paint"
      floating="root"
      floatOffset={{ x: props.window.rect.x, y: props.window.rect.y }}
      zIndex={props.window.zIndex}
      width={props.window.rect.width}
      height={props.window.rect.height}
    >
      {props.children}
    </Box>
  )
}

function IconBadge(props: { icon: IconName; active?: boolean; size?: number }) {
  const size = () => props.size ?? 28
  return (
    <Box
      width={size()}
      height={size()}
      alignX="center"
      alignY="center"
      cornerRadius={props.icon === ICON.LOGO || props.icon === ICON.NOVA ? 999 : Math.round(size() / 3)}
      backgroundColor={props.active ? color.violetDeep : 0x11182766}
      borderColor={props.active ? 0xa78bff88 : color.borderSoft}
      borderWidth={1}
      glow={props.active ? shadow.glow : undefined}
    >
      <Text color={props.active ? color.text : color.textSoft} fontSize={size() > 34 ? 18 : 12} fontWeight={700}>{props.icon}</Text>
    </Box>
  )
}

function CosmicLogo(props: { small?: boolean }) {
  const size = () => props.small ? 40 : 48
  return (
    <Box width={size()} height={size()} alignX="center" alignY="center" cornerRadius={999} gradient={{ type: "radial", from: 0x2de2ffff, to: 0x9f7cff55 }} glow={shadow.cyan}>
      <Box width={size() - 8} height={size() - 8} alignX="center" alignY="center" cornerRadius={999} backgroundColor={0x071121ff} borderColor={0xc4b5fd99} borderWidth={2}>
        <Text color={color.violet} fontSize={props.small ? 14 : 16} fontWeight={700}>{ICON.SPARKLES}</Text>
      </Box>
    </Box>
  )
}

function NovaAvatar(props: { large?: boolean }) {
  const size = () => props.large ? 64 : 40
  return (
    <Box width={size()} height={size()} alignX="center" alignY="center" cornerRadius={999} gradient={{ type: "radial", from: 0xd6c4ffff, to: 0x101225ff }} borderColor={0xc4b5fd55} borderWidth={1} glow={shadow.glow}>
      <Box width={Math.round(size() * 0.44)} height={Math.round(size() * 0.30)} direction="row" gap={4} alignX="center" alignY="center" cornerRadius={999} backgroundColor={0x101225dd}>
        <Box width={4} height={4} cornerRadius={999} backgroundColor={color.violet} glow={shadow.glow} />
        <Box width={4} height={4} cornerRadius={999} backgroundColor={color.violet} glow={shadow.glow} />
      </Box>
    </Box>
  )
}

function SectionLabel(props: { label: string; right?: string }) {
  return (
    <Box width="grow" height={22} direction="row" alignY="center" alignX="space-between">
      <Text color={color.textSoft} fontSize={11} fontWeight={700}>{props.label}</Text>
      <Show when={props.right}><Text color={color.muted} fontSize={10}>{props.right}</Text></Show>
    </Box>
  )
}

function LauncherButton(props: { item: LauncherItem; activeApp: AppKey; setActiveApp: (key: AppKey) => void }) {
  const active = () => props.activeApp === props.item.key
  return (
    <GlassButton active={active()} height={44} onPress={() => props.setActiveApp(props.item.key)}>
      <IconBadge icon={props.item.icon} active={active()} size={22} />
      <Box width={12} />
      <Text color={active() ? color.text : color.textSoft} fontSize={13} fontWeight={600}>{props.item.label}</Text>
      <Show when={props.item.dot}>
        <Box width="grow" alignX="right">
          <Box width={10} height={10} cornerRadius={999} backgroundColor={color.violet} glow={shadow.glow} />
        </Box>
      </Show>
    </GlassButton>
  )
}

function LeftRail(props: { width: number; height: number; activeApp: AppKey; setActiveApp: (key: AppKey) => void }) {
  return (
    <Surface width={props.width} height={props.height} padding={0} backgroundColor={0x10182bd9} borderColor={0xffffff2e} contain="paint">
      <Box width="grow" height={104} direction="row" alignY="center" gap={16} paddingX={24}>
        <CosmicLogo />
        <Box>
          <Text color={color.text} fontSize={17} fontWeight={700}>OPENCODE OS</Text>
          <Text color={color.muted} fontSize={10} fontWeight={700}>COSMIC EDITION</Text>
        </Box>
      </Box>
      <Box width="grow" height="grow" direction="column" paddingX={16} paddingY={8} scrollY gap={18}>
        <For each={launcherGroups}>{(group) => (
          <Box width="grow" direction="column" gap={4} paddingBottom={14} borderBottom={1} borderColor={color.borderSoft}>
            <SectionLabel label={group.label} />
            <For each={group.items}>{(item) => <LauncherButton item={item} activeApp={props.activeApp} setActiveApp={props.setActiveApp} />}</For>
          </Box>
        )}</For>
      </Box>
      <Box width="grow" height={98} direction="row" alignY="center" gap={14} paddingX={20} borderTop={1} borderColor={color.borderSoft}>
        <NovaAvatar large />
        <Box>
          <Text color={color.text} fontSize={15} fontWeight={700}>NOVA-7</Text>
          <Text color={color.muted} fontSize={10} fontWeight={700}>ACTIVE ENVIRONMENT</Text>
        </Box>
      </Box>
    </Surface>
  )
}

function CodeToken(props: { part: string }) {
  return <Text color={lineColor(props.part)} fontSize={14} fontFamily="monospace">{props.part}</Text>
}

function CodeLine(props: { index: number; line: string }) {
  return (
    <Box width="grow" minHeight={22} direction="row" backgroundColor={props.index % 7 === 0 ? 0xffffff04 : 0x00000000}>
      <Box width={48} alignX="right" paddingRight={10} borderRight={1} borderColor={0xffffff0d} backgroundColor={color.panelDeep}>
        <Text color={color.faint} fontSize={11} fontFamily="monospace">{String(props.index + 1)}</Text>
      </Box>
      <Box width="grow" direction="row" paddingLeft={14} gap={0}>
        <For each={splitCodeLine(props.line || " ")}>{(part) => <CodeToken part={part} />}</For>
      </Box>
    </Box>
  )
}

function FileTab(props: { file: FileItem; index: Accessor<number>; activeFile: number; setActiveFile: (index: number) => void }) {
  const active = () => props.index() === safeFileIndex(props.activeFile)
  return (
    <Box
      width={228}
      height={54}
      direction="row"
      alignY="center"
      gap={10}
      paddingX={12}
      cornerRadius={12}
      backgroundColor={active() ? 0x232946d8 : 0x11182799}
      borderColor={active() ? 0xa78bff55 : color.borderSoft}
      borderWidth={1}
      focusable
      onPress={() => props.setActiveFile(props.index())}
    >
      <IconBadge icon={ICON.TS} active={active()} size={24} />
      <Text color={active() ? color.text : color.textSoft} fontSize={12} fontWeight={600}>{props.file.name}</Text>
      <Box width="grow" alignX="right"><Text color={color.muted} fontSize={12}>{ICON.X}</Text></Box>
    </Box>
  )
}

function CodeEditor(props: { width: number; height: number; activeFile: number; setActiveFile: (index: number) => void; typingLine?: Accessor<string | null> }) {
  const active = () => files[safeFileIndex(props.activeFile)]
  const lines = () => active().content.split("\n")
  return (
    <Surface width={props.width} height={props.height} padding={0} backgroundColor={0x0b1428dc} borderColor={0xffffff2a} contain="paint">
      <Box width="grow" height={68} direction="row" alignY="bottom" gap={6} padding={10} borderBottom={1} borderColor={color.borderSoft} backgroundColor={0x121a2fb8}>
        <For each={files}>{(file, index) => <FileTab file={file} index={index} activeFile={props.activeFile} setActiveFile={props.setActiveFile} />}</For>
        <Box width={58} height={54} alignX="center" alignY="center" cornerRadius={12} backgroundColor={0x0b1327cc} borderColor={color.borderSoft} borderWidth={1} focusable>
          <Text color={color.textSoft} fontSize={18}>{ICON.PLUS}</Text>
        </Box>
      </Box>
      <Box width="grow" height={56} direction="row" alignY="center" gap={8} paddingX={24} borderBottom={1} borderColor={color.borderSoft}>
        <Text color={color.textSoft} fontSize={12}>src</Text><Text color={color.muted} fontSize={12}>{ICON.CHEVRON}</Text>
        <Text color={color.textSoft} fontSize={12}>app</Text><Text color={color.muted} fontSize={12}>{ICON.CHEVRON}</Text>
        <Text color={color.textSoft} fontSize={12}>dashboard</Text><Text color={color.muted} fontSize={12}>{ICON.CHEVRON}</Text>
        <Text color={color.violet} fontSize={12}>◇ {active().name}</Text><Text color={color.muted} fontSize={12}>{ICON.CHEVRON}</Text>
        <Text color={color.text} fontSize={12}>OrbitTraffic</Text>
      </Box>
      <Box width="grow" height="grow" direction="column" scrollY backgroundColor={0x081225d9}>
        <For each={lines()}>{(line, index) => <CodeLine index={index()} line={line} />}</For>
        <Box width="grow" minHeight={22} direction="row">
          <Box width={48} alignX="right" paddingRight={10} borderRight={1} borderColor={0xffffff0d} backgroundColor={color.panelDeep}>
            <Text color={color.faint} fontSize={11} fontFamily="monospace">{String(lines().length + 1)}</Text>
          </Box>
          <Box width="grow" direction="row" paddingLeft={14}>
            <Text color={color.textSoft} fontSize={14} fontFamily="monospace">{props.typingLine ? props.typingLine() ?? "|" : "|"}</Text>
          </Box>
        </Box>
      </Box>
      <Box width="grow" height={36} direction="row" alignY="center" paddingX={18} borderTop={1} borderColor={color.borderSoft} backgroundColor={0x081225e6}>
        <Text color={color.textSoft} fontSize={11}>{active().kind}</Text>
        <Box width={44} />
        <Text color={color.textSoft} fontSize={11}>UTF-8</Text>
        <Box width={44} />
        <Text color={color.textSoft} fontSize={11}>LF</Text>
        <Box width="grow" alignX="right"><Text color={color.textSoft} fontSize={11}>Ln 18, Col 24</Text></Box>
      </Box>
    </Surface>
  )
}

function AppOverlay(props: { width: number; activeApp: AppKey; onClose: () => void }) {
  const card = () => appCards[props.activeApp]
  return (
    <Show when={props.activeApp !== APP_KEY.EDITOR}>
      <Surface width={props.width} padding={0} backgroundColor={0x0b1428ee} borderColor={color.border} contain="paint">
        <Box width="grow" height={76} direction="row" alignY="center" alignX="space-between" paddingX={18} borderBottom={1} borderColor={color.borderSoft}>
          <Box>
            <Text color={color.text} fontSize={18} fontWeight={700}>{card().title}</Text>
            <Text color={color.textSoft} fontSize={11}>{card().subtitle}</Text>
          </Box>
          <Box width={38} height={38} alignX="center" alignY="center" cornerRadius={10} backgroundColor={color.row} borderColor={color.borderSoft} borderWidth={1} focusable onPress={props.onClose}>
            <Text color={color.textSoft} fontSize={18}>{ICON.X}</Text>
          </Box>
        </Box>
        <Box width="grow" direction="column" gap={8} padding={14}>
          <For each={card().body}>{(item, index) => (
            <Box width="grow" height={42} direction="row" alignY="center" gap={10} paddingX={12} cornerRadius={12} backgroundColor={color.row} borderColor={color.borderSoft} borderWidth={1}>
              <IconBadge icon={ICON.CIRCLE} size={24} />
              <Text color={color.textSoft} fontSize={12}>{item}</Text>
              <Box width="grow" alignX="right"><Text color={color.faint} fontSize={10}>{String(index() + 1)}</Text></Box>
            </Box>
          )}</For>
        </Box>
      </Surface>
    </Show>
  )
}

function QuickAction(props: { label: string; send: (text: string) => void }) {
  return (
    <Box width="grow" height={34} alignY="center" paddingX={10} cornerRadius={9} backgroundColor={color.row} borderColor={color.borderSoft} borderWidth={1} focusable onPress={() => props.send(props.label)}>
      <Text color={color.textSoft} fontSize={12}>{props.label}</Text>
    </Box>
  )
}

function drawNovaPortrait(ctx: CanvasContext) {
  ctx.radialGradient(220, 150, 220, 0x7446ff56, 0x08122500)
  ctx.rect(230, 18, 188, 260, { fill: 0x05091472, radius: 28 })
  ctx.circle(286, 102, 74, { fill: 0x0a0b18ff, glow: { color: 0x7c3aed77, radius: 30, intensity: 58 } })
  ctx.ellipse(300, 90, 74, 56, { fill: 0x0b0d20ff, stroke: 0x6d4fb655, strokeWidth: 2 })
  ctx.rect(266, 62, 130, 78, { fill: 0xc3b2c9ff, radius: 36 })
  ctx.rect(252, 54, 156, 38, { fill: 0x08091bff, radius: 22 })
  ctx.rect(282, 87, 32, 8, { fill: 0xe9d5ffff, radius: 5, glow: { color: 0xc4b5fdcc, radius: 8, intensity: 70 } })
  ctx.rect(342, 86, 32, 8, { fill: 0xe9d5ffff, radius: 5, glow: { color: 0xc4b5fdcc, radius: 8, intensity: 70 } })
  ctx.ellipse(324, 110, 8, 15, { stroke: 0x6e5875aa, strokeWidth: 1 })
  ctx.bezier(306, 133, 328, 142, 352, 132, { color: 0x552f55ff, width: 2 })
  ctx.rect(390, 76, 28, 64, { fill: 0xbaa8bcff, radius: 18 })
  ctx.rect(412, 100, 8, 78, { fill: 0x111727ff, radius: 6, glow: { color: 0xa855f780, radius: 12, intensity: 65 } })
  ctx.rect(424, 118, 5, 38, { fill: color.orange, radius: 4 })
  ctx.rect(340, 168, 98, 138, { fill: 0x111525ff, radius: 44 })
  ctx.rect(382, 166, 42, 92, { fill: 0x090d19ff, stroke: 0xa78bff33, strokeWidth: 1, radius: 20, glow: { color: 0x8257e533, radius: 20, intensity: 42 } })
  ctx.rect(92, 184, 126, 78, { fill: 0x111a35cc, stroke: 0xa78bff44, strokeWidth: 1, radius: 14, glow: { color: 0x7c3aed55, radius: 24, intensity: 55 } })
  ctx.rect(106, 198, 12, 10, { fill: color.violet, radius: 5 })
  ctx.rect(122, 198, 28, 10, { fill: color.cyan, radius: 5 })
  ctx.rect(154, 198, 18, 10, { fill: color.fuchsia, radius: 5 })
  ;[12, 30, 21, 42, 16, 35, 50, 23, 39, 28, 48, 18, 34, 44, 20, 31].forEach((height, index) => {
    ctx.rect(106 + index * 6, 246 - height, 3, height, { fill: 0xa78bffcc, radius: 2 })
  })
  ;[18, 30, 44, 26, 50, 61, 72, 42, 68, 58].forEach((height, index) => {
    ctx.rect(300 + index * 8, 78 - height, 4, height, { fill: 0xa78bffdd, radius: 2, glow: { color: 0xa78bff99, radius: 8, intensity: 55 } })
  })
}

function NovaPortrait() {
  return (
    <Box width="grow" height={272} borderBottom={1} borderColor={color.borderSoft}>
      <canvas width="100%" height="100%" drawCacheKey="nova-portrait:v2" onDraw={drawNovaPortrait} />
      <Box floating="parent" floatOffset={{ x: 32, y: 34 }} zIndex={3}>
        <Text color={color.text} fontSize={30} fontWeight={700}>NOVA</Text>
        <Text color={color.textSoft} fontSize={11}>v1.1.2 / core assistant</Text>
      </Box>
    </Box>
  )
}

function NovaPanel(props: { width: number; height: number }) {
  const [messages, setMessages] = createSignal<string[]>([])
  const send = (text: string) => {
    if (!text.trim()) return
    setMessages((items) => [text.trim(), ...items].slice(0, 4))
  }

  return (
    <Surface width={props.width} height={props.height} padding={0} backgroundColor={0x11182dda} borderColor={0xffffff2e} contain="paint">
      <Box width="grow" height={48} direction="row" alignY="center" alignX="space-between" paddingX={18} borderBottom={1} borderColor={color.borderSoft}>
        <Text color={color.textSoft} fontSize={11} fontWeight={700}>{ICON.BOT} AI ASSISTANT — NOVA</Text>
        <Box direction="row" alignY="center" gap={8}>
          <Box width={9} height={9} cornerRadius={999} backgroundColor={color.green} glow={{ radius: 14, color: color.green, intensity: 80 }} />
          <Text color={color.text} fontSize={11} fontWeight={700}>ONLINE</Text>
        </Box>
      </Box>
      <NovaPortrait />
      <Box width="grow" direction="column" gap={10} padding={16} borderBottom={1} borderColor={color.borderSoft} backgroundColor={0x15182d99}>
        <Text color={color.textSoft} fontSize={13}>How can I assist with your workflow?</Text>
        <Box width="grow" direction="row" gap={8}>
          <QuickAction label="Explain this code" send={send} />
          <QuickAction label="Optimize performance" send={send} />
        </Box>
        <Box width="grow" direction="row" gap={8}>
          <QuickAction label="Add unit tests" send={send} />
          <QuickAction label="Refactor module" send={send} />
        </Box>
        <Box width="grow" height={42} direction="row" alignY="center" gap={8} paddingX={12} cornerRadius={10} backgroundColor={0x7c3aed14} borderColor={0xa78bff55} borderWidth={1} shadow={shadow.active} focusable onPress={() => send("Ask NOVA anything") }>
          <Text color={color.muted} fontSize={12}>Ask NOVA anything...</Text>
          <Box width="grow" alignX="right"><Text color={color.violet} fontSize={17}>{ICON.SEND}</Text></Box>
        </Box>
        <For each={messages()}>{(message) => (
          <Box width="grow" minHeight={30} padding={8} cornerRadius={9} backgroundColor={0x0f1830bf} borderColor={0xa78bff26} borderWidth={1}>
            <Text color={color.textSoft} fontSize={11}>NOVA queued: {message}</Text>
          </Box>
        )}</For>
      </Box>
      <Box width="grow" direction="column" padding={16} gap={6}>
        <SectionLabel label="CONTEXT AWARE" right="3 files" />
        <For each={files}>{(file, index) => (
          <Box width="grow" height={38} direction="row" alignY="center" gap={10} paddingX={8} borderTop={index() === 0 ? 0 : 1} borderColor={color.borderSoft}>
            <IconBadge icon={ICON.TS} size={22} />
            <Text color={color.textSoft} fontSize={12}>{file.name}</Text>
            <Box width="grow" alignX="right"><Text color={color.faint} fontSize={10}>{index() === 0 ? "Active" : index() === 1 ? "Recently edited" : "In workspace"}</Text></Box>
          </Box>
        )}</For>
      </Box>
    </Surface>
  )
}

function Dock(props: { width: number; height: number; activeApp: AppKey; setActiveApp: (key: AppKey) => void }) {
  return (
    <Surface width={props.width} height={props.height} direction="row" alignY="center" gap={8} paddingX={8} backgroundColor={0x10182ce8} borderColor={0xffffff2b} shadow={shadow.dock} contain="paint">
      <For each={dockItems}>{(item) => {
        const target = () => dockTarget(item.key)
        const active = () => props.activeApp === target()
        return (
          <Box width="grow" minWidth={136} height={56} direction="row" alignY="center" gap={12} paddingX={12} cornerRadius={11} backgroundColor={active() ? 0x7c3aed33 : 0xffffff09} borderColor={active() ? 0xa78bff66 : color.borderSoft} borderWidth={1} focusable onPress={() => props.setActiveApp(target())}>
            <Show when={item.icon === ICON.LOGO} fallback={<IconBadge icon={item.icon} active={active()} size={38} />}><CosmicLogo small /></Show>
            <Box>
              <Text color={color.text} fontSize={12} fontWeight={700}>{item.label}</Text>
              <Text color={color.muted} fontSize={10}>{item.sub}</Text>
            </Box>
          </Box>
        )
      }}</For>
      <Box width={56} height={56} alignX="center" alignY="center" cornerRadius={13} backgroundColor={color.row} borderColor={color.borderSoft} borderWidth={1} focusable>
        <Text color={color.textSoft} fontSize={18}>{ICON.PLUS}</Text>
      </Box>
    </Surface>
  )
}

function Starfield(props: { width: number; height: number }) {
  return (
    <>
      <Box width={Math.round(props.width * 0.72)} height={Math.round(props.height * 0.38)} floating="root" floatOffset={{ x: Math.round(props.width * 0.16), y: Math.round(props.height * 0.72) }} zIndex={0} pointerPassthrough cornerRadius={999} gradient={{ type: "radial", from: 0x7e3af25c, to: 0x00000000 }} />
      <Box width={Math.round(props.width * 0.40)} height={Math.round(props.height * 0.30)} floating="root" floatOffset={{ x: Math.round(props.width * 0.66), y: Math.round(props.height * 0.70) }} zIndex={0} pointerPassthrough cornerRadius={999} gradient={{ type: "radial", from: 0xd946ef33, to: 0x00000000 }} />
      <canvas width={props.width} height={props.height} floating="root" floatOffset={{ x: 0, y: 0 }} zIndex={0} pointerPassthrough drawCacheKey={`cosmic-bg:${props.width}x${props.height}:v2`} onDraw={(ctx: CanvasContext) => {
        ctx.starfield(0, 0, props.width, props.height, { seed: 7, count: 72, clusterCount: 2, clusterStars: 12, coolColor: 0xa78bffcc, neutralColor: 0xe2e8f0dd })
      }} />
    </>
  )
}

export function OpenCodeCosmicShellApp(props: ShellProps) {
  const [activeApp, setActiveApp] = createSignal<AppKey>(APP_KEY.EDITOR)
  const [activeFile, setActiveFile] = createSignal(0)
  const [drawerOpen, setDrawerOpen] = createSignal(true)
  const [typingLine, setTypingLine] = createSignal<string | null>(null)
  if (props.onTypingReady) {
    const baseLine = files[0].content.split("\n").at(-1) ?? "}"
    props.onTypingReady((index: number) => {
      const marker = index % 2 === 0 ? "." : ","
      setTypingLine(`${baseLine.slice(0, -1)}${marker}`)
    })
  }
  const wide = () => props.width >= 1280
  const showRail = () => drawerOpen() && props.width >= 860
  const manager = createOpenCodeWindowManager(() => createOpenCodeShellWindows({
    width: props.width,
    height: props.height,
    railVisible: showRail(),
    novaVisible: wide(),
    overlayVisible: activeApp() !== APP_KEY.EDITOR,
  }))
  const win = (id: OpenCodeWindowId) => manager.visibleWindow(id)

  return (
    <Page width={props.width} height={props.height} backgroundColor={color.void}>
      <Show when={win(OPENCODE_WINDOW_ID.BACKGROUND)}>{(window) => (
        <WindowLayer window={window()}>
          <Starfield width={window().rect.width} height={window().rect.height} />
        </WindowLayer>
      )}</Show>
      <Show when={win(OPENCODE_WINDOW_ID.RAIL)}>{(window) => (
        <WindowLayer window={window()}>
          <LeftRail width={window().rect.width} height={window().rect.height} activeApp={activeApp()} setActiveApp={(key) => {
            manager.focus(OPENCODE_WINDOW_ID.RAIL)
            setActiveApp(key)
          }} />
        </WindowLayer>
      )}</Show>
      <Show when={win(OPENCODE_WINDOW_ID.EDITOR)}>{(window) => (
        <WindowLayer window={window()}>
          <Box width={42} height={42} floating="parent" floatOffset={{ x: -12, y: 0 }} zIndex={35} alignX="center" alignY="center" cornerRadius={999} backgroundColor={0x111827e6} borderColor={color.borderStrong} borderWidth={1} shadow={shadow.active} focusable onPress={(event) => {
            event?.stopPropagation()
            manager.focus(OPENCODE_WINDOW_ID.EDITOR)
            setDrawerOpen((value) => !value)
          }}>
            <Text color={color.text} fontSize={16}>{ICON.COMMAND}</Text>
          </Box>
          <CodeEditor width={window().rect.width} height={window().rect.height} activeFile={activeFile()} setActiveFile={(index) => {
            manager.focus(OPENCODE_WINDOW_ID.EDITOR)
            setActiveFile(index)
          }} typingLine={typingLine} />
        </WindowLayer>
      )}</Show>
      <Show when={win(OPENCODE_WINDOW_ID.OVERLAY)}>{(window) => (
        <WindowLayer window={window()}>
          <AppOverlay width={window().rect.width} activeApp={activeApp()} onClose={() => {
            manager.focus(OPENCODE_WINDOW_ID.EDITOR)
            setActiveApp(APP_KEY.EDITOR)
          }} />
        </WindowLayer>
      )}</Show>
      <Show when={win(OPENCODE_WINDOW_ID.NOVA)}>{(window) => (
        <WindowLayer window={window()}>
          <NovaPanel width={window().rect.width} height={window().rect.height} />
        </WindowLayer>
      )}</Show>
      <Show when={win(OPENCODE_WINDOW_ID.DOCK)}>{(window) => (
        <WindowLayer window={window()}>
          <Dock width={window().rect.width} height={window().rect.height} activeApp={activeApp()} setActiveApp={(key) => {
            manager.focus(OPENCODE_WINDOW_ID.DOCK)
            setActiveApp(key)
          }} />
        </WindowLayer>
      )}</Show>
    </Page>
  )
}

export function runOpenCodeCosmicShellSelfTests() {
  const appKeys = new Set(Object.keys(appCards))
  const launcherKeys = launcherGroups.flatMap((group) => group.items.map((item) => item.key))
  const errors: string[] = []

  if (files.length !== 3) errors.push("Expected exactly 3 context files to match the NOVA panel.")
  if (!files.every((file) => file.name.length > 0 && file.kind.length > 0 && file.content.length > 20)) errors.push("Every file needs name, kind, and non-empty content.")
  if (!launcherKeys.every((key) => appKeys.has(key))) errors.push("Every launcher item must have a matching app card.")
  if (!dockItems.every((item) => item.key === DOCK_KEY.HOME || appKeys.has(item.key))) errors.push("Every dock item must resolve to an app card or home.")
  if (!launcherGroups.some((group) => group.items.some((item) => item.key === APP_KEY.ASSISTANT && item.dot))) errors.push("Assistant launcher item should keep the online dot.")

  return { passed: errors.length === 0, errors }
}
