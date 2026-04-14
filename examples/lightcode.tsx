/**
 * LightCode 2.5D Demo — Spatial workbench with node graph.
 *
 * Rewritten with SceneCanvas declarative scene graph.
 *
 * Run: bun --conditions=browser run examples/lightcode.tsx
 */

import { createSignal, onCleanup, For } from "solid-js"
import { mount, markDirty, useDrag } from "@tge/renderer"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { radius, space } from "@tge/void"
import { SceneCanvas, SceneNode, SceneEdge, SceneParticles, SceneOverlay } from "@tge/components"
import type { CanvasContext, NodeMouseEvent } from "@tge/renderer"

// ── Load nebula image at startup ──

let nebulaData: Uint8Array | null = null
let nebulaW = 0
let nebulaH = 0

async function loadNebula() {
  try {
    const sharp = require("sharp")
    const img = sharp("./examples/nebula.jpg")
    const meta = await img.metadata()
    const scale = 0.5
    const w = Math.round((meta.width ?? 960) * scale)
    const h = Math.round((meta.height ?? 911) * scale)
    const { data } = await img.resize(w, h).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
    nebulaData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    nebulaW = w
    nebulaH = h
    markDirty()
  } catch (e) {
    console.error("[nebula] Failed to load:", e)
  }
}

// ── Draggable panel hook ──

function useDraggablePanel(initialX: number, initialY: number) {
  const [offsetX, setOffsetX] = createSignal(initialX)
  const [offsetY, setOffsetY] = createSignal(initialY)
  let anchorX = 0
  let anchorY = 0

  const { dragProps } = useDrag({
    onDragStart: (evt: NodeMouseEvent) => {
      anchorX = evt.nodeX
      anchorY = evt.nodeY
    },
    onDrag: (evt: NodeMouseEvent) => {
      setOffsetX(Math.round(evt.x - anchorX))
      setOffsetY(Math.round(evt.y - anchorY))
      markDirty()
    },
  })

  return { offsetX, offsetY, dragProps }
}

// ── Design tokens ──

const T = {
  bg: 0x080812ff,
  panelBg: 0x111122dd,
  cardBg: 0x1a1a30ff,
  surfaceBg: 0x0f0f20ff,
  hoverBg: 0xffffff0a,
  activeBg: 0x2a6fff22,
  border: 0xffffff12,
  borderLight: 0xffffff1a,
  textPrimary: 0xeeeeeeff,
  textSecondary: 0xa0a0b4ff,
  textMuted: 0x666680ff,
  textDim: 0x444460ff,
  orange: 0xf0a050ff,
  orangeGlow: 0xf0a05080,
  cyan: 0x56d4c8ff,
  cyanGlow: 0x56d4c860,
  green: 0x22c55eff,
  greenDim: 0x22c55e88,
  blue: 0x3b82f6ff,
  purple: 0xa78bfaff,
  yellow: 0xf59e0bff,
  red: 0xef4444ff,
  blur: 16,
  panelRadius: 14,
  cardRadius: 10,
}

// ── Node graph data ──

type GraphNodeData = {
  id: string; label: string; subtitle?: string
  x: number; y: number; radius: number
  fillColor: number; strokeColor: number; glowColor: number
  sides: number; status: "active" | "idle" | "error"
}

const nodes: GraphNodeData[] = [
  { id: "core", label: "Core", x: 500, y: 400, radius: 55, fillColor: 0x2a1a10ff, strokeColor: T.orange, glowColor: T.orangeGlow, sides: 4, status: "active" },
  { id: "shaders", label: "Shaders", subtitle: "3 files", x: 280, y: 220, radius: 46, fillColor: 0x141430ff, strokeColor: T.cyan, glowColor: T.cyanGlow, sides: 6, status: "idle" },
  { id: "memory", label: "Memory", subtitle: "12 items", x: 720, y: 260, radius: 48, fillColor: 0x141430ff, strokeColor: T.cyan, glowColor: T.cyanGlow, sides: 6, status: "idle" },
  { id: "pipeline", label: "Pipeline", subtitle: "8 stages", x: 730, y: 540, radius: 46, fillColor: 0x141430ff, strokeColor: T.cyan, glowColor: T.cyanGlow, sides: 6, status: "idle" },
  { id: "camera", label: "Camera", subtitle: "matrix", x: 260, y: 560, radius: 44, fillColor: 0x141430ff, strokeColor: T.cyan, glowColor: T.cyanGlow, sides: 6, status: "idle" },
  { id: "tests", label: "Tests", subtitle: "24 passed", x: 520, y: 700, radius: 42, fillColor: 0x141430ff, strokeColor: T.green, glowColor: 0x22c55e50, sides: 6, status: "idle" },
  { id: "renderer", label: "Renderer", x: 100, y: 400, radius: 42, fillColor: 0x141430ff, strokeColor: T.purple, glowColor: 0xa78bfa50, sides: 6, status: "idle" },
  { id: "engine", label: "v_engine", x: 500, y: 170, radius: 40, fillColor: 0x1a1a38ff, strokeColor: T.yellow, glowColor: 0xf59e0b50, sides: 8, status: "idle" },
]

const edges = [
  { id: "e1", from: "core", to: "shaders", color: 0xf0a05040 },
  { id: "e2", from: "core", to: "memory", color: 0xf0a05040 },
  { id: "e3", from: "core", to: "pipeline", color: 0xf0a05035 },
  { id: "e4", from: "core", to: "camera", color: 0xf0a05035 },
  { id: "e5", from: "core", to: "tests", color: 0xf0a05028 },
  { id: "e6", from: "shaders", to: "renderer", color: 0xa78bfa25 },
  { id: "e7", from: "shaders", to: "engine", color: 0xf59e0b25 },
  { id: "e8", from: "memory", to: "pipeline", color: 0x56d4c820 },
  { id: "e9", from: "camera", to: "renderer", color: 0xa78bfa20 },
  { id: "e10", from: "engine", to: "core", color: 0xf0a05038 },
]

// ── Node Graph — declarative with SceneCanvas ──

function NodeGraph(props: { mouseX: () => number; mouseY: () => number }) {
  const [positions, setPositions] = createSignal(
    Object.fromEntries(nodes.map(n => [n.id, { x: n.x, y: n.y }]))
  )
  const [selected, setSelected] = createSignal("core")
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, zoom: 1 })

  function getPos(id: string) {
    return () => positions()[id] ?? { x: 0, y: 0 }
  }

  function shapeFromSides(sides: number): "diamond" | "hexagon" | "octagon" | number {
    if (sides === 4) return "diamond"
    if (sides === 6) return "hexagon"
    if (sides === 8) return "octagon"
    return sides
  }

  return (
    <SceneCanvas
      viewport={viewport()}
      onViewportChange={setViewport}
      background={(ctx: CanvasContext) => {
        // Nebula background with parallax
        const parallaxFactor = 0.03
        const px = Math.round(-(props.mouseX() - 500) * parallaxFactor)
        const py = Math.round(-(props.mouseY() - 400) * parallaxFactor)

        if (nebulaData) {
          ctx.drawImage(-40 + px, -40 + py, 1180, 980, nebulaData, nebulaW, nebulaH, 0.45)
        } else {
          ctx.rect(-200, -200, 1500, 1300, { fill: 0x050510ff })
        }

        // Vignette + nebula tint
        ctx.radialGradient(500, 400, 600, 0x00000000, 0x050510c0)
        ctx.radialGradient(500, 400, 300, 0x1a0a3020, 0x00000000)
        ctx.glow(500, 400, 180, 180, 0x1a0a2020, 15)
      }}
    >
      {/* Stars */}
      <SceneParticles
        id="stars"
        config={{
          count: 250,
          bounds: { x: -100, y: -100, w: 1200, h: 1000 },
          radius: { min: 0.3, max: 2 },
          speed: { min: 0.3, max: 3 },
          color: 0xffffffff,
          alpha: { min: 15, max: 120 },
          lifetime: { min: 5, max: 12 },
          twinkle: true, twinkleSpeed: 1,
          glow: true, glowRadius: 2, glowIntensity: 20,
          drift: { dx: 0.2, dy: -0.1 },
        }}
      />

      {/* Lens flare accents */}
      <SceneOverlay
        id="flares"
        draw={(ctx: CanvasContext) => {
          for (const s of [
            { x: 150, y: 100, r: 15, c: 0xffffff30 },
            { x: 820, y: 80, r: 20, c: 0xffffff25 },
            { x: 950, y: 600, r: 12, c: 0xffffff20 },
          ]) {
            ctx.glow(s.x, s.y, s.r, s.r * 0.3, s.c, 50)
            ctx.glow(s.x, s.y, s.r * 0.3, s.r, s.c, 50)
            ctx.circle(s.x, s.y, 2, { fill: 0xffffffc0 })
          }
        }}
      />

      {/* Edges */}
      <For each={edges}>
        {(e) => (
          <SceneEdge
            id={e.id}
            from={getPos(e.from)}
            to={getPos(e.to)}
            color={e.color}
            glow
          />
        )}
      </For>

      {/* Nodes */}
      <For each={nodes}>
        {(n) => (
          <SceneNode
            id={n.id}
            x={() => positions()[n.id]?.x ?? n.x}
            y={() => positions()[n.id]?.y ?? n.y}
            radius={n.radius}
            shape={shapeFromSides(n.sides)}
            fill={n.fillColor}
            stroke={n.strokeColor}
            glow={{ color: n.glowColor, radius: 25, intensity: 50 }}
            selected={() => selected() === n.id}
            label={n.label}
            sublabel={n.subtitle}
            statusDot={n.status === "active" ? { color: T.green, glow: true } : undefined}
            onSelect={() => { setSelected(n.id); markDirty() }}
            onDrag={(x, y) => {
              setPositions(prev => ({ ...prev, [n.id]: { x, y } }))
              markDirty()
            }}
          />
        )}
      </For>

      {/* Tooltip on selected node */}
      <SceneOverlay
        id="tooltip"
        draw={(ctx: CanvasContext) => {
          const sel = selected()
          const pos = positions()[sel]
          const node = nodes.find(n => n.id === sel)
          if (!node || !pos) return
          const tw = 200, th = 32
          const tx = pos.x - tw / 2, ty = pos.y + node.radius + 15
          ctx.rect(tx + 2, ty + 2, tw, th, { fill: 0x00000040, radius: 6 })
          ctx.rect(tx, ty, tw, th, { fill: 0x1a1a30ee, radius: 6, stroke: 0xffffff15, strokeWidth: 1 })
          ctx.text(tx + 10, ty + 4, `Task: ${node.label}`, T.textPrimary)
          ctx.text(tx + 10, ty + 18, `Type: compute`, T.textMuted)
        }}
      />
    </SceneCanvas>
  )
}

// ── Panel helpers ──

function PanelHeader(props: { title: string; actions?: string }) {
  return (
    <box direction="row" alignY="center" width="grow">
      <box width="grow">
        <text color={T.textPrimary} fontSize={14}>{props.title}</text>
      </box>
      {props.actions ? <text color={T.textDim} fontSize={12}>{props.actions}</text> : null}
    </box>
  )
}

function SearchBar() {
  return (
    <box backgroundColor={T.surfaceBg} cornerRadius={radius.md} padding={space[2]}
      paddingX={space[3]} borderColor={T.border} borderWidth={1}>
      <text color={T.textDim} fontSize={11}>Search memory...</text>
    </box>
  )
}

function TabBar(props: { tabs: { label: string; count?: number; active?: boolean }[] }) {
  return (
    <box direction="row" gap={space[1]}>
      {props.tabs.map(tab => (
        <box padding={space[1]} paddingX={space[2]}
          backgroundColor={tab.active ? T.activeBg : 0x00000000}
          cornerRadius={radius.sm}
          borderColor={tab.active ? 0x2a6fff44 : 0x00000000}
          borderWidth={tab.active ? 1 : 0}>
          <text color={tab.active ? T.textPrimary : T.textSecondary} fontSize={11}>
            {tab.label}{tab.count !== undefined ? ` ${tab.count}` : ""}
          </text>
        </box>
      ))}
    </box>
  )
}

function Separator() {
  return <box width="grow" height={1} backgroundColor={T.border} />
}

function StatusDot(props: { color: number; size?: number }) {
  const s = props.size ?? 8
  return <box width={s} height={s} backgroundColor={props.color} cornerRadius={radius.full} />
}

// ── Memory Panel ──

function MemoryPanel(props: { mouseX: () => number; mouseY: () => number }) {
  const drag = useDraggablePanel(20, 50)
  const items = [
    { icon: "S", label: "compute_shader_pipeline", desc: "struct - v_engine.zig:102", iconBg: 0x2a1a0aff, iconColor: T.orange },
    { icon: "V", label: "vertex_buffer", desc: "buffer - graphics.zig:44", iconBg: 0x0a1a1aff, iconColor: T.cyan },
    { icon: "M", label: "camera_matrix", desc: "mat4 - camera.zig:88", iconBg: 0x151020ff, iconColor: T.purple },
    { icon: "C", label: "lightcode_core", desc: "module - core.zig:1", iconBg: 0x0a1a0aff, iconColor: T.green },
  ]

  // Subtle perspective tilt — panel leans slightly right, reacts to mouse
  const tiltY = () => 2 + (props.mouseX() - 500) * 0.002
  const tiltX = () => -0.5 + (props.mouseY() - 400) * 0.001

  return (
    <box {...drag.dragProps} floating="root" floatOffset={{ x: drag.offsetX(), y: drag.offsetY() }} zIndex={10} width={270}
      transform={{ perspective: 800, rotateY: tiltY(), rotateX: tiltX() }}
      backgroundColor={T.panelBg} backdropBlur={T.blur} cornerRadius={T.panelRadius}
      padding={space[4]} direction="column" gap={space[3]}
      borderColor={T.borderLight} borderWidth={1}
      shadow={[
        { x: 0, y: 4, blur: 16, color: 0x00000040 },
        { x: 0, y: 16, blur: 48, color: 0x00000030 },
      ]}>
      <PanelHeader title="Memory Panel" actions="+ =" />
      <SearchBar />
      <TabBar tabs={[
        { label: "All", active: true },
        { label: "Facts", count: 12 },
        { label: "Symbols", count: 28 },
        { label: "Decisions", count: 7 },
      ]} />
      <Separator />
      {items.map((item) => (
        <box direction="row" gap={space[3]} alignY="center" padding={space[2]}
          cornerRadius={radius.md} hoverStyle={{ backgroundColor: T.hoverBg }}>
          <box width={32} height={32} backgroundColor={item.iconBg}
            cornerRadius={radius.full} alignX="center" alignY="center"
            borderColor={T.border} borderWidth={1}>
            <text color={item.iconColor} fontSize={13}>{item.icon}</text>
          </box>
          <box direction="column" gap={2} width="grow">
            <text color={T.textPrimary} fontSize={12}>{item.label}</text>
            <text color={T.textMuted} fontSize={10}>{item.desc}</text>
          </box>
          <StatusDot color={T.orange} size={6} />
        </box>
      ))}
    </box>
  )
}

// ── Agents Panel ──

function AgentsPanel(props: { mouseX: () => number; mouseY: () => number }) {
  const drag = useDraggablePanel(-20, -70)
  const agents = [
    { name: "coder-01", status: "Working...", statusColor: T.green, avatarBg: 0x0a200aff, avatarIcon: "C", task: "Refactoring compute_shader_pipeline", progress: 60, progressColor: T.orange },
    { name: "analyzer-02", status: "Idle", statusColor: T.textDim, avatarBg: 0x10101aff, avatarIcon: "A", task: "Detected 3 optimizations", action: "Review" },
    { name: "doc-writer", status: "Idle", statusColor: T.blue, avatarBg: 0x0a1020ff, avatarIcon: "D", task: "Ready" },
  ]

  // Mirrored tilt — panel leans left (opposite of Memory), reacts to mouse
  const tiltY = () => -2 + (props.mouseX() - 500) * 0.002
  const tiltX = () => 1 + (props.mouseY() - 400) * 0.001

  return (
    <box {...drag.dragProps} floating="root" floatOffset={{ x: drag.offsetX(), y: drag.offsetY() }} floatAttach={{ element: 7, parent: 7 }}
      zIndex={10} width={280}
      transform={{ perspective: 800, rotateY: tiltY(), rotateX: tiltX() }}
      backgroundColor={T.panelBg} backdropBlur={T.blur}
      cornerRadius={T.panelRadius} padding={space[4]} direction="column" gap={space[3]}
      borderColor={T.borderLight} borderWidth={1}
      shadow={[
        { x: 0, y: 4, blur: 16, color: 0x00000040 },
        { x: 0, y: 16, blur: 48, color: 0x00000030 },
      ]}>
      <PanelHeader title="Agents Panel" actions="+" />
      <Separator />
      {agents.map((agent) => (
        <box direction="column" gap={space[2]} padding={space[3]}
          cornerRadius={T.cardRadius} backgroundColor={0xffffff06}
          borderColor={T.border} borderWidth={1}>
          <box direction="row" alignY="center" gap={space[2]} width="grow">
            <box width={28} height={28} backgroundColor={agent.avatarBg}
              cornerRadius={radius.full} alignX="center" alignY="center"
              borderColor={T.border} borderWidth={1}>
              <text color={agent.statusColor} fontSize={12}>{agent.avatarIcon}</text>
            </box>
            <box direction="column" gap={1} width="grow">
              <text color={T.textPrimary} fontSize={12}>{agent.name}</text>
              <box direction="row" gap={space[1]} alignY="center">
                <StatusDot color={agent.statusColor} size={6} />
                <text color={T.textSecondary} fontSize={10}>{agent.status}</text>
              </box>
            </box>
          </box>
          <text color={T.textMuted} fontSize={10}>{agent.task}</text>
          {agent.progress !== undefined ? (
            <box width="grow" height={4} backgroundColor={0xffffff0a} cornerRadius={radius.full}>
              <box width={`${agent.progress}%`} height={4} backgroundColor={agent.progressColor}
                cornerRadius={radius.full} />
            </box>
          ) : null}
          {agent.action ? (
            <box direction="row" alignX="right">
              <box padding={space[1]} paddingX={space[2]} backgroundColor={0x22c55e18}
                cornerRadius={radius.sm} borderColor={0x22c55e30} borderWidth={1}>
                <text color={T.green} fontSize={10}>{agent.action}</text>
              </box>
            </box>
          ) : null}
        </box>
      ))}
    </box>
  )
}

// ── Run Console ──

function BuildConsole(props: { mouseX: () => number; mouseY: () => number }) {
  const drag = useDraggablePanel(20, -70)

  // Slight forward lean — like the Diff panel in the mock
  const tiltY = () => -1.5 + (props.mouseX() - 500) * 0.002
  const tiltX = () => -1 + (props.mouseY() - 400) * 0.001

  return (
    <box {...drag.dragProps} floating="root" floatOffset={{ x: drag.offsetX(), y: drag.offsetY() }} floatAttach={{ element: 6, parent: 6 }}
      zIndex={10} width={320}
      transform={{ perspective: 800, rotateY: tiltY(), rotateX: tiltX() }}
      backgroundColor={T.panelBg} backdropBlur={T.blur}
      cornerRadius={T.panelRadius} padding={space[4]} direction="column" gap={space[3]}
      borderColor={T.borderLight} borderWidth={1}
      shadow={[
        { x: 0, y: 4, blur: 16, color: 0x00000040 },
        { x: 0, y: 16, blur: 48, color: 0x00000030 },
      ]}>
      <PanelHeader title="Run Console" actions="*" />
      <Separator />
      <box direction="row" alignY="center" gap={space[2]} padding={space[2]}
        backgroundColor={0xffffff06} cornerRadius={radius.md}>
        <StatusDot color={T.green} />
        <text color={T.textPrimary} fontSize={12}>build & test</text>
        <box width="grow" />
        <text color={T.textSecondary} fontSize={10}>2.4s</text>
      </box>
      <box direction="column" gap={space[1]} paddingLeft={space[2]}>
        <box direction="row" gap={space[2]}><text color={T.textDim} fontSize={10}>16</text><text color={T.textMuted} fontSize={10}>12:40:22 Compiling v_engine.zig ...</text></box>
        <box direction="row" gap={space[2]}><text color={T.textDim} fontSize={10}>16</text><text color={T.textMuted} fontSize={10}>12:40:23 Linking modules ...</text></box>
        <box direction="row" gap={space[2]}><text color={T.textDim} fontSize={10}>t</text><text color={T.textMuted} fontSize={10}>12:40:24 Running tests ...</text></box>
      </box>
      <box direction="column" gap={space[1]} paddingLeft={space[4]}>
        <box direction="row" gap={space[2]} alignY="center"><text color={T.green} fontSize={10}>v</text><text color={T.textSecondary} fontSize={10}>test: shader_pipeline</text><box width="grow" /><text color={T.textMuted} fontSize={10}>0.12s</text></box>
        <box direction="row" gap={space[2]} alignY="center"><text color={T.green} fontSize={10}>v</text><text color={T.textSecondary} fontSize={10}>test: camera_matrix</text><box width="grow" /><text color={T.textMuted} fontSize={10}>0.08s</text></box>
        <box direction="row" gap={space[2]} alignY="center"><text color={T.green} fontSize={10}>v</text><text color={T.textSecondary} fontSize={10}>test: memory_integration</text><box width="grow" /><text color={T.textMuted} fontSize={10}>0.21s</text></box>
      </box>
      <Separator />
      <text color={T.green} fontSize={12}>All tests passed</text>
    </box>
  )
}

// ── Sidebar ──

function Sidebar() {
  const menuItems = [
    { label: "Explorer", icon: ">" }, { label: "Memory", icon: "M" },
    { label: "Agents", icon: "A" }, { label: "Runs", icon: "R" }, { label: "Search", icon: "?" },
  ]
  const files = [
    { name: "v_engine.zig", active: true }, { name: "pipeline.zig", active: false },
    { name: "renderer.zig", active: false }, { name: "memory.zig", active: false },
    { name: "camera.zig", active: false },
  ]
  const pinned = ["compute_shader_pipeline", "vertex_buffer", "camera_matrix", "lightcode_core"]

  return (
    <box floating="root" floatOffset={{ x: 0, y: 30 }} zIndex={9}
      width={170} height="grow" backgroundColor={0x0d0d1cee} backdropBlur={10}
      direction="column" gap={space[1]} borderColor={T.border} borderRight={1}
      paddingTop={space[3]} paddingBottom={space[2]}>
      <box paddingX={space[3]} paddingBottom={space[2]}><text color={T.textPrimary} fontSize={13}>Workspace</text></box>
      {menuItems.map(item => (
        <box direction="row" gap={space[2]} alignY="center" paddingX={space[3]} paddingY={space[1]}
          hoverStyle={{ backgroundColor: T.hoverBg }}>
          <text color={T.textDim} fontSize={11}>{item.icon}</text>
          <text color={T.textSecondary} fontSize={11}>{item.label}</text>
        </box>
      ))}
      <box paddingX={space[3]} paddingTop={space[3]}><text color={T.textMuted} fontSize={10}>Active Session</text></box>
      {files.map(f => (
        <box direction="row" gap={space[2]} alignY="center" paddingX={space[3]} paddingY={space[1]}
          backgroundColor={f.active ? 0x2a6fff22 : 0x00000000} hoverStyle={{ backgroundColor: T.hoverBg }}>
          <text color={T.textDim} fontSize={10}>o</text>
          <text color={f.active ? T.textPrimary : T.textSecondary} fontSize={11}>{f.name}</text>
        </box>
      ))}
      <box paddingX={space[3]} paddingTop={space[3]}><text color={T.textMuted} fontSize={10}>Pinned</text></box>
      {pinned.map(name => (
        <box direction="row" gap={space[2]} alignY="center" paddingX={space[3]} paddingY={space[1]}
          hoverStyle={{ backgroundColor: T.hoverBg }}>
          <text color={T.textDim} fontSize={10}>*</text>
          <text color={T.textSecondary} fontSize={11}>{name}</text>
        </box>
      ))}
    </box>
  )
}

// ── Top Bar ──

function TopBar() {
  return (
    <box floating="root" floatOffset={{ x: 0, y: 0 }} zIndex={11}
      width="100%" height={28} backgroundColor={0x0a0a18ee}
      direction="row" alignY="center" paddingX={space[3]} gap={space[4]}
      borderColor={T.border} borderBottom={1}>
      <box direction="row" gap={space[1]}>
        <box width={10} height={10} backgroundColor={0xef4444ff} cornerRadius={radius.full} />
        <box width={10} height={10} backgroundColor={0xf59e0bff} cornerRadius={radius.full} />
        <box width={10} height={10} backgroundColor={0x22c55eff} cornerRadius={radius.full} />
      </box>
      <text color={T.textPrimary} fontSize={12}>Lightcodev2</text>
      <text color={T.textDim} fontSize={11}>|</text>
      <text color={T.textSecondary} fontSize={11}>Spatial Workbench</text>
      <box width="grow" />
      <box direction="row" gap={space[2]} padding={space[1]} paddingX={space[3]}
        backgroundColor={0xffffff0a} cornerRadius={radius.full}>
        <text color={T.textSecondary} fontSize={10}>Orbit</text>
        <text color={T.textDim} fontSize={10}>|</text>
        <text color={T.textMuted} fontSize={10}>Pan</text>
        <text color={T.textDim} fontSize={10}>|</text>
        <text color={T.textMuted} fontSize={10}>Zoom</text>
      </box>
      <box width="grow" />
      <text color={T.textMuted} fontSize={10}>Press q to exit</text>
    </box>
  )
}

// ── Status Bar ──

function StatusBar() {
  return (
    <box floating="root" floatOffset={{ x: 0, y: 0 }} floatAttach={{ element: 6, parent: 6 }}
      zIndex={11} width="100%" height={26} backgroundColor={0x0a0a18ee}
      direction="row" alignY="center" paddingX={space[3]} gap={space[4]}
      borderColor={T.border} borderTop={1}>
      <box direction="row" gap={space[1]} alignY="center">
        <StatusDot color={T.green} size={7} />
        <text color={T.textSecondary} fontSize={11}>All systems nominal</text>
      </box>
      <box width="grow" />
      <text color={T.textDim} fontSize={10}>Ln 107, Col 23</text>
      <text color={T.textDim} fontSize={10}>|</text>
      <text color={T.textMuted} fontSize={10}>Zig</text>
      <text color={T.textDim} fontSize={10}>|</text>
      <text color={T.textMuted} fontSize={10}>UTF-8</text>
    </box>
  )
}

// ── App ──

function App() {
  const [mouseX, setMouseX] = createSignal(500)
  const [mouseY, setMouseY] = createSignal(400)

  return (
    <box width="100%" height="100%" backgroundColor={T.bg}
      onMouseMove={(evt: NodeMouseEvent) => { setMouseX(evt.x); setMouseY(evt.y) }}>
      <NodeGraph mouseX={mouseX} mouseY={mouseY} />
      <TopBar />
      <Sidebar />
      <MemoryPanel mouseX={mouseX} mouseY={mouseY} />
      <AgentsPanel mouseX={mouseX} mouseY={mouseY} />
      <BuildConsole mouseX={mouseX} mouseY={mouseY} />
      <StatusBar />
    </box>
  )
}

// ── Main ──

async function main() {
  await loadNebula()
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term)

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => { console.error(err); process.exit(1) })
