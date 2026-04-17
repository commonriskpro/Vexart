/**
 * LightCode cinematic workspace demo.
 *
 * Run: bun --conditions=browser run examples/lightcode.tsx
 */

import { createSignal, For, onCleanup, type JSX } from "solid-js"
import { mount, markDirty, useDrag, setDebug, debugState, debugDumpTree, probeWgpuCanvasBridge, type NodeHandle } from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { getKittyTransportStats, resetKittyTransportStats } from "@tge/output-kitty"
import { createSpaceBackground, type SpaceBackground, SceneCanvas, SceneNode, SceneEdge, SceneOverlay } from "@tge/components"
import { useDraggableGraph } from "@tge/lightcode"
import { createCanvasImageCache, getCanvasPainterBackendName, setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"
import { radius, space } from "@tge/void"
import type { CanvasContext, NodeMouseEvent } from "@tge/renderer-solid"
import { appendFileSync } from "node:fs"

let spaceBg: SpaceBackground | null = null
const graphBgCache = createCanvasImageCache()
const DEBUG_LOG = "/tmp/lightcode-debug.log"
const PERF_LOG = "/tmp/lightcode-perf.log"
const LIGHTCODE_STAGE = Number(process.env.LIGHTCODE_STAGE ?? 5)
const LIGHTCODE_SHOW_HUD = process.env.LIGHTCODE_SHOW_HUD === "1"
const LIGHTCODE_FLOATING_CHROME = process.env.LIGHTCODE_FLOATING_CHROME !== "0"
const LIGHTCODE_CHROME_LAYERED = process.env.LIGHTCODE_CHROME_LAYERED !== "0"
const LIGHTCODE_LOG_FPS = process.env.LIGHTCODE_LOG_FPS === "1"
const LIGHTCODE_FORCE_REPAINT = process.env.LIGHTCODE_FORCE_REPAINT === "1"
const LIGHTCODE_FORCE_LAYER_REPAINT = process.env.LIGHTCODE_FORCE_LAYER_REPAINT === "1"
const LIGHTCODE_DUMP_TREE = process.env.LIGHTCODE_DUMP_TREE === "1"
const LIGHTCODE_LOG_CADENCE = process.env.TGE_DEBUG_CADENCE === "1"
const LIGHTCODE_EXIT_AFTER_MS = Number(process.env.LIGHTCODE_EXIT_AFTER_MS ?? 0)
const LIGHTCODE_MAX_FPS = Number(process.env.LIGHTCODE_MAX_FPS ?? 60)
const LIGHTCODE_IDLE_MAX_FPS = Number(process.env.LIGHTCODE_IDLE_MAX_FPS ?? 60)
const LIGHTCODE_GRAPH_BG = process.env.LIGHTCODE_GRAPH_BG !== "0"
const LIGHTCODE_GRAPH_NEBULA = process.env.LIGHTCODE_GRAPH_NEBULA !== "0"
const LIGHTCODE_GRAPH_EDGES = process.env.LIGHTCODE_GRAPH_EDGES !== "0"
const LIGHTCODE_GRAPH_EDGE_GLOW = process.env.LIGHTCODE_GRAPH_EDGE_GLOW !== "0"
const LIGHTCODE_GRAPH_NODES = process.env.LIGHTCODE_GRAPH_NODES !== "0"
const LIGHTCODE_GRAPH_NODE_GLOW = process.env.LIGHTCODE_GRAPH_NODE_GLOW !== "0"
const LIGHTCODE_GRAPH_NODE_TEXT = process.env.LIGHTCODE_GRAPH_NODE_TEXT !== "0"
const LIGHTCODE_GRAPH_NODE_STATUS = process.env.LIGHTCODE_GRAPH_NODE_STATUS !== "0"
const LIGHTCODE_GRAPH_OVERLAY = process.env.LIGHTCODE_GRAPH_OVERLAY !== "0"
const LIGHTCODE_SPACE_SHOW_NEBULA = process.env.LIGHTCODE_SPACE_SHOW_NEBULA !== "0"
const LIGHTCODE_SPACE_SHOW_ATMOSPHERE = process.env.LIGHTCODE_SPACE_SHOW_ATMOSPHERE !== "0"
const LIGHTCODE_SPACE_SHOW_STARS = process.env.LIGHTCODE_SPACE_SHOW_STARS !== "0"
const LIGHTCODE_SPACE_SHOW_SPARKLES = process.env.LIGHTCODE_SPACE_SHOW_SPARKLES !== "0"
const LIGHTCODE_SPACE_NEBULA_SCALE = Number(process.env.LIGHTCODE_SPACE_NEBULA_SCALE ?? "0.5")
const LIGHTCODE_SPACE_STARS_SCALE = Number(process.env.LIGHTCODE_SPACE_STARS_SCALE ?? "0.75")
const LIGHTCODE_CANVAS_BACKEND = process.env.LIGHTCODE_CANVAS_BACKEND ?? "cpu"
const LIGHTCODE_AUTOCYCLE = process.env.LIGHTCODE_AUTOCYCLE === "1"
const WORKSPACE = { x: 34, y: 78, w: 1760, h: 826 }
const WORKSPACE_INSET = 20

const I = {
  menu: "☰",
  drag: "⋮",
  maximize: "◻",
  close: "✕",
  panel: "▣",
  diff: "≡",
  agent: "◉",
  editor: "▤",
  status: "•",
}

function debug(msg: string) {
  appendFileSync(DEBUG_LOG, msg + "\n")
}

async function loadNebula() {
  spaceBg = createSpaceBackground({
    width: 1600,
    height: 1000,
    seed: 1337,
    backgroundColor: T.bg,
    nebula: {
      renderScale: LIGHTCODE_SPACE_NEBULA_SCALE,
      stops: [
        { color: 0x04050700, position: 0 },
        { color: 0x0f2436aa, position: 0.32 },
        { color: 0x27495db0, position: 0.6 },
        { color: 0x8d5e39a8, position: 0.82 },
        { color: 0xf3bf6b7a, position: 1 },
      ],
      noise: {
        scale: 176,
        octaves: 5,
        gain: 60,
        lacunarity: 212,
        warp: 54,
        detail: 98,
        dust: 68,
      },
    },
    starfield: {
      renderScale: LIGHTCODE_SPACE_STARS_SCALE,
      count: 680,
      clusterCount: 8,
      clusterStars: 96,
      warmColor: 0xf3d7a1dc,
      coolColor: 0xc1d7ffe0,
      neutralColor: 0xffffffd8,
    },
    sparkles: {
      count: 4,
      color: 0xfff2d8ff,
    },
    atmosphere: {
      count: 5,
      colors: [0x7db6ff16, 0xf3bf6b16, 0xffffff0a],
    },
  })
  markDirty()
}

function useDraggablePanel(initialX: number, initialY: number, onActivate?: () => void) {
  const [offsetX, setOffsetX] = createSignal(initialX)
  const [offsetY, setOffsetY] = createSignal(initialY)
  let anchorX = 0
  let anchorY = 0

  const { dragProps } = useDrag({
    onDragStart: (evt: NodeMouseEvent) => {
      onActivate?.()
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

const T = {
  bg: 0x050507ff,
  workspaceTint: 0x0d0d10e0,
  shellGlass: 0x0c0d11b8,
  shellBorder: 0xffffff14,
  shellEdgeGlow: 0xf3bf6b24,
  panelBg: 0x121317ea,
  panelSubtle: 0x111216cc,
  panelDeep: 0x0a0a0dd8,
  panelInner: 0x0f1014ee,
  panelTop: 0x1b1c22f0,
  panelNeutralTop: 0x1b1c22f0,
  panelNeutralBottom: 0x0d0e12ea,
  panelWarmTop: 0x211913f0,
  panelWarmBottom: 0x120d0ae8,
  panelCoolTop: 0x141b24f0,
  panelCoolBottom: 0x0b1017ea,
  innerNeutralTop: 0x15161af0,
  innerNeutralBottom: 0x0c0d11f4,
  innerWarmTop: 0x17130ff2,
  innerWarmBottom: 0x0d0a09f4,
  innerCoolTop: 0x11171ef2,
  innerCoolBottom: 0x0a1017f4,
  rowBg: 0xffffff05,
  rowHover: 0xf3c26f12,
  border: 0xffffff10,
  borderSoft: 0xffffff08,
  borderBright: 0xffffff18,
  line: 0x4c433520,
  warm: 0xf3bf6bff,
  warmSoft: 0xf3bf6b66,
  warmGlow: 0xf3bf6b30,
  warmDim: 0xc19654ff,
  textPrimary: 0xf3ede2ff,
  textSecondary: 0xc6bcaeff,
  textMuted: 0x918779ff,
  textDim: 0x655d55ff,
  textCode: 0xe9e0d3ff,
  textCodeMuted: 0xbfb5a8ff,
  activeLine: 0xf3bf6b10,
  activeLineBorder: 0xf3bf6b24,
  blue: 0x90a8d0ff,
  blueSoft: 0x90a8d055,
  coolGlow: 0x90a8d036,
  neutralGlow: 0xffffff14,
  success: 0x9bd198ff,
  successSoft: 0x9bd19840,
  frame: 0xffffff12,
  blur: 0,
  panelRadius: 12,
  innerRadius: 9,
}

type GraphNodeData = {
  id: string
  label: string
  subtitle?: string
  kind: string
  panel: PanelId
  x: number
  y: number
  radius: number
  shape: "diamond" | "hexagon" | "octagon" | "circle" | number
  fill: number
  stroke: number
  glow: number
  status: "active" | "idle"
}

type PanelId = "memory" | "diff" | "editor" | "agent"

const nodes: GraphNodeData[] = [
  { id: "pipeline", label: "compute_shader_pipeline", subtitle: "Task / compile", kind: "compute", panel: "editor", x: 690, y: 430, radius: 44, shape: "diamond", fill: 0x4b2b09ff, stroke: T.warm, glow: 0xf3bf6b80, status: "active" },
  { id: "lightengine", label: "LightEngine.zig", kind: "engine", panel: "diff", x: 760, y: 230, radius: 18, shape: 4, fill: 0x25262cff, stroke: 0xece7dd80, glow: 0xffffff10, status: "idle" },
  { id: "vertex-top", label: "Vertex Buffer", kind: "buffer", panel: "memory", x: 470, y: 315, radius: 22, shape: "hexagon", fill: 0x72717844, stroke: 0xd0c7ba90, glow: 0xffffff12, status: "idle" },
  { id: "dispatch", label: "Dispatch Pointer", kind: "dispatch", panel: "diff", x: 452, y: 505, radius: 20, shape: "hexagon", fill: 0x4d4f5a44, stroke: 0xc5c8d690, glow: 0xffffff0d, status: "idle" },
  { id: "vertex-left", label: "Vertex Buffer", kind: "buffer", panel: "memory", x: 252, y: 586, radius: 24, shape: "hexagon", fill: 0x5b657a44, stroke: 0xc8d2e590, glow: 0x90a8d022, status: "idle" },
  { id: "lighting", label: "Lighting.zig", kind: "shader", panel: "memory", x: 155, y: 440, radius: 16, shape: 4, fill: 0x242730ff, stroke: 0xdce1eb80, glow: 0x90a8d020, status: "idle" },
  { id: "camera", label: "Camera Flows", kind: "camera", panel: "agent", x: 560, y: 692, radius: 20, shape: "hexagon", fill: 0x4b474040, stroke: 0xcab69970, glow: 0xf3bf6b18, status: "idle" },
  { id: "formats", label: "96 Formats", kind: "format", panel: "agent", x: 760, y: 676, radius: 18, shape: "octagon", fill: 0x564b3a40, stroke: 0xd2b28770, glow: 0xf3bf6b18, status: "idle" },
  { id: "router", label: "Runner", kind: "runner", panel: "agent", x: 850, y: 822, radius: 14, shape: "hexagon", fill: 0x4e412f40, stroke: 0xc7a46d70, glow: 0xf3bf6b15, status: "idle" },
  { id: "hub", label: "", kind: "hub", panel: "diff", x: 1105, y: 180, radius: 16, shape: "hexagon", fill: 0x8f8f9748, stroke: 0xe8e4db90, glow: 0xffffff10, status: "idle" },
  { id: "ghost-1", label: "", kind: "ghost", panel: "agent", x: 920, y: 720, radius: 10, shape: "hexagon", fill: 0x8e96a53c, stroke: 0xe8ecf460, glow: 0x90a8d018, status: "idle" },
  { id: "ghost-2", label: "", kind: "ghost", panel: "agent", x: 720, y: 752, radius: 12, shape: "hexagon", fill: 0x8e96a53c, stroke: 0xe8ecf460, glow: 0x90a8d018, status: "idle" },
]

const panelNodeMap: Record<PanelId, string> = {
  memory: "vertex-top",
  diff: "lightengine",
  editor: "pipeline",
  agent: "router",
}

function getNodeMeta(id: string) {
  return nodes.find((node) => node.id === id) ?? nodes[0]
}

const edges = [
  { id: "e1", from: "pipeline", to: "lightengine", color: 0xf3bf6b88 },
  { id: "e2", from: "pipeline", to: "vertex-top", color: 0xf3bf6b58 },
  { id: "e3", from: "pipeline", to: "dispatch", color: 0xf3bf6b44 },
  { id: "e4", from: "pipeline", to: "vertex-left", color: 0x90a8d044 },
  { id: "e5", from: "pipeline", to: "camera", color: 0xf3bf6b44 },
  { id: "e6", from: "pipeline", to: "formats", color: 0xf3bf6b36 },
  { id: "e7", from: "pipeline", to: "router", color: 0xf3bf6b26 },
  { id: "e8", from: "vertex-top", to: "lightengine", color: 0xece7dd44 },
  { id: "e9", from: "dispatch", to: "lightengine", color: 0x90a8d040 },
  { id: "e10", from: "lighting", to: "vertex-top", color: 0x90a8d03a },
  { id: "e11", from: "lighting", to: "dispatch", color: 0x90a8d02e },
  { id: "e12", from: "lighting", to: "vertex-left", color: 0x90a8d02e },
  { id: "e13", from: "vertex-top", to: "camera", color: 0xece7dd24 },
  { id: "e14", from: "dispatch", to: "camera", color: 0xece7dd22 },
  { id: "e15", from: "lightengine", to: "hub", color: 0xece7dd44 },
  { id: "e16", from: "hub", to: "pipeline", color: 0xf3bf6b56 },
  { id: "e17", from: "hub", to: "dispatch", color: 0x90a8d022 },
  { id: "e18", from: "formats", to: "ghost-1", color: 0x90a8d028 },
  { id: "e19", from: "camera", to: "ghost-2", color: 0xece7dd20 },
  { id: "e20", from: "router", to: "ghost-1", color: 0xece7dd28 },
]

function NodeGraph(props: { selectedNode: string; onSelectedNodeChange: (id: string) => void }) {
  const graphNodes = nodes.map((node) => ({ ...node, x: node.x - WORKSPACE.x, y: node.y - WORKSPACE.y }))
  const graph = useDraggableGraph(graphNodes)
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, zoom: 1 })
  const frame = WORKSPACE
  const bgSize = { w: frame.w, h: frame.h }

  function clamp(v: number, lo: number, hi: number) {
    if (v < lo) return lo
    if (v > hi) return hi
    return v
  }

  return (
      <box floating="root" floatOffset={{ x: frame.x, y: frame.y }} width={frame.w} height={frame.h}>
        <SceneCanvas
          interactive={false}
          width={frame.w}
          height={frame.h}
          viewport={viewport()}
          onViewportChange={(vp) => {
            debug(`[viewport] x=${vp.x.toFixed(2)} y=${vp.y.toFixed(2)} zoom=${vp.zoom.toFixed(3)}`)
            setViewport(vp)
          }}
          background={(ctx: CanvasContext) => {
            const bgBaseX = -Math.round((bgSize.w - frame.w) * 0.5)
            const bgBaseY = -Math.round((bgSize.h - frame.h) * 0.5)

            if (LIGHTCODE_GRAPH_BG) {
              const graphBg = graphBgCache.get(frame.w, frame.h, "lightcode-graph-bg-v1", (bg) => {
                bg.rect(0, 0, frame.w, frame.h, { fill: 0x0a0a0d88, stroke: T.frame, strokeWidth: 1 })
                bg.radialGradient(690 - frame.x, 430 - frame.y, 540, 0xf3bf6b18, 0x00000000)
                bg.radialGradient(260 - frame.x, 240 - frame.y, 300, 0xffffff08, 0x00000000)
                bg.radialGradient(980 - frame.x, 660 - frame.y, 260, 0xf3bf6b10, 0x00000000)
                bg.glow(690 - frame.x, 430 - frame.y, 170, 170, 0xf3bf6b30, 32)
                bg.glow(1230 - frame.x, 208 - frame.y, 72, 72, 0xf3bf6b18, 18)
              })
              ctx.drawImage(0, 0, frame.w, frame.h, graphBg.data, graphBg.width, graphBg.height, 1)
            }

            if (LIGHTCODE_GRAPH_NEBULA && spaceBg) {
              spaceBg.draw(ctx, {
                x: bgBaseX,
                y: bgBaseY,
                w: bgSize.w,
                h: bgSize.h,
                nebulaOpacity: 0.34,
                starsOpacity: 0.88,
                sparklesOpacity: 0.38,
                atmosphereOpacity: 1,
                showNebula: LIGHTCODE_SPACE_SHOW_NEBULA,
                showAtmosphere: LIGHTCODE_SPACE_SHOW_ATMOSPHERE,
                showStars: LIGHTCODE_SPACE_SHOW_STARS,
                showSparkles: LIGHTCODE_SPACE_SHOW_SPARKLES,
              })
            }
          }}
        >
          <For each={LIGHTCODE_GRAPH_EDGES ? edges : []}>
            {(edge) => (
              <SceneEdge
                id={edge.id}
                from={graph.getEdgeAnchor(edge.from)}
                to={graph.getEdgeAnchor(edge.to)}
                color={edge.color}
                glow={LIGHTCODE_GRAPH_EDGE_GLOW}
              />
            )}
          </For>

          <For each={LIGHTCODE_GRAPH_NODES ? graphNodes : []}>
            {(node) => (
              <SceneNode
                id={node.id}
                x={graph.getNodeX(node)}
                y={graph.getNodeY(node)}
                radius={node.radius}
                shape={node.shape}
                fill={node.fill}
                stroke={node.stroke}
                glow={LIGHTCODE_GRAPH_NODE_GLOW ? { color: node.glow, radius: node.status === "active" ? 38 : 18, intensity: node.status === "active" ? 75 : 22 } : undefined}
                selected={() => props.selectedNode === node.id}
                label={LIGHTCODE_GRAPH_NODE_TEXT ? node.label : undefined}
                sublabel={LIGHTCODE_GRAPH_NODE_TEXT ? node.subtitle : undefined}
                statusDot={LIGHTCODE_GRAPH_NODE_STATUS && node.status === "active" ? { color: T.warm, glow: true } : undefined}
                onSelect={() => {
                  props.onSelectedNodeChange(node.id)
                  markDirty()
                }}
                onDrag={(x, y) => graph.moveNode(node.id, x, y)}
              />
            )}
          </For>

          {LIGHTCODE_GRAPH_OVERLAY ? (
            <SceneOverlay
              id="active-chip"
              dependsOn={() => [props.selectedNode]}
              bounds={(scene) => {
                const pos = scene.getNodePosition(props.selectedNode)
                if (!pos) return null
                return { x: pos.x - 92, y: pos.y + 72, width: 292, height: 54 }
              }}
              draw={(ctx: CanvasContext, scene) => {
                const node = getNodeMeta(props.selectedNode)
                const pos = scene.getNodePosition(props.selectedNode)
                if (!pos) return
                const x = pos.x - 92
                const y = pos.y + 72
                ctx.rect(x + 6, y + 6, 292, 54, { fill: 0x00000050, radius: 10 })
                ctx.rect(x, y, 292, 54, { fill: 0x2b2118ee, radius: 10, stroke: 0xf3bf6b34, strokeWidth: 1 })
                ctx.text(x + 16, y + 9, `Task: ${node.label || "active_node"}`, T.textPrimary)
                ctx.text(x + 16, y + 28, `Type: ${node.kind}`, T.warmDim)
              }}
            />
          ) : null}
        </SceneCanvas>
      </box>
  )
}

function Rule() {
  return <box width="grow" height={1} backgroundColor={T.line} />
}

function ChromeDot(props: { color: number }) {
  return <box width={6} height={6} backgroundColor={props.color} cornerRadius={radius.full} />
}

function TinyChip(props: { label: string; active?: boolean; compact?: boolean }) {
  return (
    <box
      paddingX={props.compact ? space[1] : space[2]}
      paddingY={props.compact ? 3 : 4}
      backgroundColor={props.active ? 0xf3bf6b16 : 0xffffff04}
      borderColor={props.active ? 0xf3bf6b32 : T.borderSoft}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      <text color={props.active ? T.textPrimary : T.textSecondary} fontSize={props.compact ? 8 : 10}>{props.label}</text>
    </box>
  )
}

function HeaderAction(props: { label: string }) {
  return (
    <box
      width={18}
      height={18}
      alignX="center"
      alignY="center"
      cornerRadius={radius.sm}
      backgroundColor={0xffffff03}
    >
      <text color={T.textDim} fontSize={9}>{props.label}</text>
    </box>
  )
}

function PanelHeader(props: { title: string; subtitle?: string; icon?: string }) {
  const accent = props.icon === "☷" ? T.blueSoft : T.warmGlow
  return (
    <box direction="column" gap={space[2]} width="grow">
      <box direction="row" alignY="center" width="grow" height={20}>
        <box direction="row" gap={space[1]} alignY="center" width="grow">
          <text color={T.textSecondary} fontSize={10}>{props.icon ?? I.menu}</text>
          <text color={T.textPrimary} fontSize={13}>{props.title}</text>
        </box>
        <box direction="row" gap={space[1]}>
          <HeaderAction label={I.drag} />
          <HeaderAction label={I.maximize} />
          <HeaderAction label={I.close} />
        </box>
      </box>
      <box
        width="grow"
        height={1}
        gradient={{ type: "linear", from: 0xffffff08, to: accent, angle: 0 }}
        opacity={0.9}
      />
      {props.subtitle ? <text color={T.textMuted} fontSize={9}>{props.subtitle}</text> : null}
    </box>
  )
}

type PanelTone = "neutral" | "warm" | "cool"

function getPanelToneStyles(tone: PanelTone, flat?: boolean) {
  if (tone === "warm") {
    return {
      outerFrom: T.panelWarmTop,
      outerTo: T.panelWarmBottom,
      innerFrom: T.innerWarmTop,
      innerTo: T.innerWarmBottom,
      glow: T.warmGlow,
      border: 0xf3bf6b18,
      shadow: 0x00000032,
      flatBg: 0x171419f2,
      flatBorder: 0xf3bf6b18,
    }
  }

  if (tone === "cool") {
    return {
      outerFrom: T.panelCoolTop,
      outerTo: T.panelCoolBottom,
      innerFrom: T.innerCoolTop,
      innerTo: T.innerCoolBottom,
      glow: T.coolGlow,
      border: 0x90a8d018,
      shadow: 0x00000030,
      flatBg: 0x141821f2,
      flatBorder: 0x90a8d018,
    }
  }

  return {
    outerFrom: T.panelNeutralTop,
    outerTo: T.panelNeutralBottom,
    innerFrom: T.innerNeutralTop,
    innerTo: T.innerNeutralBottom,
    glow: T.neutralGlow,
    border: 0xffffff14,
    shadow: 0x00000030,
    flatBg: 0x16171df6,
    flatBorder: 0xffffff12,
  }
}

function ShaderPanel(props: {
  title: string
  subtitle?: string
  icon?: string
  tone?: PanelTone
  active?: boolean
  onActivate?: () => void
  width: number
  initialX: number
  initialY: number
  attach?: { element: number; parent: number }
  zIndex?: number
  contentChrome?: boolean
  flat?: boolean
  children: JSX.Element
}) {
  const drag = useDraggablePanel(props.initialX, props.initialY, props.onActivate)
  const tone = getPanelToneStyles(props.tone ?? "neutral", props.flat)

  return (
    <box
      {...drag.dragProps}
      layer
      focusable
      onPress={() => props.onActivate?.()}
      floating="root"
      floatOffset={{ x: drag.offsetX(), y: drag.offsetY() }}
      floatAttach={props.attach}
      zIndex={(props.zIndex ?? 10) + (props.active ? 2 : 0)}
      width={props.width}
      backgroundColor={props.flat ? tone.flatBg : T.panelBg}
      gradient={{ type: "linear", from: tone.outerFrom, to: tone.outerTo, angle: 90 }}
      backdropBlur={props.flat ? 4 : 8}
      cornerRadius={T.panelRadius}
      borderColor={props.active ? T.borderBright : props.flat ? tone.flatBorder : tone.border}
      borderWidth={1}
      padding={space[3]}
      direction="column"
      gap={space[3]}
      glow={props.flat ? { radius: 14, color: tone.glow, intensity: 5 } : { radius: 22, color: tone.glow, intensity: 8 }}
      shadow={props.flat ? { x: 0, y: 8, blur: 14, color: 0x00000022 } : { x: 0, y: 18, blur: 26, color: tone.shadow }}
      hoverStyle={{ borderColor: T.borderBright, shadow: { x: 0, y: 20, blur: 30, color: tone.shadow } }}
      activeStyle={{ borderColor: props.active ? T.borderBright : tone.border, shadow: { x: 0, y: 22, blur: 34, color: tone.shadow } }}
      focusStyle={{ borderColor: props.active ? T.borderBright : tone.border, borderWidth: 1, glow: { radius: 24, color: tone.glow, intensity: props.active ? 12 : 9 } }}
    >
      <box width="grow" height={1} gradient={{ type: "linear", from: 0xffffff16, to: tone.glow, angle: 0 }} opacity={0.9} />
      <PanelHeader title={props.title} subtitle={props.subtitle} icon={props.icon} />
      {props.contentChrome === false ? (
        <box width="grow" direction="column" gap={space[3]}>
          {props.children}
        </box>
      ) : (
        <box
          width="grow"
          backgroundColor={T.panelInner}
          gradient={{ type: "linear", from: tone.innerFrom, to: tone.innerTo, angle: 90 }}
          borderColor={T.borderSoft}
          borderWidth={1}
          cornerRadius={T.innerRadius}
          padding={space[3]}
          direction="column"
          gap={space[3]}
        >
          <box width="grow" height={1} gradient={{ type: "linear", from: 0xffffff0c, to: tone.glow, angle: 0 }} opacity={0.7} />
          {props.children}
        </box>
      )}
      <box width="grow" height={1} gradient={{ type: "linear", from: 0x00000000, to: 0xffffff08, angle: 0 }} opacity={0.6} />
    </box>
  )
}

function WorkspaceFrame() {
  return (
    <box
      layer={LIGHTCODE_CHROME_LAYERED}
      floating="root"
      floatOffset={{ x: WORKSPACE.x, y: WORKSPACE.y }}
      zIndex={2}
      width={WORKSPACE.w}
      height={WORKSPACE.h}
      backgroundColor={T.shellGlass}
      gradient={{ type: "linear", from: 0x101217b8, to: 0x08090db0, angle: 90 }}
      backdropBlur={8}
      borderColor={T.shellBorder}
      borderWidth={1}
      cornerRadius={12}
      shadow={{ x: 0, y: 24, blur: 42, color: 0x00000036 }}
      glow={{ radius: 28, color: T.shellEdgeGlow, intensity: 8 }}
    >
      <box width="grow" height={1} gradient={{ type: "linear", from: 0xffffff08, to: 0xf3bf6b26, angle: 0 }} />
      <box direction="column" width="grow" height="grow" padding={WORKSPACE_INSET}>
        <box width="grow" height="grow" backgroundColor={0x0d0f1380} borderColor={0xffffff08} borderWidth={1} cornerRadius={10} opacity={0.2} />
      </box>
      <box width="grow" height={1} gradient={{ type: "linear", from: 0x00000000, to: 0xffffff08, angle: 0 }} opacity={0.8} />
    </box>
  )
}

function WorkspaceHeader() {
  if (!LIGHTCODE_FLOATING_CHROME) {
    return (
      <box width="100%" direction="row" gap={space[2]} paddingLeft={56} paddingTop={18}>
        <box direction="row" gap={space[2]} paddingX={space[3]} paddingY={space[2]} backgroundColor={T.panelSubtle} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
          <text color={T.textSecondary} fontSize={10}>Compute Shaders</text>
          <text color={T.textMuted} fontSize={10}>v_engine.zig</text>
        </box>
        <box direction="row" gap={space[2]} paddingX={space[2]} paddingY={space[1]} backgroundColor={0xffffff05} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
          <text color={T.textMuted} fontSize={10}>▲</text>
          <text color={T.textDim} fontSize={10}>2/5</text>
        </box>
      </box>
    )
  }

  return (
    <box layer={LIGHTCODE_CHROME_LAYERED} floating="root" floatOffset={{ x: WORKSPACE.x + 22, y: WORKSPACE.y + 18 }} zIndex={12} direction="row" gap={space[2]}>
      <box
        width={34}
        height={28}
        backgroundColor={0x111216d6}
        backdropBlur={8}
        borderColor={T.border}
        borderWidth={1}
        cornerRadius={radius.sm}
        alignX="center"
        alignY="center"
      >
        <text color={T.textSecondary} fontSize={12}>{I.menu}</text>
      </box>
      <box
        direction="row"
        gap={space[2]}
        alignY="center"
        paddingX={space[3]}
        height={28}
        backgroundColor={0x111216d6}
        backdropBlur={8}
        borderColor={T.border}
        borderWidth={1}
        cornerRadius={radius.sm}
      >
        <text color={T.textPrimary} fontSize={11}>Compute Shaders</text>
        <text color={T.textDim} fontSize={9}>⌄</text>
        <text color={T.textPrimary} fontSize={11}>v_engine.zig</text>
      </box>
    </box>
  )
}

function WorkspaceFooter(props: { transmissionMode: string }) {
  if (!LIGHTCODE_FLOATING_CHROME) {
    return (
      <box width="100%" paddingLeft={54} paddingTop={12}>
        <box
          direction="row"
          gap={space[3]}
          alignY="center"
          paddingX={space[3]}
          height={24}
          width="fit"
          backgroundColor={0x121317d4}
          borderColor={T.border}
          borderWidth={1}
          cornerRadius={radius.sm}
        >
          <text color={T.warm} fontSize={10}>⚡</text>
          <text color={T.textSecondary} fontSize={10}>L24S</text>
          <text color={T.textDim} fontSize={10}>CC15</text>
          <text color={T.textMuted} fontSize={10}>|</text>
          <text color={T.textSecondary} fontSize={10}>Zig</text>
          <text color={T.textMuted} fontSize={10}>|</text>
          <text color={T.textSecondary} fontSize={10}>Kitty {props.transmissionMode}</text>
          <text color={T.textMuted} fontSize={10}>|</text>
          <text color={T.textPrimary} fontSize={10}>Lightcode v2.0</text>
        </box>
      </box>
    )
  }

  return (
    <box
      layer={LIGHTCODE_CHROME_LAYERED}
      floating="root"
      floatOffset={{ x: WORKSPACE.x + WORKSPACE_INSET, y: -18 }}
      floatAttach={{ element: 6, parent: 6 }}
      zIndex={12}
      direction="row"
      gap={space[3]}
      alignY="center"
      paddingX={space[3]}
      height={24}
      width={WORKSPACE.w - WORKSPACE_INSET * 2}
      backgroundColor={0x111216d6}
      backdropBlur={8}
      borderColor={T.border}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      <text color={T.warm} fontSize={10}>⚡</text>
      <text color={T.textSecondary} fontSize={10}>L345</text>
      <text color={T.textDim} fontSize={10}>EC15</text>
      <text color={T.textMuted} fontSize={10}>|</text>
      <text color={T.textSecondary} fontSize={10}>Zig</text>
      <text color={T.textMuted} fontSize={10}>|</text>
      <text color={T.textDim} fontSize={10}>GPU/file</text>
      <text color={T.textMuted} fontSize={10}>|</text>
      <text color={T.textPrimary} fontSize={10}>Lightcode v2.0</text>
      <box width="grow" />
      <text color={T.textPrimary} fontSize={10}>Lightcode v2.0</text>
      <text color={T.textDim} fontSize={9}>⌄</text>
    </box>
  )
}

function EditorTool(props: { label: string; active?: boolean; wide?: boolean }) {
  return (
    <box
      width={props.wide ? 26 : 18}
      height={18}
      alignX="center"
      alignY="center"
      backgroundColor={props.active ? 0xf3bf6b16 : 0xffffff03}
      borderColor={props.active ? 0xf3bf6b2c : T.borderSoft}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      <text color={props.active ? T.warm : T.textDim} fontSize={8}>{props.label}</text>
    </box>
  )
}

function ActionButton(props: { label: string; accent?: boolean; compact?: boolean; onPress?: () => void }) {
  return (
    <box
      focusable
      onPress={props.onPress}
      paddingX={props.compact ? space[2] : space[3]}
      paddingY={props.compact ? 4 : 6}
      backgroundColor={props.accent ? 0xf3bf6b18 : 0xffffff06}
      borderColor={props.accent ? 0xf3bf6b32 : T.borderSoft}
      borderWidth={1}
      cornerRadius={radius.sm}
      hoverStyle={{ backgroundColor: props.accent ? 0xf3bf6b24 : 0xffffff0d }}
      activeStyle={{ backgroundColor: props.accent ? 0xf3bf6b32 : 0xffffff12 }}
      focusStyle={{ borderColor: props.accent ? 0xf3bf6b58 : T.borderBright, borderWidth: 1 }}
    >
      <text color={props.accent ? T.warm : T.textPrimary} fontSize={10}>{props.label}</text>
    </box>
  )
}

function MetricPill(props: { label: string; value: string; accent?: boolean }) {
  return (
    <box
      direction="column"
      gap={2}
      paddingX={space[2]}
      paddingY={space[1]}
      backgroundColor={props.accent ? 0xf3bf6b14 : 0xffffff03}
      borderColor={props.accent ? 0xf3bf6b28 : T.borderSoft}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      <text color={T.textDim} fontSize={8}>{props.label}</text>
      <text color={props.accent ? T.warm : T.textPrimary} fontSize={10}>{props.value}</text>
    </box>
  )
}

function SectionLabel(props: { label: string; right?: string }) {
  return (
    <box direction="row" alignY="center" width="grow">
      <text color={T.textMuted} fontSize={9}>{props.label}</text>
      <box width="grow" />
      {props.right ? <text color={T.textDim} fontSize={8}>{props.right}</text> : null}
    </box>
  )
}

function CodeLine(props: { n: string; indent?: number; keyword?: string; content: string; tone?: number; active?: boolean }) {
  return (
    <box
      direction="row"
      gap={space[2]}
      alignY="center"
      paddingY={1}
      paddingX={props.active ? space[1] : 0}
      backgroundColor={props.active ? T.activeLine : 0x00000000}
      borderColor={props.active ? T.activeLineBorder : 0x00000000}
      borderWidth={props.active ? 1 : 0}
      cornerRadius={radius.sm}
    >
      <box width={20} alignX="right">
        <text color={T.textDim} fontSize={9}>{props.n}</text>
      </box>
      <box width={props.indent ? props.indent * 10 : 0} />
      {props.keyword ? <text color={T.warm} fontSize={10}>{props.keyword}</text> : null}
      <text color={props.tone ?? T.textPrimary} fontSize={10}>{props.content}</text>
    </box>
  )
}

function DebugHud() {
  return (
    <box
      layer
      floating="root"
      floatOffset={{ x: 54, y: 54 }}
      zIndex={20}
      width="fit"
      direction="column"
      gap={2}
      paddingX={space[2]}
      paddingY={space[1]}
      backgroundColor={0x101116e6}
      borderColor={0xffffff14}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      <text color={T.warm} fontSize={10}>DEBUG</text>
      <text color={T.textPrimary} fontSize={10}>{debugState.fps} FPS</text>
      <text color={T.textSecondary} fontSize={10}>{debugState.frameTimeMs} ms</text>
      <text color={T.textMuted} fontSize={10}>{debugState.layerCount} layers · {debugState.dirtyBeforeCount} dirty before</text>
      <text color={T.textMuted} fontSize={10}>{debugState.repaintedCount} repainted</text>
      <text color={T.textDim} fontSize={10}>{debugState.commandCount} cmds · {debugState.nodeCount} nodes</text>
    </box>
  )
}

function MemoryPanel(props: { selectedNode: string; active: boolean; onActivate: () => void }) {
  const current = () => getNodeMeta(props.selectedNode)
  const rows = [
    { title: "Buffer Size", left: "86:3704", right: "buffer › [396]", accent: true },
    { title: "bitwise", left: "- [1266]", right: "stride › 64", accent: false },
    { title: "function_buffer_init()", left: "23080003" },
    { title: "buffer.size › builtin.zig", left: "30080003" },
  ]
  const references = [
    { label: "function_buffer_init()", value: "25", tone: T.textSecondary },
    { label: "buffer.size › builtin.zig", value: "33", tone: T.textSecondary },
  ]

  return (
    <ShaderPanel
      title="Memory"
      subtitle={`LC_TOKENS · ${current().label || "memory"}`}
      icon={I.panel}
      tone="warm"
      active={props.active}
      onActivate={props.onActivate}
      width={336}
      initialX={78}
      initialY={430}
      contentChrome={false}
      flat
    >
      <box direction="row" gap={space[1]} width="grow">
        <TinyChip label="LC_TOKENS" active compact />
        <TinyChip label="accentGolden" compact />
        <TinyChip label={current().kind} compact active={current().panel === "memory"} />
      </box>
      <box direction="row" gap={space[2]} width="grow">
        <MetricPill label="bufferSize" value="868:3704" accent />
        <MetricPill label="buffer" value="[396]" />
      </box>
      <Rule />
      <SectionLabel label="Memory snapshot" right="stable" />
      <box direction="column" gap={space[2]} width="grow">
        {rows.map((row, index) => (
          <box direction="column" gap={space[1]} width="grow">
            <box direction="row" alignY="center" gap={space[2]}>
              <text color={row.accent ? T.warm : T.textSecondary} fontSize={11}>{row.title}</text>
              <box width="grow" />
            </box>
            <box direction="row" gap={space[2]} width="grow">
              <box width="grow" padding={space[2]} backgroundColor={row.accent ? 0xf3bf6b10 : T.rowBg} borderColor={row.accent ? 0xf3bf6b24 : T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
                <text color={T.textSecondary} fontSize={10}>{row.left}</text>
              </box>
              {row.right ? (
                <box width={96} padding={space[2]} backgroundColor={T.rowBg} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
                  <text color={T.textSecondary} fontSize={9}>{row.right ?? "-"}</text>
                </box>
              ) : null}
            </box>
          </box>
        ))}
      </box>
      <Rule />
      <SectionLabel label="References" right="linked" />
      <box direction="column" gap={space[2]} width="grow">
        {references.map((ref) => (
          <box width="grow" direction="column" gap={2} padding={space[2]} backgroundColor={0xffffff03} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
            <box direction="row" gap={space[2]} alignY="center">
              <text color={T.textDim} fontSize={9}>{I.diff}</text>
              <text color={T.textSecondary} fontSize={10}>{ref.label}</text>
              <box width="grow" />
              <text color={T.textDim} fontSize={9}>{ref.value}</text>
            </box>
          </box>
        ))}
      </box>
    </ShaderPanel>
  )
}

function DiffPanel(props: { selectedNode: string; active: boolean; onActivate: () => void }) {
  const current = () => getNodeMeta(props.selectedNode)
  const diffLines = [
    { n: "1", t: "import lightloop_procedural;", c: T.warmDim },
    { n: "2", t: "import light_compute;", c: T.warmDim },
    { n: "4", t: "type: EngineDispatcher.LightCompiler", c: T.textSecondary, active: true },
    { n: "6", t: "const bindings = buildBindings(ctx)", c: T.textMuted },
  ]

  return (
    <ShaderPanel
      title="Diff / Changes"
      subtitle={current().panel === "diff" ? current().label || "LightEngine.zig" : "LightEngine.zig"}
      icon={I.diff}
      tone="neutral"
      active={props.active}
      onActivate={props.onActivate}
      width={472}
      initialX={1256}
      initialY={132}
      zIndex={11}
    >
      <box direction="row" gap={space[2]}>
        <MetricPill label="changes" value="04" accent />
        <MetricPill label="file" value={current().panel === "diff" ? current().label || "LightEngine.zig" : "LightEngine.zig"} />
      </box>
      <box direction="row" alignY="center" padding={space[2]} backgroundColor={0xffffff04} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
        <text color={T.warm} fontSize={11}>{current().panel === "diff" ? current().label || "LightEngine.zig" : "LightEngine.zig"}</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={9}>⌃</text>
      </box>
      <box direction="column" gap={space[1]} paddingTop={space[1]}>
        {diffLines.map((line, index) => (
          <box direction="row" gap={space[2]} paddingY={2} paddingX={line.active ? space[1] : 0} backgroundColor={line.active ? 0x54211a28 : 0x00000000} borderColor={line.active ? 0xf3bf6b20 : 0x00000000} borderWidth={line.active ? 1 : 0} cornerRadius={radius.sm}>
            <text color={T.textDim} fontSize={10}>{line.n}</text>
            <text color={line.c} fontSize={10}>{line.t}</text>
          </box>
        ))}
      </box>
      <Rule />
      <box direction="row" alignY="center">
        <text color={T.textDim} fontSize={9}>staged · ready</text>
        <box width="grow" />
        <ActionButton label="Swap Changes" accent onPress={props.onActivate} />
      </box>
    </ShaderPanel>
  )
}

function EditorPanel(props: { selectedNode: string; active: boolean; onActivate: () => void }) {
  const current = () => getNodeMeta(props.selectedNode)
  const lines = [
    { n: "1", keyword: "func", content: " compute_shader_pipeline(engine, shader) {", tone: T.textCode },
    { n: "3", indent: 1, keyword: "const", content: " compute_shader = shader;", tone: T.textCodeMuted },
    { n: "4", indent: 1, keyword: "let", content: " color = { 0, 0, 1 };", tone: T.textCodeMuted },
    { n: "5", indent: 1, keyword: "let", content: " coeff = 0;", tone: T.textCodeMuted },
    { n: "7", indent: 1, keyword: "if", content: " (memory::vertex_buffer) {", tone: T.textCode, active: true },
    { n: "8", indent: 2, content: "color = coeff[vector];", tone: T.textCode, active: true },
    { n: "9", indent: 2, content: "color = coeff.x * memory.x;", tone: T.textCode },
    { n: "11", indent: 1, keyword: "else if", content: " (memory::camera_matrix[0, 1]) {", tone: T.textCode },
    { n: "12", indent: 2, content: "return v_engine;", tone: T.textCodeMuted },
    { n: "14", indent: 1, content: "}", tone: T.textMuted },
  ]

  return (
    <ShaderPanel
      title="v_engine.zig"
      subtitle={current().panel === "editor" ? current().label : "Compute Shader Pipeline"}
      icon={I.editor}
      tone="warm"
      active={props.active}
      onActivate={props.onActivate}
      width={742}
      initialX={892}
      initialY={286}
      zIndex={12}
    >
      <box direction="row" gap={space[2]} alignY="center">
        <box direction="row" gap={space[2]} width="grow">
          <TinyChip label="v_engine.zig" active />
          <TinyChip label="Compute Shader" active={current().panel === "editor"} />
          <TinyChip label={current().kind.toUpperCase()} compact active={current().panel === "editor"} />
        </box>
        <box direction="row" gap={space[1]}>
          <EditorTool label="⌘" />
          <EditorTool label="↺" />
          <EditorTool label="⊕" />
        </box>
      </box>
      <box direction="row" alignY="center" width="grow">
        <box
          direction="row"
          gap={space[1]}
          padding={space[1]}
          backgroundColor={0xffffff03}
          borderColor={T.borderSoft}
          borderWidth={1}
          cornerRadius={radius.sm}
          width="fit"
        >
          <EditorTool label="◻" />
          <EditorTool label="◫" />
          <EditorTool label={I.editor} active />
          <EditorTool label="◔" />
          <EditorTool label={I.agent} />
        </box>
        <box width="grow" />
        <text color={T.textDim} fontSize={10}>4D</text>
      </box>
      <Rule />
      <box direction="row" alignY="center" paddingBottom={2}>
        <text color={T.warm} fontSize={14}>{I.panel}</text>
        <text color={T.textPrimary} fontSize={14}>{current().panel === "editor" ? current().label : "Compute Shader Pipeline"}</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={9}>4D</text>
        <text color={T.textDim} fontSize={10}>↗</text>
        <text color={T.textDim} fontSize={10}>{I.close}</text>
      </box>
      <Rule />
      <box direction="row" width="grow" gap={space[2]} alignY="center">
        <text color={T.textDim} fontSize={9}>1</text>
        <text color={T.textSecondary} fontSize={10}>{current().panel === "editor" ? current().label : "v_engine.zig"}</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={9}>⌘P</text>
        <text color={T.textDim} fontSize={9}>⌘K</text>
      </box>
      <box
        direction="column"
        gap={space[1]}
        padding={space[3]}
        backgroundColor={0xffffff02}
        borderColor={T.borderSoft}
        borderWidth={1}
        cornerRadius={radius.md}
      >
        {lines.map((line) => (
          <CodeLine n={line.n} indent={line.indent} keyword={line.keyword} content={line.content} tone={line.tone} active={line.active} />
        ))}
      </box>
      <box width="grow" height={1} backgroundColor={0xffffff06} />
      <box direction="row" alignY="center" gap={space[2]}>
        <text color={T.textMuted} fontSize={9}>◈</text>
        <text color={T.textMuted} fontSize={10}>{current().panel === "editor" ? `active · ${current().kind}` : "return  v_engine"}</text>
        <text color={T.textDim} fontSize={9}>{I.status}</text>
        <text color={T.textDim} fontSize={9}>4D</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={9}>4/7</text>
        <ActionButton label="Swap Changes" accent onPress={props.onActivate} />
      </box>
    </ShaderPanel>
  )
}

function AgentPanel(props: { selectedNode: string; active: boolean; onActivate: () => void }) {
  const current = () => getNodeMeta(props.selectedNode)
  const logs = [
    { label: "Status", value: "Success" },
    { label: "Compiler", value: "Runner" },
    { label: "File batch", value: "12.68, 7/66" },
    { label: "Pipeline", value: "compute_shader_pipeline" },
  ]

  return (
    <ShaderPanel
      title="Agent · Running"
      subtitle={`Task · ${current().label || "compute_shader_pipeline"}`}
      icon={I.agent}
      tone="cool"
      active={props.active}
      onActivate={props.onActivate}
      width={410}
      initialX={1310}
      initialY={654}
      zIndex={11}
    >
      <box direction="row" gap={space[2]}>
        <MetricPill label="agent" value="running" accent />
        <MetricPill label="task" value={current().kind} />
      </box>
      <box direction="row" gap={space[2]} alignY="center">
        <ChromeDot color={T.blue} />
        <text color={T.textPrimary} fontSize={11}>Task · {current().label || "compute_shader_pipeline"}</text>
      </box>
      <Rule />
      <box direction="column" gap={space[2]} backgroundColor={0xffffff02} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm} padding={space[2]}>
        {logs.map((log) => (
          <box direction="row" alignY="center" paddingY={2}>
            <text color={T.textDim} fontSize={9}>{log.label}</text>
            <box width="grow" />
            <text color={T.textSecondary} fontSize={10}>{log.value}</text>
          </box>
        ))}
      </box>
      <Rule />
      <box direction="row" gap={space[2]} alignY="center" backgroundColor={0xffffff04} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm} padding={space[2]}>
        <text color={T.textDim} fontSize={9}>{I.drag}</text>
        <text color={T.textMuted} fontSize={10}>/</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={9}>runner ready</text>
      </box>
    </ShaderPanel>
  )
}

function App(props: { transmissionMode: string }) {
  let rootRef: NodeHandle | undefined
  let dumpedTree = false
  const [selectedNode, setSelectedNode] = createSignal(panelNodeMap.editor)
  const [activePanel, setActivePanel] = createSignal<PanelId>("editor")

  function selectPanel(panel: PanelId) {
    setActivePanel(panel)
    setSelectedNode(panelNodeMap[panel])
    markDirty()
  }

  function handleSelectedNodeChange(id: string) {
    const meta = getNodeMeta(id)
    setSelectedNode(id)
    setActivePanel(meta.panel)
    markDirty()
  }

  if (LIGHTCODE_AUTOCYCLE) {
    const cycle = ["pipeline", "lightengine", "vertex-top", "router"]
    let index = 0
    const timer = setInterval(() => {
      const id = cycle[index % cycle.length]
      handleSelectedNodeChange(id)
      index += 1
    }, 320)
    onCleanup(() => clearInterval(timer))
  }

  return (
    <box
      ref={(handle) => {
        rootRef = handle
        if (LIGHTCODE_DUMP_TREE && rootRef && !dumpedTree) {
          dumpedTree = true
          queueMicrotask(() => {
            appendFileSync(DEBUG_LOG, "[tree]\n" + debugDumpTree(rootRef!) + "\n")
          })
        }
      }}
      width="100%"
      height="100%"
      backgroundColor={T.bg}
    >
      {LIGHTCODE_STAGE >= 1 ? <WorkspaceFrame /> : null}
      {LIGHTCODE_SHOW_HUD ? <DebugHud /> : null}
      {LIGHTCODE_STAGE >= 1 ? <NodeGraph selectedNode={selectedNode()} onSelectedNodeChange={handleSelectedNodeChange} /> : null}
      {LIGHTCODE_STAGE >= 2 ? <WorkspaceHeader /> : null}
      {LIGHTCODE_STAGE >= 3 ? <WorkspaceFooter transmissionMode={props.transmissionMode} /> : null}
      {LIGHTCODE_STAGE >= 4 ? <MemoryPanel selectedNode={selectedNode()} active={activePanel() === "memory"} onActivate={() => selectPanel("memory")} /> : null}
      {LIGHTCODE_STAGE >= 5 ? <EditorPanel selectedNode={selectedNode()} active={activePanel() === "editor"} onActivate={() => selectPanel("editor")} /> : null}
      {LIGHTCODE_STAGE >= 6 ? <DiffPanel selectedNode={selectedNode()} active={activePanel() === "diff"} onActivate={() => selectPanel("diff")} /> : null}
      {LIGHTCODE_STAGE >= 6 ? <AgentPanel selectedNode={selectedNode()} active={activePanel() === "agent"} onActivate={() => selectPanel("agent")} /> : null}
    </box>
  )
}

async function main() {
  try {
    appendFileSync(DEBUG_LOG, "\n--- lightcode run ---\n")
    appendFileSync("/tmp/tge-render-debug.log", "\n--- lightcode run ---\n")
  } catch {}
  process.on("uncaughtException", (err) => {
    appendFileSync(DEBUG_LOG, `[uncaughtException] ${String(err?.stack || err)}\n`)
  })
  process.on("unhandledRejection", (err) => {
    appendFileSync(DEBUG_LOG, `[unhandledRejection] ${String(err)}\n`)
  })
  process.on("exit", (code) => {
    appendFileSync(DEBUG_LOG, `[exit] code=${code}\n`)
  })
  appendFileSync(DEBUG_LOG, "[main] handlers installed\n")
  await loadNebula()
  appendFileSync(DEBUG_LOG, "[main] nebula loaded\n")
  const term = await createTerminal()
  resetKittyTransportStats()
  const wgpuBridge = probeWgpuCanvasBridge()
  const selectedCanvasBackend = LIGHTCODE_CANVAS_BACKEND === "wgpu" && wgpuBridge.available ? tryCreateWgpuCanvasPainterBackend() : null
  setCanvasPainterBackend(selectedCanvasBackend)
  appendFileSync(DEBUG_LOG, `[main] terminal created kitty=${term.caps.kittyGraphics} mode=${term.caps.transmissionMode}\n`)
  appendFileSync(DEBUG_LOG, `[main] canvasBackend=${getCanvasPainterBackendName()}\n`)
  appendFileSync(DEBUG_LOG, `[main] wgpuBridge available=${wgpuBridge.available} path=${wgpuBridge.libraryPath ?? "none"} reason=${wgpuBridge.reason}\n`)
  appendFileSync(DEBUG_LOG, `[main] requestedCanvasBackend=${LIGHTCODE_CANVAS_BACKEND}\n`)
  appendFileSync(DEBUG_LOG, `[main] stage=${LIGHTCODE_STAGE}\n`)
  appendFileSync(DEBUG_LOG, "[main] stages: 0=empty 1=nodegraph 2=header 3=footer 4=memory 5=editor 6=diff+agent\n")
  if (LIGHTCODE_LOG_CADENCE) appendFileSync(DEBUG_LOG, "[main] cadence profiler enabled (/tmp/tge-cadence.log)\n")
  setDebug(true)
  appendFileSync(DEBUG_LOG, "[main] debug enabled\n")
  const cleanup = mount(() => <App transmissionMode={term.caps.transmissionMode} />, term, {
    maxFps: LIGHTCODE_MAX_FPS,
    experimental: {
      idleMaxFps: LIGHTCODE_IDLE_MAX_FPS,
      forceLayerRepaint: LIGHTCODE_FORCE_LAYER_REPAINT,
    },
  })
  appendFileSync(DEBUG_LOG, "[main] mounted\n")

  let perfTimer: ReturnType<typeof setInterval> | null = null
  let repaintTimer: ReturnType<typeof setInterval> | null = null
  let exitTimer: ReturnType<typeof setTimeout> | null = null
  if (LIGHTCODE_LOG_FPS) {
    try {
      appendFileSync(PERF_LOG, `\n--- lightcode perf stage=${LIGHTCODE_STAGE} ---\n`)
    } catch {}
    perfTimer = setInterval(() => {
      const kittyStats = getKittyTransportStats()
      appendFileSync(
        PERF_LOG,
        `fps=${debugState.fps} ms=${debugState.frameTimeMs} layers=${debugState.layerCount} dirtyBefore=${debugState.dirtyBeforeCount} repainted=${debugState.repaintedCount} cmds=${debugState.commandCount} nodes=${debugState.nodeCount} strategy=${debugState.rendererStrategy ?? "none"} output=${debugState.rendererOutput ?? "none"} tx=${debugState.transmissionMode ?? "none"} estLayered=${debugState.estimatedLayeredBytes} estFinal=${debugState.estimatedFinalBytes} resBytes=${debugState.resourceBytes} gpuBytes=${debugState.gpuResourceBytes} resEntries=${debugState.resourceEntries} txPayload=${kittyStats.payloadBytes} txTty=${kittyStats.estimatedTtyBytes} txCalls=${kittyStats.transmitCalls} txPatch=${kittyStats.patchCalls}\n`,
      )
    }, 500)
  }

  if (LIGHTCODE_FORCE_REPAINT) {
    appendFileSync(DEBUG_LOG, "[main] forced repaint enabled (~60fps target)\n")
    repaintTimer = setInterval(() => {
      markDirty()
    }, 16)
  }
  if (LIGHTCODE_FORCE_LAYER_REPAINT) {
    appendFileSync(DEBUG_LOG, "[main] forced layer repaint enabled\n")
  }

  if (LIGHTCODE_EXIT_AFTER_MS > 0) {
    appendFileSync(DEBUG_LOG, `[main] auto-exit after ${LIGHTCODE_EXIT_AFTER_MS}ms\n`)
    exitTimer = setTimeout(() => {
      parser.destroy()
      if (perfTimer) clearInterval(perfTimer)
      if (repaintTimer) clearInterval(repaintTimer)
      setCanvasPainterBackend(null)
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }, LIGHTCODE_EXIT_AFTER_MS)
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

main().catch((err) => {
  try {
    appendFileSync(DEBUG_LOG, `[main.catch] ${String(err?.stack || err)}\n`)
  } catch {}
  console.error(err)
  process.exit(1)
})
