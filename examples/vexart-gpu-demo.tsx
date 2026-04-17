/**
 * Vexart GPU Demo - cosmic IDE-style UI with live performance profiling.
 *
 * Estilo: fondo cosmico oscuro, grafo de nodos conectados, paneles flotantes
 * de code / memory / diff / agent, header + footer de IDE.
 * Profiling en pantalla: panel GPU stats con fps, frame ms, layers, strategy.
 *
 * Run:
 *   bun --conditions=browser run examples/vexart-gpu-demo.tsx
 *
 * Profiling log:
 *   VEXART_LOG_PERF=1 bun --conditions=browser run examples/vexart-gpu-demo.tsx
 *   tail -f /tmp/vexart-gpu-demo-perf.log
 *
 * Flags:
 *   VEXART_MAX_FPS=60        - frame cap (default 60)
 *   VEXART_FORCE_REPAINT=1   - force dirty every frame (stress test)
 *   VEXART_LOG_PERF=1        - write perf log to /tmp/vexart-gpu-demo-perf.log
 *   VEXART_EXIT_AFTER_MS=N   - auto-exit after N ms (benchmark mode)
 */

process.env.LIGHTCODE_CANVAS_BACKEND = process.env.LIGHTCODE_CANVAS_BACKEND ?? "wgpu"

import { createSignal, For, onCleanup } from "solid-js"
import { appendFileSync } from "node:fs"
import {
  mount,
  debugState,
  setDebug,
  markDirty,
  probeWgpuCanvasBridge,
} from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { resetKittyTransportStats, getKittyTransportStats } from "@tge/output-kitty"
import { SceneCanvas, SceneEdge, SceneNode, SceneOverlay } from "@tge/components"
import {
  setCanvasPainterBackend,
  tryCreateWgpuCanvasPainterBackend,
} from "@tge/compat-canvas"
import {
  AppBar,
  Chip,
  CodeFrame,
  colors as C,
  drawOverlayCard,
  InspectorRow,
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
import type { CanvasContext } from "@tge/renderer-solid"

// -- Config ------------------------------------------------------------------

const MAX_FPS        = Number(process.env.VEXART_MAX_FPS ?? 60)
const LOG_PERF       = process.env.VEXART_LOG_PERF === "1"
const FORCE_REPAINT  = process.env.VEXART_FORCE_REPAINT === "1"
const EXIT_AFTER_MS  = Number(process.env.VEXART_EXIT_AFTER_MS ?? 0)
const PERF_LOG       = "/tmp/vexart-gpu-demo-perf.log"

// -- Palette -----------------------------------------------------------------

const BG        = 0x050507ff
const FRAME     = 0x0b0c10f8
const BORDER    = 0xffffff12
const WARM      = 0xf3bf6bff
const WARM_DIM  = 0xf3bf6b60
const WARM_GLOW = 0xf3bf6b80
const BLUE      = 0x90a8d0ff
const BLUE_GLOW = 0x90a8d040
const TEXT      = 0xe8e4dbff
const TEXT_SOFT = 0xa8a49cff
const TEXT_DIM  = 0x6b6760ff

// Frame bounds (pixel coords - demo at 1920x1080 scale)
const F = { x: 34, y: 60, w: 1760, h: 840 }

// -- Scene graph data ---------------------------------------------------------

type NodeShape = "diamond" | "hexagon" | "octagon" | number

type NodeMeta = {
  id: string
  label: string
  subtitle?: string
  kind: string
  x: number
  y: number
  radius: number
  shape: NodeShape
  fill: number
  stroke: number
  glow: number
  active?: boolean
}

const SCENE_NODES: NodeMeta[] = [
  // Central active compute node - diamond, gold glow
  { id: "pipeline", label: "gpu_render_backend", subtitle: "GPU / kitty-payload", kind: "compute",
    x: 640, y: 400, radius: 44, shape: "diamond",
    fill: 0x4d2f0cff, stroke: WARM, glow: WARM_GLOW, active: true },

  // Surrounding nodes
  { id: "renderer", label: "renderer-solid", kind: "module",
    x: 720, y: 220, radius: 18, shape: 4,
    fill: 0x202329ff, stroke: 0xece7dd80, glow: 0xffffff12 },

  { id: "runtime", label: "runtime", kind: "module",
    x: 380, y: 320, radius: 20, shape: "hexagon",
    fill: 0x70707842, stroke: 0xd0c7ba90, glow: 0xffffff10 },

  { id: "clay", label: "Clay layout", kind: "layout",
    x: 420, y: 490, radius: 20, shape: "hexagon",
    fill: 0x51556444, stroke: 0xc5c8d690, glow: 0xffffff10 },

  { id: "wgpu", label: "wgpu bridge", kind: "gpu",
    x: 210, y: 580, radius: 24, shape: "hexagon",
    fill: 0x5b657a44, stroke: 0xc8d2e590, glow: BLUE_GLOW },

  { id: "compat", label: "compat-canvas", kind: "compat",
    x: 150, y: 420, radius: 16, shape: 4,
    fill: 0x242730ff, stroke: 0xdce1eb80, glow: 0x90a8d022 },

  { id: "kitty", label: "Kitty output", kind: "output",
    x: 560, y: 660, radius: 20, shape: "hexagon",
    fill: 0x4b474040, stroke: 0xcab69970, glow: 0xf3bf6b16 },

  { id: "gpu-frame", label: "gpu-frame-composer", kind: "composer",
    x: 760, y: 640, radius: 18, shape: "octagon",
    fill: 0x564b3a40, stroke: 0xd2b28770, glow: 0xf3bf6b16 },

  { id: "hub", label: "", kind: "hub",
    x: 980, y: 160, radius: 14, shape: "hexagon",
    fill: 0x8f8f9748, stroke: 0xe8e4db90, glow: 0xffffff10 },
]

const SCENE_EDGES = [
  { id: "e1",  from: "pipeline",  to: "renderer",   color: 0xf3bf6b80 },
  { id: "e2",  from: "pipeline",  to: "clay",        color: 0xf3bf6b60 },
  { id: "e3",  from: "pipeline",  to: "kitty",       color: WARM_DIM },
  { id: "e4",  from: "renderer",  to: "runtime",     color: 0xece7dd40 },
  { id: "e5",  from: "runtime",   to: "clay",        color: 0xece7dd30 },
  { id: "e6",  from: "clay",      to: "wgpu",        color: 0x90a8d040 },
  { id: "e7",  from: "wgpu",      to: "compat",      color: 0x90a8d030 },
  { id: "e8",  from: "kitty",     to: "gpu-frame",   color: 0xece7dd24 },
  { id: "e9",  from: "gpu-frame", to: "pipeline",    color: 0xf3bf6b40 },
  { id: "e10", from: "renderer",  to: "hub",         color: 0xece7dd20 },
  { id: "e11", from: "wgpu",      to: "pipeline",    color: 0x90a8d050 },
]

// -- Perf state (reactive) ----------------------------------------------------

function usePerfStats() {
  const [fps, setFps]       = createSignal(0)
  const [ms, setMs]         = createSignal(0)
  const [layers, setLayers] = createSignal(0)
  const [strategy, setStrategy] = createSignal("-")
  const [txBytes, setTxBytes]   = createSignal(0)
  const [repainted, setRepainted] = createSignal(0)

  const timer = setInterval(() => {
    const kittyStats = getKittyTransportStats()
    setFps(debugState.fps ?? 0)
    setMs(debugState.frameTimeMs ?? 0)
    setLayers(debugState.layerCount ?? 0)
    setStrategy(debugState.rendererStrategy ?? "-")
    setTxBytes(kittyStats.payloadBytes ?? 0)
    setRepainted(debugState.repaintedCount ?? 0)

    if (LOG_PERF) {
      appendFileSync(
        PERF_LOG,
        `fps=${debugState.fps} ms=${debugState.frameTimeMs} ` +
        `layers=${debugState.layerCount} strategy=${debugState.rendererStrategy ?? "none"} ` +
        `output=${debugState.rendererOutput ?? "none"} ` +
        `repainted=${debugState.repaintedCount} cmds=${debugState.commandCount} ` +
        `nodes=${debugState.nodeCount} latency=${debugState.interactionLatencyMs} ` +
        `txPayload=${kittyStats.payloadBytes} txTty=${kittyStats.estimatedTtyBytes} ` +
        `txCalls=${kittyStats.transmitCalls}\n`,
      )
    }
  }, 200)

  onCleanup(() => clearInterval(timer))

  return { fps, ms, layers, strategy, txBytes, repainted }
}

// -- Components ---------------------------------------------------------------

function Shell() {
  return (
    <ShellFrame
      debugName="shell"
      x={F.x} y={F.y} zIndex={1}
      width={F.w} height={F.h}
      backgroundColor={FRAME}
      gradient={{ type: "linear", from: 0x0f1117e8, to: FRAME, angle: 90 }}
      borderColor={BORDER}
      shadow={{ x: 0, y: 14, blur: 28, color: 0x00000030 }}
      pointerPassthrough
    >
      <box width="grow" height="grow" />
    </ShellFrame>
  )
}

function Header() {
  return (
    <box floating="root" floatOffset={{ x: F.x + 20, y: F.y + 16 }} direction="row" gap={space[2]}>
      <SurfaceCard width={32} padded>
        <text color={TEXT_SOFT} fontSize={11}>☰</text>
      </SurfaceCard>
      <AppBar debugName="header" x={F.x + 20 + 32 + space[2]} y={F.y + 16} zIndex={20}
        gap={space[2]} paddingX={space[3]} height={26}>
        <text color={TEXT} fontSize={11}>Vexart</text>
        <text color={TEXT_DIM} fontSize={9}>·</text>
        <text color={TEXT} fontSize={11}>gpu-renderer-backend</text>
        <text color={TEXT_DIM} fontSize={9}>·</text>
        <text color={TEXT_SOFT} fontSize={10}>GPU end-to-end</text>
      </AppBar>
    </box>
  )
}

function Footer() {
  return (
    <AppBar debugName="footer"
      x={F.x + 18} y={F.y + F.h - 24}
      zIndex={20} gap={space[3]} paddingX={space[3]} height={24} width={F.w - 36}>
      <text color={WARM} fontSize={10}>⚡</text>
      <text color={TEXT_SOFT} fontSize={10}>GPU-native</text>
      <text color={TEXT_DIM} fontSize={10}>.</text>
      <text color={TEXT_SOFT} fontSize={10}>kitty-payload</text>
      <text color={TEXT_DIM} fontSize={10}>.</text>
      <text color={TEXT_SOFT} fontSize={10}>wgpu bridge</text>
      <box width="grow" />
      <text color={TEXT_SOFT} fontSize={10}>Vexart Engine v0.1</text>
    </AppBar>
  )
}

function GraphPlane(props: { selectedNode: string; onSelect: (id: string) => void }) {
  const graphNodes = SCENE_NODES.map((n) => ({ ...n, x: n.x, y: n.y }))
  const graph = useDraggableGraph(graphNodes)

  return (
    <box layer floating="root" floatOffset={{ x: F.x, y: F.y }} width={F.w} height={F.h}>
      <SceneCanvas interactive width={F.w} height={F.h} viewport={{ x: 0, y: 0, zoom: 1 }}>
        <For each={SCENE_EDGES}>
          {(edge) => (
            <SceneEdge
              id={edge.id}
              from={graph.getEdgeAnchor(edge.from)}
              to={graph.getEdgeAnchor(edge.to)}
              fromId={edge.from}
              toId={edge.to}
              color={edge.color}
              glow
              glowWidth={5}
            />
          )}
        </For>

        <For each={graphNodes}>
          {(node) => (
            <SceneNode
              id={node.id}
              x={graph.getNodeX(node)}
              y={graph.getNodeY(node)}
              radius={node.radius}
              shape={node.shape}
              fill={node.fill}
              stroke={node.stroke}
              glow={{ color: node.glow, radius: node.active ? 38 : 16, intensity: node.active ? 75 : 22 }}
              selected={() => props.selectedNode === node.id}
              label={node.label}
              sublabel={node.subtitle}
              statusDot={node.active ? { color: WARM, glow: true } : undefined}
              onSelect={() => props.onSelect(node.id)}
              onDrag={(x, y) => graph.moveNode(node.id, x, y)}
            />
          )}
        </For>

        <SceneOverlay
          id="overlay"
          dependsOn={() => [props.selectedNode]}
          bounds={(scene) => {
            const pos = scene.getNodePosition(props.selectedNode)
            if (!pos) return null
            return { x: pos.x - 90, y: pos.y + 72, width: 260, height: 48 }
          }}
          draw={(ctx: CanvasContext, scene) => {
            const pos = scene.getNodePosition(props.selectedNode)
            if (!pos) return
            const node = SCENE_NODES.find((n) => n.id === props.selectedNode)
            if (!node) return
            drawOverlayCard(ctx, pos.x - 90, pos.y + 72, 260, 48,
              `Node: ${node.label || node.id}`,
              `Type: ${node.kind}`)
          }}
        />
      </SceneCanvas>
    </box>
  )
}

// -- Code panel: gpu-renderer-backend internals -------------------------------

function CodePanel() {
  const lines = [
    { n: "1",  head: "fn",    tail: " paint(ctx: PaintContext) -> Result {",    active: false },
    { n: "2",  head: "",      tail: "   const target = getLayerTarget(ctx);",   active: false },
    { n: "4",  head: "if",    tail: " (op.kind === 'text') {",                  active: false },
    { n: "5",  head: "",      tail: "   const atlas = getGlyphAtlas(fontId);",  active: true  },
    { n: "6",  head: "",      tail: "   renderGlyphsLayer(ctx, atlas);",         active: true  },
    { n: "8",  head: "else",  tail: " { failGpuOnly('unsupported glyph'); }",   active: false },
    { n: "10", head: "const", tail: " readback = readbackWgpuRGBA(target);",    active: false },
    { n: "11", head: "return", tail: " { output: 'kitty-payload', data };",     active: false },
  ]

  return (
    <Panel
      title="gpu-renderer-backend.ts"
      subtitle="GPU render pipeline · wgpu target"
      accent={C.warmLine}
      x={840} y={280} width={720} zIndex={14}
      gradient={{ type: "linear", from: C.panel, to: C.panelAlt, angle: 90 }}
      shadow={{ x: 0, y: 12, blur: 18, color: 0x00000026 }}
    >
      <CodeFrame
        title="GPU Render Path"
        chips={["kitty-payload", "glyph-atlas", "wgpu"]}
        activeChip="kitty-payload"
        lines={lines}
        rightMeta="GPU"
        tools={
          <box direction="row" gap={space[1]}>
            <ToolIcon label="◻" />
            <ToolIcon label="▤" active />
            <ToolIcon label="◉" />
          </box>
        }
        footer={
          <PanelFooter separated={false}>
            <text color={TEXT_DIM} fontSize={9}>◈</text>
            <text color={TEXT_SOFT} fontSize={10}>return kitty-payload</text>
            <box width="grow" />
            <Chip label="GPU-native" active />
          </PanelFooter>
        }
      />
    </Panel>
  )
}

// -- Diff panel: renderer contract changes ------------------------------------

function DiffPanel() {
  const lines = [
    "- output: 'raw-layer' | 'skip-present'",
    "+ output: 'kitty-payload' | 'skip-present'",
    "- rawLayer?: { data, width, height }",
    "+ kittyPayload?: { data, width, height }",
    "- buffer: { width, height }  // alias",
    "+ target: { width, height }  // canonical",
  ]
  const tone = (i: number) => {
    if (lines[i].startsWith("-")) return 0x54211a30
    if (lines[i].startsWith("+")) return 0x1a3a2030
    return 0x00000000
  }
  const textColor = (i: number) => {
    if (lines[i].startsWith("-")) return 0xe06c75ff
    if (lines[i].startsWith("+")) return 0x98bb6cff
    return TEXT_SOFT
  }

  return (
    <Panel
      title="Diff / Contract"
      subtitle="renderer-backend.ts"
      accent={C.warmLine}
      x={1246} y={112} width={460} zIndex={13}
      gradient={{ type: "linear", from: C.panel, to: C.panelAlt, angle: 90 }}
      shadow={{ x: 0, y: 12, blur: 18, color: 0x00000024 }}
    >
      <Toolbar>
        <Metric label="changes" value="06" warm />
        <Metric label="file" value="renderer-backend.ts" />
      </Toolbar>
      <SurfaceCard padded justify>
        <text color={WARM} fontSize={11}>renderer-backend.ts</text>
        <text color={TEXT_DIM} fontSize={9}>⌃</text>
      </SurfaceCard>
      <PanelSection gap={2}>
        <For each={lines}>{(line, i) => (
          <box paddingX={space[1]} paddingY={2}
            backgroundColor={tone(i())}
            cornerRadius={radius.sm}>
            <text color={textColor(i())} fontSize={9}>{i() + 1} {line}</text>
          </box>
        )}</For>
      </PanelSection>
      <PanelFooter>
        <text color={TEXT_DIM} fontSize={9}>GPU cleanup · 7 phases done</text>
        <box width="grow" />
        <Chip label="Merged" active />
      </PanelFooter>
    </Panel>
  )
}

// -- Memory panel: compat-canvas modules -------------------------------------

function MemoryPanel() {
  return (
    <Panel
      title="compat-canvas"
      subtitle="Isolated · not in hot path"
      accent={C.warmLine}
      x={52} y={510} width={320} zIndex={12}
      gradient={{ type: "linear", from: C.panel, to: C.panelAlt, angle: 90 }}
      shadow={{ x: 0, y: 12, blur: 18, color: 0x00000024 }}
    >
      <box direction="row" gap={space[1]} width="grow">
        <Chip label="gpu-text-compat" active />
        <Chip label="raster-painter" />
      </box>
      <box direction="row" gap={space[2]} width="grow">
        <Metric label="modules" value="3" warm />
        <Metric label="core refs" value="0" />
      </box>
      <Rule />
      <text color={TEXT_SOFT} fontSize={10}>Moved modules</text>
      <PanelSection gap={space[2]}>
        <SurfaceCard width="grow" padded>
          <text color={TEXT} fontSize={10}>gpu-text-compat.ts</text>
        </SurfaceCard>
        <SurfaceCard width="grow" padded>
          <text color={TEXT} fontSize={10}>wgpu-canvas-backend.ts</text>
        </SurfaceCard>
        <SurfaceCard width="grow" padded>
          <text color={TEXT} fontSize={10}>canvas-raster-painter.ts</text>
        </SurfaceCard>
      </PanelSection>
    </Panel>
  )
}

// -- GPU stats panel (live profiling) -----------------------------------------

function GpuStatsPanel() {
  const perf = usePerfStats()

  return (
    <Panel
      title="GPU Stats"
      subtitle="Live · kitty-payload path"
      accent={C.blueSoft}
      x={1310} y={640} width={390} zIndex={15}
      gradient={{ type: "linear", from: C.panel, to: C.panelAlt, angle: 90 }}
      shadow={{ x: 0, y: 12, blur: 18, color: 0x00000026 }}
    >
      <box direction="row" gap={space[2]} width="grow">
        <Metric label="fps" value={String(perf.fps())} warm />
        <Metric label="frame ms" value={perf.ms().toFixed(1)} />
        <Metric label="layers" value={String(perf.layers())} />
      </box>
      <Rule />
      <PanelSection inset padded gap={space[2]}>
        <InspectorRow label="strategy" value={perf.strategy()} tone="cool" />
        <InspectorRow label="repainted" value={String(perf.repainted())} />
        <InspectorRow label="tx bytes" value={`${(perf.txBytes() / 1024).toFixed(1)} KB`} />
      </PanelSection>
      <PanelFooter>
        <text color={TEXT_DIM} fontSize={9}>~ 200ms poll</text>
        <box width="grow" />
        <Chip label="GPU" active />
      </PanelFooter>
    </Panel>
  )
}

// -- Agent panel --------------------------------------------------------------

function AgentPanel() {
  const rows: Array<[string, string]> = [
    ["Status",   "Running"],
    ["Backend",  "wgpu"],
    ["Contract", "kitty-payload"],
    ["Phases",   "7 / 7 done"],
  ]

  return (
    <Panel
      title="Agent · GPU Cleanup"
      subtitle="Task · gpu-e2e-execution-plan"
      accent={C.blueSoft}
      x={1310} y={112} width={390} zIndex={12}
      gradient={{ type: "linear", from: C.panel, to: C.panelAlt, angle: 90 }}
      shadow={{ x: 0, y: 12, blur: 18, color: 0x00000024 }}
    >
      <box direction="row" gap={space[2]}>
        <Metric label="status" value="done" warm />
        <Metric label="exit criteria" value="8/8" />
      </box>
      <PanelSection inset padded gap={space[2]}>
        <For each={rows}>{(row, i) => (
          <InspectorRow label={row[0]} value={row[1]} tone={i() === 0 ? "cool" : undefined} />
        )}</For>
      </PanelSection>
      <PanelFooter>
        <SurfaceCard padded>
          <text color={TEXT_DIM} fontSize={9}>·</text>
          <text color={TEXT_DIM} fontSize={9}>Sparse pipeline completed</text>
        </SurfaceCard>
      </PanelFooter>
    </Panel>
  )
}

// -- App root -----------------------------------------------------------------

function App() {
  const [selected, setSelected] = createSignal("pipeline")

  return (
    <box width="100%" height="100%" backgroundColor={BG}>
      <Shell />
      <GraphPlane selectedNode={selected()} onSelect={setSelected} />
      <Header />
      <Footer />
      <MemoryPanel />
      <DiffPanel />
      <CodePanel />
      <AgentPanel />
      <GpuStatsPanel />
    </box>
  )
}

// -- Entry --------------------------------------------------------------------

async function main() {
  resetKittyTransportStats()

  const term = await createTerminal()
  const bridge = probeWgpuCanvasBridge()
  const backend = bridge.available ? tryCreateWgpuCanvasPainterBackend() : null
  setCanvasPainterBackend(backend)
  setDebug(true)

  if (LOG_PERF) {
    try { appendFileSync(PERF_LOG, `\n--- vexart-gpu-demo perf [${new Date().toISOString()}] ---\n`) } catch {}
  }

  const cleanup = mount(() => <App />, term, {
    maxFps: MAX_FPS,
    experimental: { idleMaxFps: MAX_FPS, forceLayerRepaint: false },
  })

  let repaintTimer: ReturnType<typeof setInterval> | null = null
  let exitTimer: ReturnType<typeof setTimeout> | null = null

  if (FORCE_REPAINT) {
    repaintTimer = setInterval(() => markDirty(), 16)
  }

  if (EXIT_AFTER_MS > 0) {
    exitTimer = setTimeout(() => {
      shutdown()
      process.exit(0)
    }, EXIT_AFTER_MS)
  }

  function shutdown() {
    if (repaintTimer) clearInterval(repaintTimer)
    if (exitTimer) clearTimeout(exitTimer)
    parser.destroy()
    setCanvasPainterBackend(null)
    cleanup.destroy()
    term.destroy()
  }

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      shutdown()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
