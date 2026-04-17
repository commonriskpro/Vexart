/**
 * Lightcode App — full interactive shell.
 *
 * Architecture:
 *   WindowManager  → position/size/status/z-order (from @tge/windowing)
 *   WindowRegistry → kind→renderer mapping + content state
 *   GraphState     → node positions + viewport (reactive signals)
 *   Persistence    → debounced JSON to ./lightcode-layout.json
 *
 * Run:
 *   bun --conditions=browser run examples/lightcode-app.tsx
 */

process.env.LIGHTCODE_CANVAS_BACKEND = process.env.LIGHTCODE_CANVAS_BACKEND ?? "wgpu"

import { appendFileSync } from "node:fs"
import { For } from "solid-js"
import {
  mount,
  useTerminalDimensions,
  createTerminal,
} from "@tge/renderer-solid"
import type { Terminal } from "@tge/renderer-solid"

const LOG = "/tmp/lightcode-app.log"
function log(msg: string) {
  try { appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}
import {
  createWindowManager,
  Desktop,
  WindowHost,
  WindowControls,
  type WindowDescriptor,
  type WindowFrameHeaderRenderContext,
} from "@tge/windowing"
import { setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"
import { SceneCanvas, SceneEdge, SceneNode, createSpaceBackground } from "@tge/components"
import type { CanvasContext } from "@tge/renderer-solid"
import {
  createWindowRegistry,
  createGraphState,
  createLayoutPersistence,
  codeEditorKind,
  diffViewerKind,
  memoryPanelKind,
  agentPanelKind,
  colors,
  space,
  radius,
  AppBar,
  Rule,
} from "@tge/lightcode"
import type {
  GraphNodeDef,
  GraphEdgeDef,
  PersistedLayout,
} from "@tge/lightcode"

// ── Graph definition (structural data — not reactive) ──

const NODES: GraphNodeDef[] = [
  { id: "central",     x: 580, y: 360, label: "v_engine.zig",     shape: "diamond", fill: 0x3a1a0aff, stroke: 0xf3a040ff, glow: { color: 0xf3a04090, radius: 55, intensity: 85 } },
  { id: "lightengine", x: 340, y: 140, label: "LightEngine.zig",  shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
  { id: "verlee",      x: 260, y: 240, label: "Verlee Buffer",    shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
  { id: "dispatch",    x: 240, y: 360, label: "Dispatch Pointer", shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
  { id: "vertex",      x: 160, y: 460, label: "Vertex Buffer",    shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
  { id: "camera",      x: 380, y: 520, label: "Camera Forms",     shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
  { id: "femgas",      x: 520, y: 530, label: "6 femgas",         shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
  { id: "runner",      x: 600, y: 630, label: "Runner",           shape: "hexagon", fill: 0x1a1a2aff, stroke: 0x8888aaff },
]

const EDGES: GraphEdgeDef[] = [
  { id: "e1", from: "lightengine", to: "central", color: 0xffffff28, glow: true },
  { id: "e2", from: "verlee",      to: "central", color: 0xffffff20, glow: true },
  { id: "e3", from: "dispatch",    to: "central", color: 0xffffff20, glow: true },
  { id: "e4", from: "vertex",      to: "central", color: 0xffffff18, glow: true },
  { id: "e5", from: "camera",      to: "central", color: 0xffffff18, glow: true },
  { id: "e6", from: "femgas",      to: "central", color: 0xffffff18, glow: true },
  { id: "e7", from: "runner",      to: "central", color: 0xffffff18, glow: true },
]



// ── Custom window header using Lightcode design tokens ──

function LightcodeHeader(props: {
  win: WindowDescriptor
  ctx: WindowFrameHeaderRenderContext
}) {
  return (
    <box
      width="grow"
      direction="row"
      alignY="center"
      gap={space[1]}
      paddingX={space[2]}
      height={26}
      onMouseDown={props.ctx.dragHandleProps?.onMouseDown}
      onMouseMove={props.ctx.dragHandleProps?.onMouseMove}
      onMouseUp={props.ctx.dragHandleProps?.onMouseUp}
    >
      <text color={colors.textDim} fontSize={9}>≡</text>
      <text color={colors.textSoft} fontSize={10}>{props.win.title}</text>
      <box width="grow" />
      <WindowControls windowId={props.win.id} buttonSize={16} gap={4} />
    </box>
  )
}

// ── App component ──

function App(props: {
  term: Terminal
  manager: ReturnType<typeof createWindowManager>
  registry: ReturnType<typeof createWindowRegistry>
  graph: ReturnType<typeof createGraphState>
  spaceBg: ReturnType<typeof createSpaceBackground>
}) {
  const dims = useTerminalDimensions(props.term)

  function drawBackground(ctx: CanvasContext) {
    props.spaceBg.draw(ctx, { x: 0, y: 0, w: dims.width(), h: dims.height() })
  }

  return (
    <Desktop
      manager={props.manager}
      width={dims.width()}
      height={dims.height()}
      renderWindow={(win) => (
        <WindowHost
          windowId={win.id}
          activeBackgroundColor={0x13151cee}
          inactiveBackgroundColor={0x0f111ae8}
          activeBorderColor={colors.panelBorder}
          inactiveBorderColor={0xffffff0c}
          activeShadow={[
            { x: 0, y: 12, blur: 28, color: 0x00000060 },
            { x: 0, y: 0,  blur: 0,  color: 0xf3a04008 },
          ]}
          cornerRadius={radius.md}
          contentPadding={space[2]}
          gap={0}
          renderHeader={(w, ctx) => <LightcodeHeader win={w} ctx={ctx} />}
          renderContent={() => props.registry.renderWindow(win.id)}
        />
      )}
    >
      {/* Graph fills the entire background */}
      <SceneCanvas
        background={drawBackground}
        width="grow"
        height="grow"
        viewport={props.graph.viewport()}
        onViewportChange={vp => props.graph.setViewport(vp)}
        interactive
      >
        <For each={props.graph.edges}>{(edge) => (
          <SceneEdge
            id={edge.id}
            from={props.graph.edgeFrom(edge.id)}
            to={props.graph.edgeTo(edge.id)}
            color={edge.color ?? 0xffffff22}
            glow={edge.glow}
            curvature={0.08}
          />
        )}</For>
        <For each={props.graph.nodes}>{(node) => (
          <SceneNode
            id={node.id}
            x={props.graph.nodeX(node.id)}
            y={props.graph.nodeY(node.id)}
            radius={node.id === "central" ? 36 : 22}
            shape={node.shape ?? "hexagon"}
            fill={node.fill ?? 0x1a1a2aff}
            stroke={node.stroke ?? 0x8888aaff}
            strokeWidth={node.id === "central" ? 3 : 1}
            glow={node.glow}
            label={node.label}
            onDrag={(x, y) => props.graph.moveNode(node.id, x, y)}
          />
        )}</For>
      </SceneCanvas>

      {/* Status bar pinned to bottom */}
      <AppBar
        x={0}
        y={dims.height() - 26}
        width={dims.width()}
        height={26}
        zIndex={50}
        paddingX={space[3]}
        gap={space[2]}
      >
        <text color={colors.warm} fontSize={9}>⚡</text>
        <text color={colors.textDim} fontSize={9}>L1 C1</text>
        <Rule />
        <text color={colors.textSoft} fontSize={9}>Zig</text>
        <Rule />
        <text color={colors.textSoft} fontSize={9}>Lightcode v2.0</text>
        <box width="grow" />
        <text color={colors.textDim} fontSize={9}>Lightcode v2.0 ▼</text>
      </AppBar>
    </Desktop>
  )
}

// ── Main (async boot) ──

async function main() {
  log("--- lightcode-app boot ---")

  // Terminal
  const term = await createTerminal()
  log(`terminal: kitty=${term.caps.kittyGraphics} mode=${term.caps.transmissionMode}`)

  // Canvas backend
  const wgpuBackend = tryCreateWgpuCanvasPainterBackend()
  if (wgpuBackend) setCanvasPainterBackend(wgpuBackend)
  log(`canvas backend: ${wgpuBackend ? "wgpu" : "cpu"}`)

  // Window system
  const manager = createWindowManager()
  const registry = createWindowRegistry(manager)

  registry.register(codeEditorKind)
  registry.register(diffViewerKind)
  registry.register(memoryPanelKind)
  registry.register(agentPanelKind)

  // Persistence
  const persistence = createLayoutPersistence("./lightcode-layout.json")

  // Graph state — onChange triggers a debounced save
  const graph = createGraphState(NODES, EDGES, save)

  function buildLayout(): PersistedLayout {
    const state = manager.getState()
    return {
      version: 1,
      windows: state.order
        .map(id => {
          const win = state.windowsById[id]
          if (!win) return null
          return {
            id: win.id,
            kind: win.kind,
            bounds: win.bounds,
            status: win.status,
            zIndex: win.zIndex,
            contentState: registry.getContentState(win.id),
          }
        })
        .filter((w): w is NonNullable<typeof w> => w !== null),
      order: state.order,
      focusedId: state.focusedWindowId,
      graph: graph.snapshot(),
    }
  }

  function save() {
    persistence.save(buildLayout())
  }

  // Subscribe manager: save on any window state change
  manager.subscribe(save)

  // Restore or open defaults
  const saved = await persistence.load()

  if (saved) {
    registry.restore(saved.windows, saved.order, saved.focusedId)
    graph.restore(saved.graph)
  } else {
    registry.open("diff-viewer", {
      filename: "LightEngine.zig",
      diff: `--- a/LightEngine.zig\n+++ b/LightEngine.zig\n@@ -1,4 +1,4 @@\n import lightoopmetre'.\n import lighncoonpute'.\n \n-type: EngineStatement.LightongEmeta.zig\n+type: EngineInstance.LightEngine.zig\n`,
      language: "zig",
    }, { x: 930, y: 122, width: 360, height: 240 })

    registry.open("code-editor", {
      filename: "v_engine.zig",
      content: `func compute_shader_pipeline(engine,\n\n  const compute_shader: _shader) {\n    let color = 1, 0, 0, 1;\n    let colff = 0;\n    let p: 712 = 0;\n\n    if (memory::vertex_buffer)\n      colet = coeff(oto)\n      color = (coeff.x * memory.x), me);\n    }\n    # else if\n      memory::camera_matrix [0, 1];\n    }\n\n    return v_engine\n`,
      language: "zig",
    }, { x: 680, y: 268, width: 520, height: 320 })

    registry.open("memory-panel", {
      title: "Memory",
      entries: [
        { key: "LC_TOKENS",  value: "accentGolden.focusView", warm: true },
        { key: "bufferSize", value: "888:3704" },
        { key: "buffer",     value: "[396]" },
      ],
      references: [
        { kind: "fn",  name: "funcinc_buffer_int(l)",      file: "funth.zig",   line: 19 },
        { kind: "var", name: "buffer_size > burnlib.zig",  file: "burnlib.zig", line: 33 },
      ],
    }, { x: 68, y: 518, width: 280, height: 260 })

    registry.open("agent-panel", {
      agentName: "C",
      status: "running",
      task: "compute_shader_pipeline",
      source: "Suectoss",
      model: "Bubber",
      logs: [
        { level: "info",    message: "F00 batch pointing 12.88_7fe6" },
        { level: "success", message: "Sparter pipeline succeeded by completed." },
      ],
    }, { x: 975, y: 583, width: 320, height: 240 })
  }

  // Space background — after terminal so pixel FFI is warm
  log("creating space background...")
  const spaceBg = createSpaceBackground({
    seed: 0xdead_beef,
    width:  2400,
    height: 1600,
    backgroundColor: 0x04050aff,
    nebula: {
      stops: [
        { color: 0xf3a04010, position: 0.0 },
        { color: 0x7db6ff0c, position: 0.45 },
        { color: 0x00000000, position: 1.0 },
      ],
      noise: { scale: 260, octaves: 5, gain: 50, lacunarity: 200, warp: 55, dust: 0.35 },
      renderScale: 0.4,
    },
    starfield: { count: 380, clusterCount: 5, clusterStars: 50 },
    sparkles: { count: 4, color: 0xfff2d2ff },
    atmosphere: { count: 5, colors: [0xf3a04018, 0x7db6ff14, 0xffffff08] },
  })
  log("space background ready")

  // Flush on clean exit
  process.on("exit", () => { void persistence.flush() })

  log("mounting app...")
  // Mount
  mount(
    () => <App term={term} manager={manager} registry={registry} graph={graph} spaceBg={spaceBg} />,
    term,
    { maxFps: 60 },
  )
  log("mounted")
}

main().catch(e => {
  log(`FATAL: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(1)
})
