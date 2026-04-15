/**
 * LightCode cinematic workspace demo.
 *
 * Run: bun --conditions=browser run examples/lightcode.tsx
 */

import { createSignal, For, type JSX } from "solid-js"
import { mount, markDirty, useDrag, setDebug, debugState, debugDumpTree, createCanvasImageCache, getCanvasPainterBackendName, probeWgpuCanvasBridge, setCanvasPainterBackend, type NodeHandle } from "@tge/renderer"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { createSpaceBackground, type SpaceBackground, SceneCanvas, SceneNode, SceneEdge, SceneOverlay } from "@tge/components"
import { tryCreateWgpuCanvasPainterBackend } from "../packages/renderer/src/wgpu-canvas-backend"
import { radius, space } from "@tge/void"
import type { CanvasContext, NodeMouseEvent } from "@tge/renderer"
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

const T = {
  bg: 0x050507ff,
  workspaceTint: 0x0d0d10e0,
  panelBg: 0x121317ea,
  panelDeep: 0x0a0a0dd8,
  panelInner: 0x0f1014ee,
  rowBg: 0xffffff05,
  rowHover: 0xf3c26f12,
  border: 0xffffff10,
  borderSoft: 0xffffff08,
  line: 0x4c433520,
  warm: 0xf3bf6bff,
  warmSoft: 0xf3bf6b66,
  warmGlow: 0xf3bf6b30,
  warmDim: 0xc19654ff,
  textPrimary: 0xf3ede2ff,
  textSecondary: 0xc6bcaeff,
  textMuted: 0x918779ff,
  textDim: 0x655d55ff,
  blue: 0x90a8d0ff,
  blueSoft: 0x90a8d055,
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
  x: number
  y: number
  radius: number
  shape: "diamond" | "hexagon" | "octagon" | "square"
  fill: number
  stroke: number
  glow: number
  status: "active" | "idle"
}

const nodes: GraphNodeData[] = [
  { id: "pipeline", label: "compute_shader_pipeline", subtitle: "Task / compile", x: 560, y: 430, radius: 44, shape: "diamond", fill: 0x4b2b09ff, stroke: T.warm, glow: 0xf3bf6b80, status: "active" },
  { id: "lightengine", label: "LightEngine.zig", x: 640, y: 270, radius: 18, shape: "square", fill: 0x25262cff, stroke: 0xece7dd80, glow: 0xffffff10, status: "idle" },
  { id: "vertex-top", label: "Vertex Buffer", x: 430, y: 315, radius: 22, shape: "hexagon", fill: 0x72717844, stroke: 0xd0c7ba90, glow: 0xffffff12, status: "idle" },
  { id: "dispatch", label: "Dispatch Pointer", x: 430, y: 470, radius: 20, shape: "hexagon", fill: 0x4d4f5a44, stroke: 0xc5c8d690, glow: 0xffffff0d, status: "idle" },
  { id: "vertex-left", label: "Vertex Buffer", x: 220, y: 565, radius: 24, shape: "hexagon", fill: 0x5b657a44, stroke: 0xc8d2e590, glow: 0x90a8d022, status: "idle" },
  { id: "lighting", label: "Lightingne.sig", x: 155, y: 440, radius: 16, shape: "square", fill: 0x242730ff, stroke: 0xdce1eb80, glow: 0x90a8d020, status: "idle" },
  { id: "camera", label: "Camera Norms", x: 520, y: 650, radius: 20, shape: "hexagon", fill: 0x4b474040, stroke: 0xcab69970, glow: 0xf3bf6b18, status: "idle" },
  { id: "formats", label: "96 Formats", x: 680, y: 650, radius: 18, shape: "octagon", fill: 0x564b3a40, stroke: 0xd2b28770, glow: 0xf3bf6b18, status: "idle" },
  { id: "router", label: "Router", x: 640, y: 765, radius: 14, shape: "hexagon", fill: 0x4e412f40, stroke: 0xc7a46d70, glow: 0xf3bf6b15, status: "idle" },
  { id: "hub", label: "", x: 825, y: 255, radius: 16, shape: "hexagon", fill: 0x8f8f9748, stroke: 0xe8e4db90, glow: 0xffffff10, status: "idle" },
  { id: "ghost-1", label: "", x: 835, y: 690, radius: 10, shape: "hexagon", fill: 0x8e96a53c, stroke: 0xe8ecf460, glow: 0x90a8d018, status: "idle" },
  { id: "ghost-2", label: "", x: 560, y: 720, radius: 12, shape: "hexagon", fill: 0x8e96a53c, stroke: 0xe8ecf460, glow: 0x90a8d018, status: "idle" },
]

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

function NodeGraph() {
  const [positions, setPositions] = createSignal(Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }])))
  const [selected, setSelected] = createSignal("pipeline")
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, zoom: 1 })
  const frame = { x: 34, y: 78, w: 1760, h: 826 }
  const bgSize = { w: 1860, h: 1160 }

  function clamp(v: number, lo: number, hi: number) {
    if (v < lo) return lo
    if (v > hi) return hi
    return v
  }

  function getPos(id: string) {
    return () => positions()[id] ?? { x: 0, y: 0 }
  }

  return (
      <SceneCanvas
        interactive={false}
        viewport={viewport()}
        onViewportChange={(vp) => {
          debug(`[viewport] x=${vp.x.toFixed(2)} y=${vp.y.toFixed(2)} zoom=${vp.zoom.toFixed(3)}`)
          setViewport(vp)
        }}
        background={(ctx: CanvasContext) => {
        const bgBaseX = frame.x - Math.round((bgSize.w - frame.w) * 0.5)
        const bgBaseY = frame.y - Math.round((bgSize.h - frame.h) * 0.5)

      if (LIGHTCODE_GRAPH_BG) {
          const graphBg = graphBgCache.get(frame.w, frame.h, "lightcode-graph-bg-v1", (bg) => {
            bg.rect(0, 0, frame.w, frame.h, { fill: 0x0a0a0d88, stroke: T.frame, strokeWidth: 1 })
            bg.radialGradient(560 - frame.x, 430 - frame.y, 500, 0xf3bf6b16, 0x00000000)
            bg.radialGradient(220 - frame.x, 230 - frame.y, 260, 0xffffff08, 0x00000000)
            bg.glow(560 - frame.x, 430 - frame.y, 150, 150, 0xf3bf6b2c, 28)
            bg.glow(1090 - frame.x, 760 - frame.y, 80, 80, 0xf3bf6b12, 16)
          })
          ctx.drawImage(frame.x, frame.y, frame.w, frame.h, graphBg.data, graphBg.width, graphBg.height, 1)
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
            from={getPos(edge.from)}
            to={getPos(edge.to)}
            color={edge.color}
            glow={LIGHTCODE_GRAPH_EDGE_GLOW}
          />
        )}
      </For>

      <For each={LIGHTCODE_GRAPH_NODES ? nodes : []}>
        {(node) => (
          <SceneNode
            id={node.id}
            x={() => positions()[node.id]?.x ?? node.x}
            y={() => positions()[node.id]?.y ?? node.y}
            radius={node.radius}
            shape={node.shape}
            fill={node.fill}
            stroke={node.stroke}
            glow={LIGHTCODE_GRAPH_NODE_GLOW ? { color: node.glow, radius: node.status === "active" ? 38 : 18, intensity: node.status === "active" ? 75 : 22 } : undefined}
            selected={() => selected() === node.id}
            label={LIGHTCODE_GRAPH_NODE_TEXT ? node.label : undefined}
            sublabel={LIGHTCODE_GRAPH_NODE_TEXT ? node.subtitle : undefined}
            statusDot={LIGHTCODE_GRAPH_NODE_STATUS && node.status === "active" ? { color: T.warm, glow: true } : undefined}
            onSelect={() => {
              setSelected(node.id)
              markDirty()
            }}
            onDrag={(x, y) => {
              setPositions((prev) => ({ ...prev, [node.id]: { x, y } }))
              markDirty()
            }}
          />
        )}
      </For>

      {LIGHTCODE_GRAPH_OVERLAY ? (
        <SceneOverlay
          id="active-chip"
          draw={(ctx: CanvasContext) => {
            const pos = positions()[selected()]
            if (!pos) return
            const x = pos.x - 68
            const y = pos.y + 72
            ctx.rect(x + 4, y + 4, 226, 42, { fill: 0x00000050, radius: 8 })
            ctx.rect(x, y, 226, 42, { fill: 0x2b2118ea, radius: 8, stroke: 0xf3bf6b30, strokeWidth: 1 })
            ctx.text(x + 14, y + 7, "Task: compute_shader_pipeline", T.textPrimary)
            ctx.text(x + 14, y + 22, "Type: compile", T.warmDim)
          }}
        />
      ) : null}
    </SceneCanvas>
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
      <text color={props.active ? T.textPrimary : T.textSecondary} fontSize={props.compact ? 9 : 10}>{props.label}</text>
    </box>
  )
}

function HeaderAction(props: { label: string }) {
  return (
    <box width={18} height={18} alignX="center" alignY="center" cornerRadius={radius.sm} hoverStyle={{ backgroundColor: 0xffffff06 }}>
      <text color={T.textDim} fontSize={11}>{props.label}</text>
    </box>
  )
}

function PanelHeader(props: { title: string; subtitle?: string }) {
  return (
    <box direction="column" gap={3} width="grow">
      <box direction="row" alignY="center" width="grow">
        <box direction="row" gap={space[1]} alignY="center" width="grow">
          <text color={T.textSecondary} fontSize={14}>≡</text>
          <text color={T.textPrimary} fontSize={13}>{props.title}</text>
        </box>
        <box direction="row" gap={space[1]}>
          <HeaderAction label="⌁" />
          <HeaderAction label="◻" />
          <HeaderAction label="×" />
        </box>
      </box>
      {props.subtitle ? <text color={T.textMuted} fontSize={10}>{props.subtitle}</text> : null}
      <box
        width="grow"
        height={2}
        gradient={{ type: "linear", from: 0x00000000, to: 0xf3bf6b2e, angle: 0 }}
        opacity={0.8}
      />
    </box>
  )
}

function ShaderPanel(props: {
  title: string
  subtitle?: string
  width: number
  initialX: number
  initialY: number
  attach?: { element: number; parent: number }
  zIndex?: number
  contentChrome?: boolean
  flat?: boolean
  children: JSX.Element
}) {
  const drag = useDraggablePanel(props.initialX, props.initialY)

  return (
    <box
      {...drag.dragProps}
      layer
      floating="root"
      floatOffset={{ x: drag.offsetX(), y: drag.offsetY() }}
      floatAttach={props.attach}
      zIndex={props.zIndex ?? 10}
      width={props.width}
      backgroundColor={props.flat ? 0x16171df6 : T.panelBg}
      gradient={props.flat ? undefined : { type: "linear", from: 0x17181cf0, to: 0x0d0e12e2, angle: 90 }}
      cornerRadius={T.panelRadius}
      borderColor={props.flat ? 0xffffff12 : 0xffffff14}
      borderWidth={1}
      padding={space[3]}
      direction="column"
      gap={space[3]}
      glow={props.flat ? undefined : { radius: 18, color: T.warmGlow, intensity: 12 }}
      shadow={props.flat ? { x: 0, y: 8, blur: 14, color: 0x0000001c } : { x: 0, y: 12, blur: 18, color: 0x00000024 }}
    >
      <PanelHeader title={props.title} subtitle={props.subtitle} />
      {props.contentChrome === false ? (
        <box width="grow" direction="column" gap={space[3]}>
          {props.children}
        </box>
      ) : (
        <box
          width="grow"
          backgroundColor={T.panelInner}
          gradient={{ type: "linear", from: 0x15161af0, to: 0x0c0d11ee, angle: 90 }}
          borderColor={T.borderSoft}
          borderWidth={1}
          cornerRadius={T.innerRadius}
          padding={space[3]}
          direction="column"
          gap={space[3]}
        >
          {props.children}
        </box>
      )}
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
    <box layer={LIGHTCODE_CHROME_LAYERED} floating="root" floatOffset={{ x: 56, y: 94 }} zIndex={12} direction="row" gap={space[2]}>
      <box
        width={34}
        height={28}
        backgroundColor={0x121317d4}
        borderColor={T.border}
        borderWidth={1}
        cornerRadius={radius.sm}
        alignX="center"
        alignY="center"
      >
        <text color={T.textSecondary} fontSize={13}>☰</text>
      </box>
      <box
        direction="row"
        gap={space[2]}
        alignY="center"
        paddingX={space[3]}
        height={28}
        backgroundColor={0x121317d4}
        borderColor={T.border}
        borderWidth={1}
        cornerRadius={radius.sm}
      >
        <text color={T.textPrimary} fontSize={12}>Compute Shaders</text>
        <text color={T.textDim} fontSize={10}>›</text>
        <text color={T.textPrimary} fontSize={12}>v_engine.zig</text>
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
      floatOffset={{ x: 54, y: -30 }}
      floatAttach={{ element: 6, parent: 6 }}
      zIndex={12}
      direction="row"
      gap={space[3]}
      alignY="center"
      paddingX={space[3]}
      height={24}
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

function MemoryPanel() {
  const rows = [
    { title: "buffer Size", left: "86:3904", right: "buffer › [396]" },
    { title: "bitwise", left: "- [1266]", right: "-" },
    { title: "funcieb.buffer_fut()", left: "23080003" },
    { title: "buffer.size › buntil.zig", left: "30080003" },
  ]
  const references = [
    { label: "funcieb.buffer_fut()", value: "23080003" },
    { label: "buffer.size › buntil.zig", value: "30080003" },
  ]

  return (
    <ShaderPanel
      title="Memory"
      subtitle="LC_TOKENS · accentGolden.focusView"
      width={336}
      initialX={78}
      initialY={430}
      contentChrome={false}
      flat
    >
      <box direction="row" gap={space[1]} width="grow">
        <TinyChip label="LC_TOKENS" active compact />
        <TinyChip label="accentGolden" compact />
        <TinyChip label="focusView" compact />
      </box>
      <Rule />
      <box direction="column" gap={space[2]} width="grow">
        {rows.map((row, index) => (
          <box direction="column" gap={space[1]} width="grow">
            <box direction="row" alignY="center" gap={space[2]}>
              <text color={index < 2 ? T.warm : T.textSecondary} fontSize={11}>{row.title}</text>
              <box width="grow" />
            </box>
            <box direction="row" gap={space[2]} width="grow">
              <box width="grow" padding={space[2]} backgroundColor={T.rowBg} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
                <text color={T.textSecondary} fontSize={10}>{row.left}</text>
              </box>
              {index < 2 ? (
                <box width={96} padding={space[2]} backgroundColor={T.rowBg} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
                  <text color={T.textSecondary} fontSize={9}>{row.right ?? "-"}</text>
                </box>
              ) : null}
            </box>
          </box>
        ))}
      </box>
      <Rule />
      <text color={T.textMuted} fontSize={10}>References</text>
      <box direction="column" gap={space[2]} width="grow">
        {references.map((ref) => (
          <box width="grow" direction="column" gap={2} padding={space[2]} backgroundColor={0xffffff03} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
            <box direction="row" gap={space[2]} alignY="center">
              <text color={T.textDim} fontSize={10}>☰</text>
              <text color={T.textSecondary} fontSize={10}>{ref.label}</text>
            </box>
            <text color={T.textMuted} fontSize={10}>{ref.value}</text>
          </box>
        ))}
      </box>
    </ShaderPanel>
  )
}

function DiffPanel() {
  const diffLines = [
    { n: "1", t: "import lightloopproccea,", c: T.warmDim },
    { n: "2", t: "import lighhcompute;", c: T.warmDim },
    { n: "4", t: "type: EngineDispatcher.LightCompiler", c: T.textSecondary },
    { n: "6", t: "const bindings = buildBindings(ctx)", c: T.textMuted },
  ]

  return (
    <ShaderPanel
      title="Diff / Changes"
      subtitle="LightEngine.zig"
      width={316}
      initialX={720}
      initialY={150}
      zIndex={11}
    >
      <box direction="row" alignY="center" padding={space[2]} backgroundColor={0xffffff04} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm}>
        <text color={T.warm} fontSize={11}>LightEngine.zig</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={10}>⌃</text>
      </box>
      <box direction="column" gap={space[1]} paddingTop={space[1]}>
        {diffLines.map((line, index) => (
          <box direction="row" gap={space[2]} paddingY={2} backgroundColor={index === 2 ? 0x54211a28 : 0x00000000}>
            <text color={T.textDim} fontSize={10}>{line.n}</text>
            <text color={line.c} fontSize={10}>{line.t}</text>
          </box>
        ))}
      </box>
      <Rule />
      <box direction="row" alignX="right">
        <box paddingX={space[2]} paddingY={4} backgroundColor={0xf3bf6b18} borderColor={0xf3bf6b32} borderWidth={1} cornerRadius={radius.sm}>
          <text color={T.warm} fontSize={10}>Swap Changes</text>
        </box>
      </box>
    </ShaderPanel>
  )
}

function EditorPanel() {
  const lines = [
    { n: "1", code: "func", rest: " compute_shader_pipeline(engine, shader) {" },
    { n: "3", code: "const", rest: " color = i; 0, 0, 1;" },
    { n: "4", code: "let", rest: " coff = 0;" },
    { n: "5", code: "let", rest: " p: 712 = 0;" },
    { n: "7", code: "if", rest: " (memory::vertex_buffer)" },
    { n: "8", code: "", rest: "  color = coeff[letor)" },
    { n: "9", code: "", rest: "  color = (coeff.x · memory.x), a0);" },
    { n: "11", code: "else if", rest: "" },
    { n: "12", code: "", rest: "  memory::camera_matrix 10, 10;" },
  ]

  return (
    <ShaderPanel
      title="v__engine.zig"
      subtitle="Compute Shader Pipeline"
      width={404}
      initialX={620}
      initialY={340}
      zIndex={12}
    >
      <box direction="row" gap={space[2]}>
        <TinyChip label="v__engine.zig" active />
        <TinyChip label="⌘" />
        <TinyChip label="↺" />
      </box>
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
        <TinyChip label="◻" />
        <TinyChip label="◫" />
        <TinyChip label="☰" />
        <TinyChip label="◔" />
        <TinyChip label="☷" />
      </box>
      <Rule />
      <box direction="row" alignY="center">
        <text color={T.warm} fontSize={16}>⚑</text>
        <text color={T.textPrimary} fontSize={15}>Compute Shader Pipeline</text>
        <box width="grow" />
        <text color={T.textDim} fontSize={11}>⇄</text>
        <text color={T.textDim} fontSize={11}>×</text>
      </box>
      <Rule />
      <box direction="column" gap={space[1]}>
        {lines.map((line) => (
          <box direction="row" gap={space[2]} alignY="center" paddingY={1}>
            <text color={T.textDim} fontSize={10}>{line.n}</text>
            <text color={line.code ? T.warm : T.textSecondary} fontSize={11}>{line.code}</text>
            <text color={T.textPrimary} fontSize={11}>{line.rest}</text>
          </box>
        ))}
      </box>
      <box width="grow" height={1} backgroundColor={0xffffff06} />
      <box direction="row" alignY="center">
        <text color={T.textMuted} fontSize={10}>◈</text>
        <text color={T.textMuted} fontSize={10}>Saturn v_engines</text>
        <box width="grow" />
        <box paddingX={space[2]} paddingY={4} backgroundColor={0xf3bf6b18} borderColor={0xf3bf6b32} borderWidth={1} cornerRadius={radius.sm}>
          <text color={T.warm} fontSize={10}>Swap Change</text>
        </box>
      </box>
    </ShaderPanel>
  )
}

function AgentPanel() {
  const logs = [
    "States · Success",
    "Gunair · Booter",
    "Zig build compiled 62.60, 7.25s",
    "Shader pipeline succeeded by cor placed by core4",
  ]

  return (
    <ShaderPanel
      title="Agent Ⓖ | Running"
      subtitle="Task. compute_shader_pipeline"
      width={310}
      initialX={790}
      initialY={612}
      zIndex={11}
    >
      <box direction="row" gap={space[2]} alignY="center">
        <ChromeDot color={T.warm} />
        <text color={T.textPrimary} fontSize={12}>Task. compute_shader_pipeline</text>
      </box>
      <Rule />
      <box direction="column" gap={space[2]}>
        {logs.map((log) => (
          <box paddingY={2}><text color={T.textSecondary} fontSize={10}>{log}</text></box>
        ))}
      </box>
      <Rule />
      <box direction="row" gap={space[2]} alignY="center" backgroundColor={0xffffff04} borderColor={T.borderSoft} borderWidth={1} cornerRadius={radius.sm} padding={space[2]}>
        <text color={T.textDim} fontSize={10}>⌁</text>
        <text color={T.textMuted} fontSize={10}>/</text>
      </box>
    </ShaderPanel>
  )
}

function App(props: { transmissionMode: string }) {
  let rootRef: NodeHandle | undefined
  let dumpedTree = false

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
      {LIGHTCODE_SHOW_HUD ? <DebugHud /> : null}
      {LIGHTCODE_STAGE >= 1 ? <NodeGraph /> : null}
      {LIGHTCODE_STAGE >= 2 ? <WorkspaceHeader /> : null}
      {LIGHTCODE_STAGE >= 3 ? <WorkspaceFooter transmissionMode={props.transmissionMode} /> : null}
      {LIGHTCODE_STAGE >= 4 ? <MemoryPanel /> : null}
      {LIGHTCODE_STAGE >= 5 ? <EditorPanel /> : null}
      {LIGHTCODE_STAGE >= 6 ? <DiffPanel /> : null}
      {LIGHTCODE_STAGE >= 6 ? <AgentPanel /> : null}
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
      partialUpdates: false,
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
      appendFileSync(
        PERF_LOG,
        `fps=${debugState.fps} ms=${debugState.frameTimeMs} layers=${debugState.layerCount} dirtyBefore=${debugState.dirtyBeforeCount} repainted=${debugState.repaintedCount} cmds=${debugState.commandCount} nodes=${debugState.nodeCount}\n`,
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
