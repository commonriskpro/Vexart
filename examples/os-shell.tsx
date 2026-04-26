/**
 * Vexart OS Shell — Desktop Environment in the Terminal.
 *
 * Run: bun --conditions=browser run examples/os-shell.tsx
 */

import { createSignal, createMemo, For, Show, onCleanup } from "solid-js"
import {
  useDrag,
  markDirty,
  useTerminalDimensions,
  type NodeMouseEvent,
} from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"

// ── Theme ────────────────────────────────────────────────────────────────────

const c = {
  bg:           0x0c0e14ff,
  surface:      0x141822ff,
  surfaceAlt:   0x1a1f2eff,
  surfaceHover: 0x252b3bff,
  border:       0xffffff12,
  borderLight:  0xffffff1e,
  text:         0xeaedf3ff,
  textSoft:     0xb0b8c8ff,
  textMuted:    0x6b7280ff,
  textDim:      0x4b5563ff,
  accent:       0x4488ccff,
  accentSoft:   0x44669928,
  green:        0x22c55eff,
  greenDot:     0x34d399ff,
  red:          0xef4444ff,
  yellow:       0xf59e0bff,
  purple:       0xa78bfaff,
  cyan:         0x67e8f9ff,
  kw:           0xc586c0ff,
  str:          0xce9178ff,
  plain:        0xd4d4d4ff,
} as const

// ── Popup state ──────────────────────────────────────────────────────────────

type PopupId = "terminal" | "explorer" | "git"
type Popup = { id: PopupId; title: string; x: number; y: number; w: number; h: number; z: number; open: boolean }

function createPopups() {
  const [list, setList] = createSignal<Popup[]>([
    { id: "terminal", title: "Terminal",  x: 220, y: 60, w: 580, h: 320, z: 80, open: false },
    { id: "explorer", title: "Explorer",  x: 260, y: 80, w: 440, h: 360, z: 81, open: false },
    { id: "git",      title: "Git",       x: 300, y: 50, w: 500, h: 340, z: 82, open: false },
  ])
  const [nextZ, setNextZ] = createSignal(85)
  const toggle = (id: PopupId) => setList(l => l.map(p => p.id === id ? { ...p, open: !p.open } : p))
  const close  = (id: PopupId) => setList(l => l.map(p => p.id === id ? { ...p, open: false } : p))
  const front  = (id: PopupId) => { const z = nextZ(); setNextZ(z + 1); setList(l => l.map(p => p.id === id ? { ...p, z } : p)) }
  const move   = (id: PopupId, x: number, y: number) => setList(l => l.map(p => p.id === id ? { ...p, x, y } : p))
  return { list, toggle, close, front, move }
}

// ── Draggable popup shell ────────────────────────────────────────────────────

function PopupShell(props: { p: Popup; onClose: () => void; onFront: () => void; onMove: (x: number, y: number) => void; children: any }) {
  let ax = 0, ay = 0
  const { dragProps } = useDrag({
    onDragStart: (e: NodeMouseEvent) => { ax = e.nodeX; ay = e.nodeY; props.onFront() },
    onDrag: (e: NodeMouseEvent) => { props.onMove(Math.round(e.x - ax), Math.round(e.y - ay)); markDirty() },
  })
  return (
    <box floating="root" floatOffset={{ x: props.p.x, y: props.p.y }} zIndex={props.p.z}
      width={props.p.w} height={props.p.h}
      backgroundColor={c.surface} cornerRadius={10} borderColor={c.borderLight} borderWidth={1}
      shadow={[{ x: 0, y: 10, blur: 30, color: 0x00000070 }]}
      direction="column" onMouseDown={() => props.onFront()}
    >
      <box height={28} direction="row" alignY="center" paddingX={10} gap={6}
        backgroundColor={0x0e1019f0} cornerRadii={{ tl: 10, tr: 10, br: 0, bl: 0 }}
        borderBottom={1} borderColor={c.border} {...dragProps}
      >
        <box width={10} height={10} cornerRadius={9999} backgroundColor={c.red}
          focusable onPress={() => props.onClose()} hoverStyle={{ backgroundColor: 0xff6b6bff }}
        />
        <box width={10} height={10} cornerRadius={9999} backgroundColor={c.yellow} />
        <box width={10} height={10} cornerRadius={9999} backgroundColor={c.green} />
        <box width={8} />
        <text color={c.textMuted} fontSize={11}>{props.p.title}</text>
      </box>
      <box width="grow" height="grow">{props.children}</box>
    </box>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarItem(props: { label: string; active?: boolean; dot?: boolean; onPress?: () => void }) {
  return (
    <box height={26} direction="row" alignY="center" gap={8} paddingX={14} cornerRadius={6}
      backgroundColor={props.active ? c.accentSoft : 0x00000001}
      hoverStyle={{ backgroundColor: c.surfaceHover }}
      focusable onPress={props.onPress}
    >
      <text color={props.active ? c.text : c.textSoft} fontSize={12} fontWeight={props.active ? 600 : 400}>{props.label}</text>
      <Show when={props.dot}>
        <box width="grow" />
        <box width={6} height={6} cornerRadius={9999} backgroundColor={c.greenDot} />
      </Show>
    </box>
  )
}

function Sidebar(props: { popups: ReturnType<typeof createPopups> }) {
  return (
    <box width={190} height="grow" backgroundColor={c.surface} direction="column" borderRight={1} borderColor={c.border}>
      <box paddingX={16} paddingY={12} direction="column" gap={2}>
        <text color={c.text} fontSize={13} fontWeight={700}>OPENCODE OS</text>
        <text color={c.textDim} fontSize={8}>COSMIC EDITION</text>
      </box>
      <box height={1} backgroundColor={c.border} />
      <box width="grow" height="grow" scrollY direction="column" paddingY={4} gap={2}>
        <box paddingX={14} paddingY={6}><text color={c.textDim} fontSize={9} fontWeight={700}>LAUNCHER</text></box>
        <SidebarItem label="Editor" active />
        <SidebarItem label="Explorer" onPress={() => props.popups.toggle("explorer")} />
        <SidebarItem label="Terminal" onPress={() => props.popups.toggle("terminal")} />
        <SidebarItem label="Git" onPress={() => props.popups.toggle("git")} />
        <SidebarItem label="Packages" />
        <SidebarItem label="Settings" />

        <box paddingX={14} paddingY={6}><text color={c.textDim} fontSize={9} fontWeight={700}>WORKBENCH</text></box>
        <SidebarItem label="Overview" />
        <SidebarItem label="Projects" />
        <SidebarItem label="Agents" />
        <SidebarItem label="Assistant" active dot />
        <SidebarItem label="Datasets" />
        <SidebarItem label="Snippets" />

        <box paddingX={14} paddingY={6}><text color={c.textDim} fontSize={9} fontWeight={700}>SYSTEM</text></box>
        <SidebarItem label="Processes" />
        <SidebarItem label="Performance" />
        <SidebarItem label="Network" />
        <SidebarItem label="Storage" />
      </box>
      <box height={1} backgroundColor={c.border} />
      <box paddingX={14} paddingY={8} direction="row" gap={8} alignY="center">
        <box width={28} height={28} cornerRadius={9999} backgroundColor={c.purple} alignX="center" alignY="center">
          <text color={0xffffffff} fontSize={10} fontWeight={700}>N7</text>
        </box>
        <box direction="column" gap={1}>
          <text color={c.text} fontSize={10} fontWeight={600}>NOVA-7</text>
          <text color={c.textDim} fontSize={8}>ACTIVE</text>
        </box>
      </box>
    </box>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

const LINES: { n: number; t: string; imp: boolean }[] = [
  { n: 1,  t: "import { useEffect, useMemo, useState } from 'react';", imp: true },
  { n: 2,  t: "import { html } from 'react-helmet-async';", imp: true },
  { n: 3,  t: "import { Card, CardHeader } from '@/components/ui/card';", imp: true },
  { n: 4,  t: "import { LineChart, Line, XAxis } from 'recharts';", imp: true },
  { n: 5,  t: "import { fetchTraffic } from '@/services/metrics';", imp: true },
  { n: 6,  t: "import { formatBytes } from '@/lib/format';", imp: true },
  { n: 7,  t: "", imp: false },
  { n: 8,  t: "type Point = {", imp: false },
  { n: 9,  t: "  time: string;", imp: false },
  { n: 10, t: "  requests: number;", imp: false },
  { n: 11, t: "  latency: number;", imp: false },
  { n: 12, t: "  bandwidth: number;", imp: false },
  { n: 13, t: "}", imp: false },
  { n: 14, t: "", imp: false },
  { n: 15, t: "export default function OrbitTraffic() {", imp: false },
  { n: 16, t: "  const [data, setData] = useState([]);", imp: false },
  { n: 17, t: "  const [range, setRange] = useState('6h');", imp: false },
  { n: 18, t: "  const [loading, setLoading] = useState(true);", imp: false },
  { n: 19, t: "", imp: false },
  { n: 20, t: "  useEffect(() => {", imp: false },
  { n: 21, t: "    let mounted = true;", imp: false },
  { n: 22, t: "    setLoading(true);", imp: false },
  { n: 23, t: "    fetchTraffic(range).then(res => {", imp: false },
  { n: 24, t: "      if (mounted) {", imp: false },
  { n: 25, t: "        setData(res);", imp: false },
  { n: 26, t: "        setLoading(false);", imp: false },
  { n: 27, t: "      }", imp: false },
  { n: 28, t: "    }).catch(() => setLoading(false));", imp: false },
  { n: 29, t: "    return () => { mounted = false };", imp: false },
  { n: 30, t: "  }, [range]);", imp: false },
  { n: 31, t: "", imp: false },
  { n: 32, t: "  const chartData = useMemo(() => data.map(d => ({", imp: false },
  { n: 33, t: "    time: new Date(d.time).toLocaleTimeString(),", imp: false },
  { n: 34, t: "    requests: d.requests,", imp: false },
  { n: 35, t: "    latency: d.bandwidth", imp: false },
  { n: 36, t: "  })), [data]);", imp: false },
]

function lineColor(t: string, imp: boolean): number {
  if (!t) return c.plain
  if (imp) return c.kw
  const s = t.trimStart()
  if (s.startsWith("type ") || s.startsWith("export ")) return c.kw
  if (t.includes("useState") || t.includes("useEffect") || t.includes("useMemo")) return c.cyan
  if (s.startsWith("const ") || s.startsWith("let ") || s.startsWith("return ") || s.startsWith("if ")) return c.kw
  return c.plain
}

function EditorPanel() {
  return (
    <box width="grow" height="grow" direction="column" backgroundColor={0x1e1e2eff}>
      {/* Titlebar */}
      <box height={28} direction="row" alignY="center" paddingX={10} gap={6}
        backgroundColor={0x0e1019f0} borderBottom={1} borderColor={c.border}
      >
        <box width={10} height={10} cornerRadius={9999} backgroundColor={c.red} />
        <box width={10} height={10} cornerRadius={9999} backgroundColor={c.yellow} />
        <box width={10} height={10} cornerRadius={9999} backgroundColor={c.green} />
        <box width={12} />
        <text color={c.textMuted} fontSize={11}>Editor</text>
      </box>

      {/* Tabs */}
      <box direction="row" alignY="center" backgroundColor={c.surfaceAlt} borderBottom={1} borderColor={c.border}>
        <box direction="row" gap={4} alignY="center" paddingX={10} paddingY={5}
          backgroundColor={c.surface} borderBottom={2} borderColor={c.accent}
        >
          <text color={c.cyan} fontSize={9}>TS</text>
          <text color={c.text} fontSize={11}>orbit-traffic.tsx</text>
          <text color={c.textDim} fontSize={9}>x</text>
        </box>
        <box direction="row" gap={4} alignY="center" paddingX={10} paddingY={5}>
          <text color={c.textMuted} fontSize={11}>metrics.service.ts</text>
        </box>
        <box direction="row" gap={4} alignY="center" paddingX={10} paddingY={5}>
          <text color={c.textMuted} fontSize={11}>useRealtime.ts</text>
        </box>
      </box>

      {/* Breadcrumb */}
      <box direction="row" gap={5} alignY="center" paddingX={14} paddingY={3}
        backgroundColor={c.surfaceAlt} borderBottom={1} borderColor={c.border}
      >
        <text color={c.textMuted} fontSize={10}>src</text>
        <text color={c.textDim} fontSize={10}>/</text>
        <text color={c.textMuted} fontSize={10}>app</text>
        <text color={c.textDim} fontSize={10}>/</text>
        <text color={c.textMuted} fontSize={10}>dashboard</text>
        <text color={c.textDim} fontSize={10}>/</text>
        <text color={c.text} fontSize={10}>orbit-traffic.tsx</text>
      </box>

      {/* Code */}
      <box width="grow" height="grow" scrollY direction="column" paddingY={4}>
        <For each={LINES}>{(line) => (
          <box direction="row" height={17} alignY="center" backgroundColor={line.n === 18 ? 0xffffff08 : 0x00000001}>
            <box width={36} alignX="right" paddingRight={12}>
              <text color={line.n === 18 ? c.textSoft : c.textDim} fontSize={12}>{String(line.n)}</text>
            </box>
            <text color={lineColor(line.t, line.imp)} fontSize={12}>{line.t || " "}</text>
          </box>
        )}</For>
      </box>

      {/* Status bar */}
      <box height={20} direction="row" alignY="center" alignX="space-between" paddingX={12}
        backgroundColor={c.surfaceAlt} borderTop={1} borderColor={c.border}
      >
        <box direction="row" gap={14}>
          <text color={c.textMuted} fontSize={10}>TypeScript</text>
          <text color={c.textMuted} fontSize={10}>UTF-8</text>
          <text color={c.textMuted} fontSize={10}>LF</text>
        </box>
        <text color={c.textMuted} fontSize={10}>Ln 18, Col 24</text>
      </box>
    </box>
  )
}

// ── Assistant ────────────────────────────────────────────────────────────────

function AssistantPanel() {
  return (
    <box width={300} height="grow" direction="column" backgroundColor={c.surface} borderLeft={1} borderColor={c.border}>
      {/* Header */}
      <box height={28} direction="row" alignY="center" alignX="space-between" paddingX={12}
        backgroundColor={0x0e1019f0} borderBottom={1} borderColor={c.border}
      >
        <text color={c.textMuted} fontSize={10} fontWeight={600}>AI ASSISTANT -- NOVA</text>
        <box direction="row" gap={4} alignY="center">
          <box width={5} height={5} cornerRadius={9999} backgroundColor={c.greenDot} />
          <text color={c.greenDot} fontSize={9}>ONLINE</text>
        </box>
      </box>

      <box width="grow" height="grow" scrollY direction="column" padding={14} gap={10}>
        {/* Avatar */}
        <box width="grow" height={140} cornerRadius={10}
          gradient={{ type: "linear", from: 0x1a1033ff, to: 0x0d1020ff, angle: 180 }}
          alignX="center" alignY="center" direction="column" gap={6}
        >
          <box width={50} height={50} cornerRadius={9999} backgroundColor={c.purple}
            alignX="center" alignY="center"
            shadow={[{ x: 0, y: 0, blur: 20, color: 0xa78bfa40 }]}
          >
            <text color={0xffffffff} fontSize={18} fontWeight={700}>N</text>
          </box>
          <text color={c.text} fontSize={14} fontWeight={700}>NOVA</text>
          <text color={c.textMuted} fontSize={9}>v1.1.2 / core assistant</text>
        </box>

        <text color={c.textSoft} fontSize={12}>How can I assist with your workflow?</text>

        {/* Quick actions */}
        <box direction="column" gap={4}>
          <box paddingX={10} paddingY={6} cornerRadius={6} borderColor={c.border} borderWidth={1}
            hoverStyle={{ backgroundColor: c.surfaceHover }} focusable
          >
            <text color={c.textSoft} fontSize={11}>Explain this code</text>
          </box>
          <box paddingX={10} paddingY={6} cornerRadius={6} borderColor={c.border} borderWidth={1}
            hoverStyle={{ backgroundColor: c.surfaceHover }} focusable
          >
            <text color={c.textSoft} fontSize={11}>Optimize performance</text>
          </box>
          <box paddingX={10} paddingY={6} cornerRadius={6} borderColor={c.border} borderWidth={1}
            hoverStyle={{ backgroundColor: c.surfaceHover }} focusable
          >
            <text color={c.textSoft} fontSize={11}>Add unit tests</text>
          </box>
          <box paddingX={10} paddingY={6} cornerRadius={6} borderColor={c.border} borderWidth={1}
            hoverStyle={{ backgroundColor: c.surfaceHover }} focusable
          >
            <text color={c.textSoft} fontSize={11}>Refactor module</text>
          </box>
        </box>

        {/* Input */}
        <box direction="row" gap={6} alignY="center" padding={8} cornerRadius={8}
          borderColor={c.border} borderWidth={1} backgroundColor={c.surfaceAlt}
          hoverStyle={{ borderColor: c.accent }}
        >
          <text color={c.textDim} fontSize={11}>Ask NOVA anything...</text>
          <box width="grow" />
          <box width={22} height={22} cornerRadius={5} backgroundColor={c.accent}
            alignX="center" alignY="center" focusable
          >
            <text color={0xffffffff} fontSize={11}>go</text>
          </box>
        </box>

        {/* Context */}
        <box direction="column" gap={4}>
          <box direction="row" alignY="center" alignX="space-between">
            <text color={c.textMuted} fontSize={9} fontWeight={600}>CONTEXT AWARE</text>
            <text color={c.textDim} fontSize={9}>3 files</text>
          </box>
          <box direction="row" gap={6} alignY="center" paddingY={2}>
            <box width={5} height={5} cornerRadius={9999} backgroundColor={c.green} />
            <text color={c.text} fontSize={11}>orbit-traffic.tsx</text>
            <box width="grow" />
            <text color={c.textDim} fontSize={9}>Active</text>
          </box>
          <box direction="row" gap={6} alignY="center" paddingY={2}>
            <box width={5} height={5} cornerRadius={9999} backgroundColor={c.yellow} />
            <text color={c.text} fontSize={11}>metrics.service.ts</text>
            <box width="grow" />
            <text color={c.textDim} fontSize={9}>Edited</text>
          </box>
          <box direction="row" gap={6} alignY="center" paddingY={2}>
            <box width={5} height={5} cornerRadius={9999} backgroundColor={c.textDim} />
            <text color={c.text} fontSize={11}>useRealtime.ts</text>
            <box width="grow" />
            <text color={c.textDim} fontSize={9}>In workspace</text>
          </box>
        </box>
      </box>
    </box>
  )
}

// ── Popup contents ───────────────────────────────────────────────────────────

function TerminalContent() {
  const lines = [
    { t: "$ bun run dev", clr: c.green },
    { t: "  Compiling project...", clr: c.textMuted },
    { t: "  Server running on http://localhost:3000", clr: c.textSoft },
    { t: " ", clr: c.plain },
    { t: "$ git status", clr: c.green },
    { t: "  On branch main", clr: c.textSoft },
    { t: "  Changes not staged for commit:", clr: c.yellow },
    { t: "    modified: orbit-traffic.tsx", clr: c.red },
    { t: "    modified: metrics.service.ts", clr: c.red },
    { t: " ", clr: c.plain },
    { t: "$ _", clr: c.green },
  ]
  return (
    <box width="grow" height="grow" backgroundColor={0x0a0a0aff} padding={10} direction="column" gap={2}>
      <For each={lines}>{(l) => <text color={l.clr} fontSize={12}>{l.t}</text>}</For>
    </box>
  )
}

function ExplorerContent() {
  const entries = [
    "src/", "  app/", "    dashboard/", "      orbit-traffic.tsx", "      analytics.tsx",
    "    layout.tsx", "  components/", "    ui/", "      card.tsx",
    "  services/", "    metrics.service.ts", "package.json", "tsconfig.json",
  ]
  return (
    <box width="grow" height="grow" backgroundColor={c.surface} scrollY padding={8} direction="column" gap={1}>
      <For each={entries}>{(e) => (
        <box paddingY={3} paddingX={8} cornerRadius={4}
          hoverStyle={{ backgroundColor: c.surfaceHover }} focusable
        >
          <text color={e.endsWith("/") ? c.yellow : c.textSoft} fontSize={12}>{e}</text>
        </box>
      )}</For>
    </box>
  )
}

function GitContent() {
  const commits = [
    { h: "a1b2c3d", m: "feat: add orbit traffic dashboard", t: "2h" },
    { h: "e4f5g6h", m: "fix: metrics service caching", t: "5h" },
    { h: "i7j8k9l", m: "refactor: extract useRealtime", t: "1d" },
    { h: "m0n1o2p", m: "chore: update dependencies", t: "2d" },
  ]
  return (
    <box width="grow" height="grow" backgroundColor={c.surface} padding={12} direction="column" gap={6}>
      <box direction="row" gap={6} alignY="center">
        <box width={7} height={7} cornerRadius={9999} backgroundColor={c.green} />
        <text color={c.text} fontSize={12} fontWeight={600}>main</text>
      </box>
      <box height={1} backgroundColor={c.border} />
      <For each={commits}>{(cm) => (
        <box direction="row" gap={8} alignY="center" paddingY={3}>
          <text color={c.yellow} fontSize={10}>{cm.h}</text>
          <text color={c.textSoft} fontSize={11}>{cm.m}</text>
          <box width="grow" />
          <text color={c.textDim} fontSize={9}>{cm.t}</text>
        </box>
      )}</For>
    </box>
  )
}

// ── Dock item ────────────────────────────────────────────────────────────────

function DockItem(props: { label: string; sub?: string; active?: boolean; onPress?: () => void }) {
  return (
    <box direction="column" gap={0} paddingX={10} paddingY={4} cornerRadius={6}
      backgroundColor={props.active ? c.surfaceHover : 0x00000001}
      hoverStyle={{ backgroundColor: c.surfaceHover }}
      focusable onPress={props.onPress}
    >
      <text color={props.active ? c.text : c.textMuted} fontSize={11} fontWeight={props.active ? 600 : 400}>{props.label}</text>
      <Show when={props.sub}>
        <text color={c.textDim} fontSize={8}>{props.sub}</text>
      </Show>
    </box>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const pm = createPopups()
  const DOCK_H = 44

  return (
    <box width={dims.width()} height={dims.height()} backgroundColor={c.bg} direction="column">
      {/* Main body: row with sidebar | editor | assistant */}
      <box width={dims.width()} height={dims.height() - DOCK_H} direction="row">
        <Sidebar popups={pm} />
        <EditorPanel />
        <AssistantPanel />
      </box>

      {/* Dock */}
      <box width={dims.width()} height={DOCK_H}
        backgroundColor={0x0f1320f4} borderTop={1} borderColor={c.borderLight}
        direction="row" alignY="center" gap={2} paddingX={10}
      >
        <box paddingX={6} direction="column">
          <text color={c.text} fontSize={10} fontWeight={700}>OpenCode OS</text>
          <text color={c.textDim} fontSize={7}>COSMIC EDITION</text>
        </box>
        <box width={1} height={22} backgroundColor={c.border} />
        <DockItem label="Editor" sub="orbit-traffic.tsx" active />
        <DockItem label="Terminal" sub="zsh"
          active={pm.list().find(p => p.id === "terminal")?.open}
          onPress={() => pm.toggle("terminal")}
        />
        <DockItem label="Explorer"
          active={pm.list().find(p => p.id === "explorer")?.open}
          onPress={() => pm.toggle("explorer")}
        />
        <DockItem label="Git" sub="main"
          active={pm.list().find(p => p.id === "git")?.open}
          onPress={() => pm.toggle("git")}
        />
        <DockItem label="Assistant" sub="NOVA" active />
        <box width="grow" />
        <box width={24} height={24} cornerRadius={6} backgroundColor={c.surfaceAlt}
          alignX="center" alignY="center" focusable
          hoverStyle={{ backgroundColor: c.surfaceHover }}
        >
          <text color={c.textMuted} fontSize={14}>+</text>
        </box>
      </box>

      {/* Popup windows (floating on top) */}
      <For each={pm.list().filter(p => p.open)}>{(win) => (
        <PopupShell p={win}
          onClose={() => pm.close(win.id)}
          onFront={() => pm.front(win.id)}
          onMove={(x, y) => pm.move(win.id, x, y)}
        >
          {win.id === "terminal" ? <TerminalContent /> :
           win.id === "explorer" ? <ExplorerContent /> :
           <GitContent />}
        </PopupShell>
      )}</For>
    </box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: {
    maxFps: 60,
    experimental: {
      forceLayerRepaint: true,
      nativePresentation: false,
      nativeLayerRegistry: false,
    },
  },
})
