/**
 * Lightcode GPU-first mock.
 *
 * New scene designed from zero for the GPU-first renderer budget.
 * It does NOT import the cinematic `examples/lightcode.tsx` scene.
 *
 * Run:
 *   bun --conditions=browser run examples/lightcode-gpu-first.tsx
 */

process.env.LIGHTCODE_CANVAS_BACKEND = process.env.LIGHTCODE_CANVAS_BACKEND ?? "wgpu"
process.env.TGE_RENDERER_BACKEND = process.env.TGE_RENDERER_BACKEND ?? "gpu"

import { createSignal, For, type JSX } from "solid-js"
import { appendFileSync } from "node:fs"
import {
  AppBar,
  Button,
  Chip,
  CodeFrame,
  colors as lightcodeColors,
  drawOverlayCard,
  GraphLegend,
  InspectorRow,
  InlineActions,
  Metric,
  Panel,
  PanelFooter,
  PanelSection,
  radius,
  Rule,
  ShellFrame,
  space,
  SurfaceCard,
  Toolbar,
  ToolIcon,
  useDraggableGraph,
} from "@tge/lightcode"
import type { GraphLegendItemData } from "@tge/lightcode"
import {
  debugState,
  getCanvasPainterBackendName,
  markDirty,
  mount,
  probeWgpuCanvasBridge,
  setDebug,
  setCanvasPainterBackend,
} from "@tge/renderer"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { resetKittyTransportStats, getKittyTransportStats } from "@tge/output"
import { SceneCanvas, SceneNode, SceneEdge, SceneOverlay } from "@tge/components"
import { tryCreateWgpuCanvasPainterBackend } from "../packages/renderer/src/wgpu-canvas-backend"
import type { CanvasContext } from "@tge/renderer"

const DEBUG_LOG = "/tmp/lightcode-gpu-first-debug.log"
const PERF_LOG = "/tmp/lightcode-gpu-first-perf.log"
const EXIT_AFTER_MS = Number(process.env.LIGHTCODE_EXIT_AFTER_MS ?? 0)
const LOG_FPS = process.env.LIGHTCODE_LOG_FPS === "1"
const MAX_FPS = Number(process.env.LIGHTCODE_MAX_FPS ?? 60)
const IDLE_MAX_FPS = Number(process.env.LIGHTCODE_IDLE_MAX_FPS ?? 60)
const FORCE_REPAINT = process.env.LIGHTCODE_FORCE_REPAINT === "1"
const TRACE = process.env.LIGHTCODE_GPU_FIRST_TRACE === "1"
const SHOW_SHELL = process.env.LIGHTCODE_GPU_FIRST_SHOW_SHELL !== "0"
const SHOW_HEADER = process.env.LIGHTCODE_GPU_FIRST_SHOW_HEADER !== "0"
const SHOW_FOOTER = process.env.LIGHTCODE_GPU_FIRST_SHOW_FOOTER !== "0"
const SHOW_SPACE = process.env.LIGHTCODE_GPU_FIRST_SHOW_SPACE !== "0"
const SHOW_GRAPH_BG = process.env.LIGHTCODE_GPU_FIRST_SHOW_GRAPH_BG !== "0"
const SHOW_GRAPH_EDGES = process.env.LIGHTCODE_GPU_FIRST_SHOW_GRAPH_EDGES !== "0"
const SHOW_GRAPH_NODES = process.env.LIGHTCODE_GPU_FIRST_SHOW_GRAPH_NODES !== "0"
const SHOW_GRAPH_OVERLAY = process.env.LIGHTCODE_GPU_FIRST_SHOW_GRAPH_OVERLAY !== "0"
const SHOW_GRAPH_LEGEND = process.env.LIGHTCODE_GPU_FIRST_SHOW_GRAPH_LEGEND !== "0"
const SHOW_MEMORY = process.env.LIGHTCODE_GPU_FIRST_SHOW_MEMORY !== "0"
const SHOW_DIFF = process.env.LIGHTCODE_GPU_FIRST_SHOW_DIFF !== "0"
const SHOW_EDITOR = process.env.LIGHTCODE_GPU_FIRST_SHOW_EDITOR !== "0"
const SHOW_AGENT = process.env.LIGHTCODE_GPU_FIRST_SHOW_AGENT !== "0"
const PANEL_SHADOWS = process.env.LIGHTCODE_GPU_FIRST_PANEL_SHADOWS !== "0"
const PANEL_GRADIENTS = process.env.LIGHTCODE_GPU_FIRST_PANEL_GRADIENTS !== "0"
const NODES_ONLY_HARNESS = !SHOW_SHELL && !SHOW_HEADER && !SHOW_FOOTER && !SHOW_SPACE && !SHOW_GRAPH_BG && !SHOW_GRAPH_EDGES && !SHOW_GRAPH_OVERLAY && !SHOW_GRAPH_LEGEND && !SHOW_MEMORY && !SHOW_DIFF && !SHOW_EDITOR && !SHOW_AGENT

const FRAME = { x: 34, y: 78, w: 1760, h: 826 }

const C = {
  ...lightcodeColors,
  bg: 0x050507ff,
  frame: 0x0b0c10f8,
  frameInner: 0x0f1117e8,
  frameBorder: 0xffffff12,
  panelInner: 0x0c0e13f6,
  warmSoft: 0xf3bf6b2e,
  blue: 0x90a8d0ff,
} 

type PanelId = "memory" | "diff" | "editor" | "agent"

type NodeMeta = {
  id: string
  label: string
  subtitle?: string
  kind: string
  panel: PanelId
  x: number
  y: number
  radius: number
  shape: "diamond" | "hexagon" | "octagon" | number
  fill: number
  stroke: number
  glow: number
  active?: boolean
}

const nodes: NodeMeta[] = [
  { id: "pipeline", label: "compute_shader_pipeline", subtitle: "Task / compute", kind: "compute", panel: "editor", x: 704, y: 430, radius: 42, shape: "diamond", fill: 0x4d2f0cff, stroke: C.warm, glow: 0xf3bf6b82, active: true },
  { id: "lightengine", label: "LightEngine.zig", kind: "engine", panel: "diff", x: 760, y: 250, radius: 18, shape: 4, fill: 0x202329ff, stroke: 0xece7dd80, glow: 0xffffff12 },
  { id: "hub", label: "", kind: "hub", panel: "diff", x: 1118, y: 176, radius: 16, shape: "hexagon", fill: 0x8f8f9748, stroke: 0xe8e4db90, glow: 0xffffff10 },
  { id: "vertex-top", label: "Vertex Buffer", kind: "buffer", panel: "memory", x: 482, y: 356, radius: 22, shape: "hexagon", fill: 0x70707842, stroke: 0xd0c7ba90, glow: 0xffffff10 },
  { id: "dispatch", label: "Dispatch Pointer", kind: "dispatch", panel: "editor", x: 470, y: 516, radius: 20, shape: "hexagon", fill: 0x51556444, stroke: 0xc5c8d690, glow: 0xffffff10 },
  { id: "vertex-left", label: "Vertex Buffer", kind: "buffer", panel: "memory", x: 246, y: 620, radius: 24, shape: "hexagon", fill: 0x5b657a44, stroke: 0xc8d2e590, glow: 0x90a8d024 },
  { id: "lighting", label: "Lighting.zig", kind: "shader", panel: "memory", x: 160, y: 450, radius: 16, shape: 4, fill: 0x242730ff, stroke: 0xdce1eb80, glow: 0x90a8d022 },
  { id: "camera", label: "Camera Flows", kind: "camera", panel: "agent", x: 592, y: 704, radius: 20, shape: "hexagon", fill: 0x4b474040, stroke: 0xcab69970, glow: 0xf3bf6b16 },
  { id: "formats", label: "96 Formats", kind: "format", panel: "agent", x: 772, y: 692, radius: 18, shape: "octagon", fill: 0x564b3a40, stroke: 0xd2b28770, glow: 0xf3bf6b16 },
  { id: "runner", label: "Runner", kind: "runner", panel: "agent", x: 850, y: 826, radius: 14, shape: "hexagon", fill: 0x4e412f40, stroke: 0xc7a46d70, glow: 0xf3bf6b14 },
]

const edges = [
  { id: "e1", from: "pipeline", to: "lightengine", color: 0xf3bf6b80 },
  { id: "e2", from: "pipeline", to: "vertex-top", color: 0xf3bf6b56 },
  { id: "e3", from: "pipeline", to: "dispatch", color: 0xf3bf6b42 },
  { id: "e4", from: "pipeline", to: "vertex-left", color: 0x90a8d044 },
  { id: "e5", from: "pipeline", to: "camera", color: 0xf3bf6b42 },
  { id: "e6", from: "pipeline", to: "formats", color: 0xf3bf6b30 },
  { id: "e7", from: "pipeline", to: "runner", color: 0xf3bf6b26 },
  { id: "e8", from: "lightengine", to: "hub", color: 0xece7dd42 },
  { id: "e9", from: "hub", to: "pipeline", color: 0xf3bf6b52 },
  { id: "e10", from: "lighting", to: "vertex-top", color: 0x90a8d03a },
  { id: "e11", from: "lighting", to: "dispatch", color: 0x90a8d030 },
  { id: "e12", from: "vertex-top", to: "camera", color: 0xece7dd24 },
  { id: "e13", from: "dispatch", to: "camera", color: 0xece7dd22 },
]

const panelNodeMap: Record<PanelId, string> = {
  memory: "vertex-top",
  diff: "lightengine",
  editor: "pipeline",
  agent: "runner",
}

function log(message: string) {
  appendFileSync(DEBUG_LOG, message + "\n")
}

function enabledSurfacesLine() {
  const parts = [
    SHOW_SHELL ? "shell" : null,
    SHOW_HEADER ? "header" : null,
    SHOW_FOOTER ? "footer" : null,
    SHOW_SPACE ? "space" : null,
    SHOW_GRAPH_BG ? "graph-bg" : null,
    SHOW_GRAPH_EDGES ? "graph-edges" : null,
    SHOW_GRAPH_NODES ? "graph-nodes" : null,
    SHOW_GRAPH_OVERLAY ? "graph-overlay" : null,
    SHOW_GRAPH_LEGEND ? "graph-legend" : null,
    SHOW_MEMORY ? "memory" : null,
    SHOW_DIFF ? "diff" : null,
    SHOW_EDITOR ? "editor" : null,
    SHOW_AGENT ? "agent" : null,
    PANEL_SHADOWS ? "panel-shadows" : null,
    PANEL_GRADIENTS ? "panel-gradients" : null,
  ].filter((value): value is string => value !== null)
  return parts.join(",")
}

const graphLegendItems: GraphLegendItemData[] = [
  { glyph: "◆", label: "Compute task", detail: "active pipeline", swatchColor: C.warm, tone: "warm" },
  { glyph: "⬡", label: "Buffer / dispatch", detail: "runtime data", swatchColor: C.blue, tone: "cool" },
  { glyph: "⬢", label: "Agent / format", detail: "product shell", swatchColor: 0xe8e4db90 },
  { glyph: "◻", label: "Source module", detail: "zig file", swatchColor: 0xece7dd80, tone: "muted" },
]

function getNode(id: string) {
  return nodes.find((node) => node.id === id) ?? nodes[0]
}

function drawSpaceBackdrop(ctx: CanvasContext, x: number, y: number, w: number, h: number) {
  ctx.rect(x, y, w, h, { fill: C.bg })
  ctx.linearGradient(x, y, w, h, 0x06080d66, 0x0e111800, 90)
  ctx.nebula(x, y, w, h, [
    { color: 0x04050700, position: 0 },
    { color: 0x12243588, position: 0.34 },
    { color: 0x26485da0, position: 0.6 },
    { color: 0x8b5c38a0, position: 0.82 },
    { color: 0xf3bf6b58, position: 1 },
  ], {
    seed: 1337,
    scale: 168,
    octaves: 5,
    gain: 56,
    lacunarity: 206,
    warp: 50,
    detail: 94,
    dust: 62,
  })
  ctx.starfield(x, y, w, h, {
    seed: 1337 ^ 0x9e3779b9,
    count: 620,
    clusterCount: 8,
    clusterStars: 84,
    warmColor: 0xf3d7a1d6,
    coolColor: 0xc1d7ffd2,
    neutralColor: 0xffffffd0,
  })
  ctx.glow(x + w * 0.16, y + h * 0.22, Math.round(w * 0.16), Math.round(h * 0.12), 0x7db6ff10, 18)
  ctx.glow(x + w * 0.68, y + h * 0.28, Math.round(w * 0.12), Math.round(h * 0.09), 0xf3bf6b14, 22)
  ctx.glow(x + w * 0.52, y + h * 0.68, Math.round(w * 0.14), Math.round(h * 0.1), 0xffffff08, 14)
}

function createPanelTraceHandlers(id: string) {
  let lastTraceAt = 0

  return {
    onDragStart: (_event: unknown, position: { x: number; y: number }) => {
      if (TRACE) log(`[drag-start] panel=${id} x=${position.x} y=${position.y} surfaces=${enabledSurfacesLine()}`)
    },
    onDragMove: (_event: unknown, position: { x: number; y: number }) => {
      if (!TRACE) return
      const now = Date.now()
      if (now - lastTraceAt < 120) return
      lastTraceAt = now
      log(`[drag] panel=${id} x=${position.x} y=${position.y} frameMs=${debugState.frameTimeMs} input=${debugState.interactionType ?? "none"} latency=${debugState.interactionLatencyMs} strategy=${debugState.rendererStrategy ?? "none"} output=${debugState.rendererOutput ?? "none"} dirty=${debugState.dirtyBeforeCount} repainted=${debugState.repaintedCount} moveOnly=${debugState.moveOnlyCount} moveFallback=${debugState.moveFallbackCount} stableReuse=${debugState.stableReuseCount}`)
    },
    onDragEnd: (_event: unknown, position: { x: number; y: number }) => {
      if (!TRACE) return
      log(`[drag-end] panel=${id} x=${position.x} y=${position.y} frameMs=${debugState.frameTimeMs} input=${debugState.interactionType ?? "none"} latency=${debugState.interactionLatencyMs}`)
    },
  }
}

function Shell() {
  return (
    <ShellFrame
      debugName="shell"
      x={FRAME.x}
      y={FRAME.y}
      zIndex={1}
      width={FRAME.w}
      height={FRAME.h}
      backgroundColor={C.frame}
      gradient={PANEL_GRADIENTS ? { type: "linear", from: C.frameInner, to: C.frame, angle: 90 } : undefined}
      borderColor={C.frameBorder}
      shadow={PANEL_SHADOWS ? { x: 0, y: 14, blur: 24, color: 0x00000028 } : undefined}
      pointerPassthrough
    >
      <box width="grow" height="grow" />
    </ShellFrame>
  )
}

function HeaderBar() {
  return (
    <box floating="root" floatOffset={{ x: FRAME.x + 20, y: FRAME.y + 18 }} direction="row" gap={space[2]}>
      <SurfaceCard width={32} padded>
        <text color={C.textSoft} fontSize={11}>☰</text>
      </SurfaceCard>
      <AppBar debugName="header" x={FRAME.x + 20 + 32 + space[2]} y={FRAME.y + 18} zIndex={20} gap={space[2]} paddingX={space[3]} height={26}>
        <text color={C.text} fontSize={11}>Compute Shaders</text>
        <text color={C.textDim} fontSize={9}>⌄</text>
        <text color={C.text} fontSize={11}>v_engine.zig</text>
      </AppBar>
    </box>
  )
}

function FooterBar() {
  return (
    <AppBar debugName="footer" x={FRAME.x + 18} y={FRAME.y + FRAME.h - 24} zIndex={20} gap={space[3]} paddingX={space[3]} height={24} width={FRAME.w - 36}>
      <text color={C.warm} fontSize={10}>⚡</text>
      <text color={C.textSoft} fontSize={10}>L345</text>
      <text color={C.textDim} fontSize={10}>EC15</text>
      <text color={C.textMute} fontSize={10}>|</text>
      <text color={C.textSoft} fontSize={10}>Zig</text>
      <text color={C.textMute} fontSize={10}>|</text>
      <text color={C.textSoft} fontSize={10}>GPU-first</text>
      <box width="grow" />
      <text color={C.textSoft} fontSize={10}>Lightcode v2.0</text>
    </AppBar>
  )
}

function GraphPlane(props: { selectedNode: string; onSelect: (id: string) => void }) {
  const graphNodes = NODES_ONLY_HARNESS ? nodes : nodes.map((node) => ({ ...node, x: node.x - FRAME.x, y: node.y - FRAME.y }))
  const graph = useDraggableGraph(graphNodes)
  const bgSize = { w: NODES_ONLY_HARNESS ? 1860 : FRAME.w, h: NODES_ONLY_HARNESS ? 1160 : FRAME.h }
  const graphWidth = NODES_ONLY_HARNESS ? "100%" : FRAME.w
  const graphHeight = NODES_ONLY_HARNESS ? "100%" : FRAME.h

  return (
    <box floating={NODES_ONLY_HARNESS ? undefined : "root"} floatOffset={NODES_ONLY_HARNESS ? undefined : { x: FRAME.x, y: FRAME.y }} width={graphWidth} height={graphHeight} pointerPassthrough={!NODES_ONLY_HARNESS}>
      <SceneCanvas
        interactive={false}
        width={graphWidth}
        height={graphHeight}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        background={(ctx: CanvasContext) => {
          if (SHOW_GRAPH_BG) {
            ctx.rect(0, 0, FRAME.w, FRAME.h, { fill: 0x090a0d88, stroke: C.frameBorder, strokeWidth: 1 })
            ctx.radialGradient(704 - FRAME.x, 430 - FRAME.y, 500, 0xf3bf6b14, 0x00000000)
            ctx.radialGradient(246 - FRAME.x, 240 - FRAME.y, 260, 0xffffff06, 0x00000000)
            ctx.glow(704 - FRAME.x, 430 - FRAME.y, 148, 148, 0xf3bf6b28, 26)
          }

          if (SHOW_SPACE) {
            drawSpaceBackdrop(
              ctx,
              NODES_ONLY_HARNESS ? 0 : -Math.round((bgSize.w - FRAME.w) * 0.5),
              NODES_ONLY_HARNESS ? 0 : -Math.round((bgSize.h - FRAME.h) * 0.5),
              bgSize.w,
              bgSize.h,
            )
          }
        }}
      >
        <For each={SHOW_GRAPH_EDGES ? edges : []}>
          {(edge) => <SceneEdge id={edge.id} fromId={edge.from} toId={edge.to} from={graph.getEdgeAnchor(edge.from)} to={graph.getEdgeAnchor(edge.to)} color={edge.color} glow />}
        </For>

        <For each={SHOW_GRAPH_NODES ? graphNodes : []}>
          {(node) => (
            <SceneNode
              id={node.id}
              x={graph.getNodeX(node)}
              y={graph.getNodeY(node)}
              radius={node.radius}
              shape={node.shape}
              fill={node.fill}
              stroke={node.stroke}
              glow={{ color: node.glow, radius: node.active ? 36 : 16, intensity: node.active ? 72 : 20 }}
              selected={() => props.selectedNode === node.id}
              label={node.label}
              sublabel={node.subtitle}
              onSelect={() => {
                appendFileSync(DEBUG_LOG, `[graph-select] ${node.id}\n`)
                props.onSelect(node.id)
                markDirty()
              }}
              onDrag={(x, y) => {
                appendFileSync(DEBUG_LOG, `[graph-drag] ${node.id} ${Math.round(x)} ${Math.round(y)}\n`)
                graph.moveNode(node.id, x, y)
              }}
            />
          )}
        </For>

        {SHOW_GRAPH_OVERLAY ? <SceneOverlay
          id="active-task-chip"
          dependsOn={() => [props.selectedNode]}
          bounds={(scene) => {
            const position = scene.getNodePosition(props.selectedNode)
            if (!position) return null
            return { x: position.x - 86, y: position.y + 68, width: 270, height: 50 }
          }}
          draw={(ctx: CanvasContext, scene) => {
            const node = getNode(props.selectedNode)
            const position = scene.getNodePosition(props.selectedNode)
            if (!position) return
            const x = position.x - 86
            const y = position.y + 68
            drawOverlayCard(ctx, x, y, 270, 50, `Task: ${node.label || "active_node"}`, `Type: ${node.kind}`)
          }}
        /> : null}
      </SceneCanvas>
    </box>
  )
}

function GraphLegendPanel() {
  return (
    <Panel title="Graph Legend" subtitle="Node semantics · GPU-first" accent={C.warmLine} x={78} y={124} width={308} zIndex={11} gradient={PANEL_GRADIENTS ? { type: "linear", from: C.panel, to: C.panelAlt, angle: 90 } : undefined} shadow={PANEL_SHADOWS ? { x: 0, y: 12, blur: 18, color: 0x00000024 } : undefined} {...createPanelTraceHandlers("Graph Legend")}>
      <GraphLegend title="Shapes + tones" items={graphLegendItems} />
      <PanelFooter>
        <text color={C.textDim} fontSize={9}>selected graph semantics</text>
        <box width="grow" />
        <Chip label="GPU-first" active />
      </PanelFooter>
    </Panel>
  )
}

function MemoryPanel() {
  return (
    <Panel title="Memory" subtitle="LC_TOKENS · accentGolden.focusView" accent={C.warmLine} x={64} y={560} width={336} zIndex={12} gradient={PANEL_GRADIENTS ? { type: "linear", from: C.panel, to: C.panelAlt, angle: 90 } : undefined} shadow={PANEL_SHADOWS ? { x: 0, y: 12, blur: 18, color: 0x00000024 } : undefined} {...createPanelTraceHandlers("Memory")}>
      <box direction="row" gap={space[1]} width="grow">
        <Chip label="LC_TOKENS" active />
        <Chip label="accentGolden" />
        <Chip label="focusView" />
      </box>
      <box direction="row" gap={space[2]} width="grow">
        <Metric label="bufferSize" value="868:3704" warm />
        <Metric label="buffer" value="[396]" />
      </box>
      <Rule />
      <text color={C.textSoft} fontSize={10}>References</text>
      <PanelSection gap={space[2]}>
        <SurfaceCard width="grow" padded><text color={C.text} fontSize={10}>function_buffer_init()</text></SurfaceCard>
        <SurfaceCard width="grow" padded><text color={C.text} fontSize={10}>buffer.size › builtin.zig</text></SurfaceCard>
      </PanelSection>
    </Panel>
  )
}

function DiffPanel() {
  const lines = [
    "import lightloop_procedural;",
    "import light_compute;",
    "type: EngineDispatcher.LightCompiler",
    "const bindings = buildBindings(ctx)",
  ]

  return (
    <Panel title="Diff / Changes" subtitle="LightEngine.zig" accent={C.warmLine} x={1262} y={124} width={474} zIndex={13} gradient={PANEL_GRADIENTS ? { type: "linear", from: C.panel, to: C.panelAlt, angle: 90 } : undefined} shadow={PANEL_SHADOWS ? { x: 0, y: 12, blur: 18, color: 0x00000024 } : undefined} {...createPanelTraceHandlers("Diff / Changes")}>
      <Toolbar>
        <Metric label="changes" value="04" warm />
        <Metric label="file" value="LightEngine.zig" />
      </Toolbar>
      <SurfaceCard padded justify>
        <text color={C.warm} fontSize={11}>LightEngine.zig</text>
        <text color={C.textDim} fontSize={9}>⌃</text>
      </SurfaceCard>
      <PanelSection gap={space[1]}>
        <For each={lines}>{(line, index) => <box paddingX={index() === 2 ? space[1] : 0} paddingY={2} backgroundColor={index() === 2 ? 0x54211a28 : 0x00000000} borderColor={index() === 2 ? C.activeBorder : 0x00000000} borderWidth={index() === 2 ? 1 : 0} cornerRadius={radius.sm}><text color={index() < 2 ? C.warm : C.textSoft} fontSize={10}>{index() + 1} · {line}</text></box>}</For>
      </PanelSection>
      <PanelFooter>
        <text color={C.textDim} fontSize={9}>staged · ready</text>
        <box width="grow" />
        <Button label="Swap Changes" />
      </PanelFooter>
    </Panel>
  )
}

function EditorPanel() {
  const lines = [
    { n: "1", head: "func", tail: " compute_shader_pipeline(engine, shader) {", active: false },
    { n: "3", head: "const", tail: " compute_shader = shader;", active: false },
    { n: "4", head: "let", tail: " color = { 0, 0, 1 };", active: false },
    { n: "5", head: "let", tail: " coeff = 0;", active: false },
    { n: "7", head: "if", tail: " (memory::vertex_buffer) {", active: true },
    { n: "8", head: "", tail: "   color = coeff[vector];", active: true },
    { n: "9", head: "", tail: "   color = coeff.x * memory.x;", active: false },
    { n: "11", head: "else if", tail: " (memory::camera_matrix[0, 1]) {", active: false },
    { n: "12", head: "", tail: "   return v_engine;", active: false },
  ]

  return (
    <Panel title="v_engine.zig" subtitle="Compute Shader Pipeline" accent={C.warmLine} x={890} y={294} width={742} zIndex={14} gradient={PANEL_GRADIENTS ? { type: "linear", from: C.panel, to: C.panelAlt, angle: 90 } : undefined} shadow={PANEL_SHADOWS ? { x: 0, y: 12, blur: 18, color: 0x00000024 } : undefined} {...createPanelTraceHandlers("v_engine.zig")}>
      <CodeFrame
        title="Compute Shader Pipeline"
        chips={["v_engine.zig", "Compute Shader", "COMPUTE"]}
        activeChip="v_engine.zig"
        lines={lines}
        rightMeta="4D"
        tools={<InlineActions><ToolIcon label="◻" /><ToolIcon label="▤" active /><ToolIcon label="◉" /></InlineActions>}
        footer={<PanelFooter separated={false}><text color={C.textDim} fontSize={9}>◈</text><text color={C.textSoft} fontSize={10}>return  v_engine</text><box width="grow" /><Button label="Swap Changes" /></PanelFooter>}
      />
    </Panel>
  )
}

function AgentPanel() {
  const rows: Array<[string, string]> = [
    ["Status", "Success"],
    ["Compiler", "Runner"],
    ["File batch", "12.68, 7/66"],
    ["Pipeline", "compute_shader_pipeline"],
  ]

  return (
    <Panel title="Agent · Running" subtitle="Task · compute_shader_pipeline" accent={C.blueSoft} x={1322} y={662} width={404} zIndex={12} gradient={PANEL_GRADIENTS ? { type: "linear", from: C.panel, to: C.panelAlt, angle: 90 } : undefined} shadow={PANEL_SHADOWS ? { x: 0, y: 12, blur: 18, color: 0x00000024 } : undefined} {...createPanelTraceHandlers("Agent · Running")}>
      <box direction="row" gap={space[2]}>
        <Metric label="agent" value="running" warm />
        <Metric label="task" value="compute" />
      </box>
      <PanelSection inset padded gap={space[2]}>
        <For each={rows}>{(row, index) => <InspectorRow label={row[0]} value={row[1]} tone={index() === 0 ? "cool" : undefined} />}</For>
      </PanelSection>
      <PanelFooter>
        <SurfaceCard padded>
        <text color={C.textDim} fontSize={9}>⋮</text>
        <text color={C.textDim} fontSize={9}>runner ready</text>
        </SurfaceCard>
      </PanelFooter>
    </Panel>
  )
}

function App() {
  const [selectedNode, setSelectedNode] = createSignal(panelNodeMap.editor)

  return (
    <box width="100%" height="100%" backgroundColor={C.bg}>
      {SHOW_SHELL ? <Shell /> : null}
      <GraphPlane selectedNode={selectedNode()} onSelect={setSelectedNode} />
      {SHOW_GRAPH_LEGEND ? <GraphLegendPanel /> : null}
      {SHOW_HEADER ? <HeaderBar /> : null}
      {SHOW_FOOTER ? <FooterBar /> : null}
      {SHOW_MEMORY ? <MemoryPanel /> : null}
      {SHOW_DIFF ? <DiffPanel /> : null}
      {SHOW_EDITOR ? <EditorPanel /> : null}
      {SHOW_AGENT ? <AgentPanel /> : null}
    </box>
  )
}

async function main() {
  try {
    appendFileSync(DEBUG_LOG, "\n--- lightcode gpu-first run ---\n")
  } catch {}

  resetKittyTransportStats()
  const term = await createTerminal()
  const bridge = probeWgpuCanvasBridge()
  const selectedCanvasBackend = process.env.LIGHTCODE_CANVAS_BACKEND === "cpu"
    ? null
    : bridge.available ? tryCreateWgpuCanvasPainterBackend() : null
  setCanvasPainterBackend(selectedCanvasBackend)

  appendFileSync(DEBUG_LOG, `[main] terminal created kitty=${term.caps.kittyGraphics} mode=${term.caps.transmissionMode}\n`)
  appendFileSync(DEBUG_LOG, `[main] canvasBackend=${getCanvasPainterBackendName()}\n`)
  appendFileSync(DEBUG_LOG, `[main] wgpuBridge available=${bridge.available} path=${bridge.libraryPath ?? "none"} reason=${bridge.reason}\n`)
  appendFileSync(DEBUG_LOG, `[main] surfaces=${enabledSurfacesLine()}\n`)
  appendFileSync(DEBUG_LOG, `[main] trace=${TRACE ? 1 : 0}\n`)
  setDebug(true)

  const cleanup = mount(() => <App />, term, {
    maxFps: MAX_FPS,
    experimental: {
      idleMaxFps: IDLE_MAX_FPS,
      partialUpdates: false,
      forceLayerRepaint: false,
    },
  })

  appendFileSync(DEBUG_LOG, "[main] mounted\n")

  let perfTimer: ReturnType<typeof setInterval> | null = null
  let repaintTimer: ReturnType<typeof setInterval> | null = null
  let exitTimer: ReturnType<typeof setTimeout> | null = null

  if (LOG_FPS) {
    appendFileSync(PERF_LOG, "\n--- lightcode gpu-first perf ---\n")
    perfTimer = setInterval(() => {
      const stats = getKittyTransportStats()
        appendFileSync(
          PERF_LOG,
          `fps=${debugState.fps} ms=${debugState.frameTimeMs} layers=${debugState.layerCount} moveOnly=${debugState.moveOnlyCount} moveFallback=${debugState.moveFallbackCount} stableReuse=${debugState.stableReuseCount} dirtyBefore=${debugState.dirtyBeforeCount} repainted=${debugState.repaintedCount} cmds=${debugState.commandCount} nodes=${debugState.nodeCount} strategy=${debugState.rendererStrategy ?? "none"} output=${debugState.rendererOutput ?? "none"} tx=${debugState.transmissionMode ?? "none"} input=${debugState.interactionType ?? "none"} latency=${debugState.interactionLatencyMs} surfaces=${enabledSurfacesLine()} txPayload=${stats.payloadBytes} txTty=${stats.estimatedTtyBytes} txCalls=${stats.transmitCalls}\n`,
        )
      }, 500)
  }

  if (FORCE_REPAINT) {
    repaintTimer = setInterval(() => markDirty(), 16)
    appendFileSync(DEBUG_LOG, "[main] forced repaint enabled\n")
  }

  if (EXIT_AFTER_MS > 0) {
    exitTimer = setTimeout(() => {
      parser.destroy()
      if (perfTimer) clearInterval(perfTimer)
      if (repaintTimer) clearInterval(repaintTimer)
      setCanvasPainterBackend(null)
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }, EXIT_AFTER_MS)
  }

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      if (perfTimer) clearInterval(perfTimer)
      if (repaintTimer) clearInterval(repaintTimer)
      if (exitTimer) clearTimeout(exitTimer)
      setCanvasPainterBackend(null)
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
  appendFileSync(DEBUG_LOG, "[main] input handler attached\n")
}

main().catch((error) => {
  try {
    appendFileSync(DEBUG_LOG, `[main.catch] ${String(error?.stack || error)}\n`)
  } catch {}
  console.error(error)
  process.exit(1)
})
