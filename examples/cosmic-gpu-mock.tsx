/** @jsxImportSource solid-js */

import { createTerminal } from "@tge/terminal"
import {
  mount,
  onInput,
  probeWgpuCanvasBridge,
  useTerminalDimensions,
  type CanvasContext,
  type MountHandle,
} from "@tge/renderer-solid"
import { setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"
import type { JSX } from "solid-js"

type ViewportValue = {
  x: number
  y: number
  zoom: number
}

type CanvasNodeProps = {
  width?: number | string
  height?: number | string
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  zIndex?: number
  opacity?: number
  layer?: boolean
  onDraw?: (ctx: CanvasContext) => void
  viewport?: ViewportValue
}

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      canvas: CanvasNodeProps
    }
  }
}

interface AppProps {
  terminal: Awaited<ReturnType<typeof createTerminal>>
  onExit: () => void
}

interface PanelProps {
  x: number
  y: number
  w: number
  h: number
  title: string
  subtitle?: string
  accent?: number
  children: JSX.Element
}

interface ChipProps {
  label: string
  active?: boolean
  accent?: number
}

interface TagProps {
  x: number
  y: number
  label: string
  tone?: number
}

interface GraphPoint {
  x: number
  y: number
}

interface GraphNode {
  id: string
  x: number
  y: number
  size: number
  sides: number
  rotation: number
  fill: number
  stroke: number
  glow?: number
  label?: string
}

const COLORS = {
  black: 0x050608ff,
  frame: 0x0c0e12f2,
  frameStroke: 0xffffff18,
  panel: 0x11141bdd,
  panelEdge: 0xffffff24,
  panelSoft: 0xffffff10,
  text: 0xf4f0e6ff,
  textSoft: 0xd4cdbdff,
  textMuted: 0x8a8f99ff,
  gold: 0xf0c470ff,
  goldSoft: 0xc9974fff,
  goldDim: 0x8b673cff,
  amberGlow: 0xffc768dd,
  warmLine: 0xf5d2a37a,
  coolLine: 0xb9d2ff5c,
  nodeFill: 0x858b96aa,
  nodeStroke: 0xf3f6ffcc,
  nodeSoft: 0xb8c1d266,
  diffRed: 0x8d3d37aa,
  success: 0x7fd2adff,
  deepBlue: 0x0b1220ff,
  glass: 0x161922b8,
} as const

const CODE = [
  "func compute_shader_pipeline(engine,",
  "",
  "  const compute_shader = shader) {",
  "    let color = i, 0, 0, 1;",
  "    let coeff = 0;",
  "    let p: 712 = 0;",
  "",
  "    if (memory::vertex_buffer)",
  "      coef = coeff[0x0)",
  "      color = (coeff.x * memory.x), a0);",
  "",
  "    else if",
  "      memory::camera_matrix [0, 1];",
  "  }",
] as const

const MEMORY_LINES = [
  "LC_TOKENS : accentGolden.focusView",
  "",
  "bufferSize      868.3704      buffer > [396]",
  "",
  "References",
  "  functinc_buffer_init()                     25",
  "  buffer.size  /  buntil ziq                 33",
] as const

const AGENT_LINES = [
  "Task. compute_shader_pipeline",
  "",
  "Status   - Success",
  "GpuUnit  - Buffer",
  "",
  "· File batch ponoind 12.60, 7/66",
  "· Spreter pipeline cucesterd by com plecied.",
] as const

const DIFF_LINES = [
  "import lightcompute;",
  "import lighhcoonpcute;",
  "",
  "type: EngCnistamett. LightcongEnects.zig",
] as const

const GRAPH: {
  center: GraphPoint
  nodes: GraphNode[]
  arcs: [GraphPoint, GraphPoint, GraphPoint][]
  mesh: [GraphPoint, GraphPoint][]
} = {
  center: { x: 0.43, y: 0.47 },
  nodes: [
    { id: "lightengine", x: 0.13, y: 0.43, size: 12, sides: 6, rotation: 30, fill: 0x2f3643d0, stroke: 0xdfe8f4c2, label: "Lightengine.sig" },
    { id: "vertex-a", x: 0.18, y: 0.61, size: 22, sides: 6, rotation: 30, fill: 0x737b87b0, stroke: 0xe8edf7d0, label: "Vertex Buffer" },
    { id: "vertex-b", x: 0.31, y: 0.33, size: 19, sides: 6, rotation: 30, fill: 0x808791b0, stroke: 0xe8edf7d0, label: "Vertex Buffer" },
    { id: "dispatch", x: 0.31, y: 0.50, size: 17, sides: 6, rotation: 30, fill: 0x757c88b0, stroke: 0xe8edf7d0, label: "Dispatch Pointer" },
    { id: "shader", x: 0.44, y: 0.22, size: 12, sides: 8, rotation: 0, fill: 0x2e323ad8, stroke: 0xf1f4f8d0, glow: 0x00000000, label: "LightEngine zig" },
    { id: "top-right", x: 0.62, y: 0.12, size: 16, sides: 6, rotation: 30, fill: 0x808791b0, stroke: 0xe8edf7d0 },
    { id: "camera", x: 0.38, y: 0.75, size: 18, sides: 6, rotation: 30, fill: 0x818996aa, stroke: 0xe8edf7d0, label: "Cameta Ploms" },
    { id: "fragments", x: 0.45, y: 0.72, size: 14, sides: 8, rotation: 22, fill: 0x8d847ab8, stroke: 0xe8edf7cc, label: "0 8 fenggs" },
    { id: "runner", x: 0.52, y: 0.88, size: 12, sides: 6, rotation: 30, fill: 0x4a3124d8, stroke: 0xf0bf86dd, label: "Runner" },
    { id: "dot", x: 0.50, y: 0.82, size: 8, sides: 6, rotation: 30, fill: 0x8ea2b7cc, stroke: 0xd8efffcc },
  ],
  arcs: [
    [{ x: 0.20, y: 0.44 }, { x: 0.30, y: 0.38 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.18, y: 0.61 }, { x: 0.30, y: 0.60 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.31, y: 0.50 }, { x: 0.37, y: 0.54 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.44, y: 0.22 }, { x: 0.44, y: 0.35 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.62, y: 0.12 }, { x: 0.58, y: 0.27 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.38, y: 0.75 }, { x: 0.40, y: 0.65 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.45, y: 0.72 }, { x: 0.44, y: 0.62 }, { x: 0.43, y: 0.47 }],
    [{ x: 0.52, y: 0.88 }, { x: 0.51, y: 0.72 }, { x: 0.43, y: 0.47 }],
  ],
  mesh: [
    [{ x: 0.13, y: 0.43 }, { x: 0.44, y: 0.22 }],
    [{ x: 0.18, y: 0.61 }, { x: 0.31, y: 0.50 }],
    [{ x: 0.31, y: 0.33 }, { x: 0.62, y: 0.12 }],
    [{ x: 0.31, y: 0.50 }, { x: 0.45, y: 0.72 }],
    [{ x: 0.38, y: 0.75 }, { x: 0.52, y: 0.88 }],
    [{ x: 0.31, y: 0.33 }, { x: 0.18, y: 0.61 }],
    [{ x: 0.44, y: 0.22 }, { x: 0.62, y: 0.12 }],
  ],
}

function WindowPanel(props: PanelProps) {
  const accent = props.accent ?? COLORS.gold

  return (
    <box
      floating="parent"
      floatOffset={{ x: props.x, y: props.y }}
      width={props.w}
      height={props.h}
      zIndex={20}
      layer
      backgroundColor={COLORS.panel}
      borderColor={COLORS.panelEdge}
      borderWidth={1}
      cornerRadius={16}
      backdropBlur={14}
      backdropBrightness={112}
      shadow={[
        { x: 0, y: 18, blur: 34, color: 0x000000b8 },
        { x: 0, y: 0, blur: 16, color: 0xffffff08 },
      ]}
      gradient={{ type: "linear", from: 0x1d2027f4, to: 0x0b0d11f1, angle: 90 }}
    >
      <box
        width="100%"
        height={34}
        direction="row"
        alignY="center"
        alignX="space-between"
        paddingLeft={14}
        paddingRight={12}
        borderBottom={1}
        borderColor={COLORS.panelSoft}
        backgroundColor={0xffffff05}
        cornerRadii={{ tl: 16, tr: 16, br: 0, bl: 0 }}
      >
        <box direction="row" alignY="center" gap={10}>
          <text color={accent} fontSize={12}>▤</text>
          <text color={COLORS.text} fontSize={11}>{props.title}</text>
          <text color={COLORS.textMuted} fontSize={11}>{props.subtitle ?? ""}</text>
        </box>
        <box direction="row" gap={10}>
          <text color={COLORS.textMuted} fontSize={10}>⟡</text>
          <text color={COLORS.textMuted} fontSize={10}>◦</text>
          <text color={COLORS.textMuted} fontSize={10}>×</text>
        </box>
      </box>
      <box width="100%" height="grow" padding={12}>
        {props.children}
      </box>
    </box>
  )
}

function Chip(props: ChipProps) {
  const bg = props.active ? 0x171a20ff : 0x101217e8
  const stroke = props.active ? 0xffffff1e : 0xffffff10
  const text = props.active ? COLORS.text : COLORS.textSoft
  const accent = props.accent ?? COLORS.gold

  return (
    <box
      paddingLeft={12}
      paddingRight={12}
      height={26}
      direction="row"
      alignY="center"
      backgroundColor={bg}
      borderColor={stroke}
      borderWidth={1}
      cornerRadius={7}
      shadow={{ x: 0, y: 6, blur: 10, color: 0x00000064 }}
    >
      <text color={props.active ? accent : text} fontSize={11}>{props.label}</text>
    </box>
  )
}

function GraphTag(props: TagProps) {
  return (
    <box
      floating="parent"
      floatOffset={{ x: props.x, y: props.y }}
      zIndex={18}
      paddingLeft={7}
      paddingRight={7}
      height={20}
      backgroundColor={0x090b10b0}
      borderColor={0xffffff10}
      borderWidth={1}
      cornerRadius={6}
      backdropBlur={8}
    >
      <text color={props.tone ?? COLORS.text} fontSize={10}>{props.label}</text>
    </box>
  )
}

function drawBackdrop(ctx: CanvasContext, w: number, h: number) {
  ctx.rect(0, 0, w, h, { fill: 0x0a0d12ff })
  ctx.linearGradient(0, 0, w, h, 0x131722ff, 0x050608ff, 90)
  ctx.nebula(0, 0, w, h, [
    { color: 0x00000000, position: 0 },
    { color: 0x182238c8, position: 0.25 },
    { color: 0x4d576fb0, position: 0.52 },
    { color: 0x0e1118ea, position: 1 },
  ], {
    seed: 31,
    scale: Math.max(180, Math.round(w * 0.16)),
    octaves: 5,
    gain: 58,
    lacunarity: 220,
    warp: 56,
    detail: 74,
    dust: 52,
  })
  ctx.nebula(0, 0, w, h, [
    { color: 0x00000000, position: 0 },
    { color: 0x6e4a34a4, position: 0.42 },
    { color: 0xc78754a8, position: 0.74 },
    { color: 0x00000000, position: 1 },
  ], {
    seed: 7,
    scale: Math.max(210, Math.round(w * 0.14)),
    octaves: 4,
    gain: 48,
    lacunarity: 210,
    warp: 68,
    detail: 66,
    dust: 38,
  })
  ctx.starfield(0, 0, w, h, {
    seed: 18,
    count: Math.max(460, Math.round(w * h * 0.00046)),
    clusterCount: 7,
    clusterStars: 48,
    warmColor: 0xfce4bbf0,
    neutralColor: 0xffffffff,
    coolColor: 0xc8defff0,
  })
  ctx.glow(w * 0.44, h * 0.50, w * 0.20, h * 0.15, 0xe8a85470, 76)
  ctx.glow(w * 0.17, h * 0.18, w * 0.16, h * 0.11, 0xb7d9ff52, 60)
  ctx.glow(w * 0.84, h * 0.76, w * 0.14, h * 0.10, 0xe0b06a40, 52)
  ctx.circle(w * 0.23, h * 0.20, 48, { fill: 0xffffff12, glow: { color: 0xdde9ff3c, radius: 52, intensity: 72 } })
  ctx.circle(w * 0.48, h * 0.49, 36, { fill: 0xffcb6e18, glow: { color: 0xffc86556, radius: 58, intensity: 82 } })

  let i = 0
  while (i < 24) {
    const px = (i * 67 % 1000) / 1000
    const py = (i * 151 % 1000) / 1000
    ctx.circle(px * w, py * h, i % 4 === 0 ? 2.2 : 1.1, {
      fill: i % 5 === 0 ? 0xffe4bcf0 : 0xf4f8ffcc,
      glow: { color: i % 5 === 0 ? 0xf2be6e66 : 0xe7f1ff44, radius: 6, intensity: 62 },
    })
    i += 1
  }
}

function scalePoint(point: GraphPoint, w: number, h: number): GraphPoint {
  return { x: point.x * w, y: point.y * h }
}

function drawGraph(ctx: CanvasContext, w: number, h: number) {
  GRAPH.mesh.forEach((pair, index) => {
    const from = scalePoint(pair[0], w, h)
    const to = scalePoint(pair[1], w, h)
    ctx.line(from.x, from.y, to.x, to.y, {
      color: index % 2 === 0 ? 0xa8c6ff48 : 0xf3ddb15a,
      width: 1.2,
    })
  })

  GRAPH.arcs.forEach((arc, index) => {
    const start = scalePoint(arc[0], w, h)
    const mid = scalePoint(arc[1], w, h)
    const end = scalePoint(arc[2], w, h)
    ctx.bezier(start.x, start.y, mid.x, mid.y, end.x, end.y, {
      color: index % 2 === 0 ? 0xf5d2a39a : 0xb9d2ff7e,
      width: index < 3 ? 2.2 : 1.5,
    })
  })

  const center = scalePoint(GRAPH.center, w, h)
  ctx.glow(center.x, center.y, 110, 80, 0xffc85c6e, 88)
  ctx.glow(center.x, center.y, 44, 36, 0xffcf7060, 98)
  ctx.polygon(center.x, center.y, 28, 4, {
    rotation: 45,
    fill: 0xeebf59fa,
    stroke: 0xfff1cbff,
    strokeWidth: 2,
    glow: { color: 0xffcf6eac, radius: 24, intensity: 96 },
  })
  ctx.polygon(center.x, center.y, 17, 4, {
    rotation: 45,
    fill: 0xffcf77ff,
    stroke: 0xfffff1ff,
    strokeWidth: 1,
  })

  GRAPH.nodes.forEach((node, index) => {
    const px = node.x * w
    const py = node.y * h
    if (index % 3 === 0) {
      ctx.glow(px, py, node.size + 8, node.size + 8, 0xd8e7ff20, 30)
    }
    ctx.polygon(px, py, node.size, node.sides, {
      rotation: node.rotation,
      fill: node.fill,
      stroke: node.stroke,
      strokeWidth: 1,
      glow: node.glow ? { color: node.glow, radius: 14, intensity: 78 } : undefined,
    })
  })

  ctx.line(center.x, center.y, w * 0.56, h * 0.47, { color: 0xffcd7744, width: 2 })
  ctx.line(center.x, center.y, w * 0.70, h * 0.18, { color: 0xffcd7740, width: 1.3 })
  ctx.glow(w * 0.70, h * 0.18, 7, 7, 0xffc97888, 70)
  ctx.circle(w * 0.70, h * 0.18, 2, { fill: 0xffedc6ff })
  ctx.glow(w * 0.30, h * 0.43, 6, 6, 0xffffff50, 58)
  ctx.circle(w * 0.30, h * 0.43, 2, { fill: 0xffffffff })
}

function App(props: AppProps) {
  const dims = useTerminalDimensions(props.terminal)

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "escape" || event.key === "q") props.onExit()
  })

  const frameX = () => Math.round(dims.width() * 0.035)
  const frameY = () => Math.round(dims.height() * 0.074)
  const frameW = () => Math.round(dims.width() * 0.93)
  const frameH = () => Math.round(dims.height() * 0.82)
  const topH = () => 44
  const bottomH = () => 30
  const innerW = () => frameW() - 2
  const contentH = () => frameH() - topH() - bottomH() - 2

  const drawScene = (ctx: CanvasContext) => {
    const w = innerW()
    const h = contentH()
    drawBackdrop(ctx, w, h)
    drawGraph(ctx, w, h)
  }

  return (
    <box width="100%" height="100%" backgroundColor={COLORS.black}>
      <box
        floating="root"
        floatOffset={{ x: 0, y: 0 }}
        width="100%"
        height="100%"
        zIndex={-30}
        backgroundColor={0x000000ff}
        gradient={{ type: "radial", from: 0x121318ff, to: 0x020304ff }}
      />

      <box
        width={frameW()}
        height={frameH()}
        floatOffset={{ x: frameX(), y: frameY() }}
        floating="root"
        layer
        backgroundColor={COLORS.frame}
        borderColor={COLORS.frameStroke}
        borderWidth={1}
        cornerRadius={2}
        shadow={[
          { x: 0, y: 22, blur: 44, color: 0x000000d2 },
          { x: 0, y: 0, blur: 22, color: 0xffffff06 },
        ]}
      >
        <box
          width="100%"
          height={topH()}
          direction="row"
          alignY="center"
          gap={10}
          paddingLeft={16}
          paddingRight={16}
          borderBottom={1}
          borderColor={0xffffff0e}
          backgroundColor={0x0b0d11d8}
        >
          <text color={COLORS.textSoft} fontSize={14}>☰</text>
          <Chip label="Compute Shaders" active accent={COLORS.text} />
          <Chip label="v_engine.zig" accent={COLORS.gold} />
        </box>

        <box width="100%" height={contentH()} backgroundColor={0x06080bff}>
          <canvas width="100%" height="100%" layer onDraw={drawScene} />

          <GraphTag x={88} y={162} label="Lightengine.sig" tone={0xd8dee8ff} />
          <GraphTag x={143} y={278} label="Vertex Buffer" />
          <GraphTag x={286} y={86} label="Vercle Buffer" />
          <GraphTag x={286} y={205} label="Dispatch Pointer" />
          <GraphTag x={432} y={35} label="LightEngine zig" />
          <GraphTag x={382} y={358} label="Cameta Ploms" />
          <GraphTag x={458} y={356} label="0 8 fenggs" />
          <GraphTag x={470} y={492} label="Runner" tone={0xf0e4d0ff} />

          <box
            floating="parent"
            floatOffset={{ x: 386, y: 206 }}
            zIndex={24}
            width={208}
            height={56}
            backgroundColor={0x5e432ad0}
            borderColor={0xffd39a88}
            borderWidth={1}
            cornerRadius={10}
            backdropBlur={10}
            shadow={[
              { x: 0, y: 0, blur: 18, color: 0xffc86d36 },
              { x: 0, y: 8, blur: 20, color: 0x00000090 },
            ]}
            gradient={{ type: "linear", from: 0x7a5635ef, to: 0x3d2b1cf2, angle: 90 }}
          >
            <box padding={10} gap={2}>
              <text color={0xfff0d6ff} fontSize={11}>Task: compute_shader_pipeline</text>
              <text color={0xf4d4a8ff} fontSize={10}>Type: compute</text>
            </box>
          </box>

          <WindowPanel x={Math.round(innerW() * 0.71)} y={18} w={414} h={242} title="Diff / Changes" accent={COLORS.textSoft}>
            <box gap={8}>
              <box
                width="100%"
                height={30}
                direction="row"
                alignY="center"
                paddingLeft={12}
                paddingRight={10}
                backgroundColor={0xffffff07}
                borderColor={0xffffff10}
                borderWidth={1}
                cornerRadius={8}
              >
                <text color={COLORS.gold} fontSize={11}>↳</text>
                <text color={0xf7dca6ff} fontSize={11}>  LightEngine.zig</text>
              </box>
              <box gap={4} backgroundColor={0x090b10d8} borderColor={0xffffff0c} borderWidth={1} cornerRadius={8} padding={10}>
                {DIFF_LINES.map((line, index) => (
                  <box
                    height={18}
                    paddingLeft={8}
                    direction="row"
                    alignY="center"
                    backgroundColor={index === 3 ? COLORS.diffRed : 0x00000000}
                    cornerRadius={4}
                  >
                    <text color={COLORS.textMuted} fontSize={10}>{index + 1}</text>
                    <text color={index === 3 ? 0xf8c0b7ff : 0xd8d1c4ff} fontSize={10}>  {line}</text>
                  </box>
                ))}
              </box>
              <box width="100%" direction="row" alignX="right">
                <box
                  width={96}
                  height={28}
                  direction="row"
                  alignX="center"
                  alignY="center"
                  backgroundColor={0x554122ff}
                  borderColor={0xffd69488}
                  borderWidth={1}
                  cornerRadius={8}
                  shadow={{ x: 0, y: 0, blur: 14, color: 0xffc86d26 }}
                >
                  <text color={0xfff0d2ff} fontSize={10}>Swap Changes</text>
                </box>
              </box>
            </box>
          </WindowPanel>

          <WindowPanel x={Math.round(innerW() * 0.50)} y={154} w={508} h={336} title="v_engine.zig" accent={COLORS.text}>
            <box gap={10}>
              <box
                width="100%"
                height={34}
                direction="row"
                alignY="center"
                alignX="space-between"
                paddingLeft={14}
                paddingRight={12}
                backgroundColor={0xffffff08}
                borderColor={0xffffff12}
                borderWidth={1}
                cornerRadius={8}
              >
                <box direction="row" alignY="center" gap={10}>
                  <text color={COLORS.gold} fontSize={11}>⊡</text>
                  <text color={0xfbe2b3ff} fontSize={12}>Compute Shader Pipeline</text>
                </box>
                <box direction="row" gap={8}>
                  <text color={COLORS.textMuted} fontSize={10}>⟲</text>
                  <text color={COLORS.textMuted} fontSize={10}>✕</text>
                </box>
              </box>

              <box
                width="100%"
                height={224}
                backgroundColor={0x090b10ea}
                borderColor={0xffffff10}
                borderWidth={1}
                cornerRadius={10}
                paddingTop={10}
                paddingBottom={10}
                paddingLeft={14}
                paddingRight={14}
                gap={3}
              >
                {CODE.map((line, index) => (
                  <box height={15} direction="row" alignY="center">
                    <text color={0x626873ff} fontSize={10}>{String(index + 1).padStart(2, " ")}</text>
                    <text color={index === 0 ? 0xffdeb0ff : index === 2 ? 0xf0b68cff : 0xdad3c6ff} fontSize={10}>  {line}</text>
                  </box>
                ))}
              </box>

              <box width="100%" direction="row" alignY="center" alignX="space-between">
                <text color={COLORS.textMuted} fontSize={10}>◉  ↙  return v_engine</text>
                <box
                  width={106}
                  height={28}
                  direction="row"
                  alignX="center"
                  alignY="center"
                  backgroundColor={0x554122ff}
                  borderColor={0xffd69488}
                  borderWidth={1}
                  cornerRadius={8}
                >
                  <text color={0xfff0d2ff} fontSize={10}>⇦  Snup Change</text>
                </box>
              </box>
            </box>
          </WindowPanel>

          <WindowPanel x={22} y={Math.round(contentH() * 0.67)} w={324} h={220} title="Memory" accent={COLORS.gold}>
            <box gap={10}>
              <box height={24} direction="row" alignY="center">
                <text color={0xe7dfd3ff} fontSize={11}>{MEMORY_LINES[0]}</text>
              </box>
              <box
                width="100%"
                height={32}
                direction="row"
                alignY="center"
                paddingLeft={12}
                paddingRight={12}
                alignX="space-between"
                backgroundColor={0xffffff05}
                borderColor={0xffffff10}
                borderWidth={1}
                cornerRadius={8}
              >
                <text color={COLORS.gold} fontSize={11}>bufferSize</text>
                <text color={0xf0d3a5ff} fontSize={11}>868.3704</text>
                <text color={0xb3b8c0ff} fontSize={11}>buffer &gt; [396]</text>
              </box>
              <text color={0xd6d7dcff} fontSize={11}>References</text>
              <box gap={6}>
                {MEMORY_LINES.slice(5).map((line) => (
                  <box
                    width="100%"
                    height={24}
                    direction="row"
                    alignY="center"
                    paddingLeft={10}
                    backgroundColor={0xffffff04}
                    borderColor={0xffffff0c}
                    borderWidth={1}
                    cornerRadius={6}
                  >
                    <text color={0xb2c8e6ff} fontSize={10}>☷</text>
                    <text color={0xbec5d0ff} fontSize={10}>  {line}</text>
                  </box>
                ))}
              </box>
            </box>
          </WindowPanel>

          <WindowPanel x={Math.round(innerW() * 0.74)} y={Math.round(contentH() * 0.79)} w={330} h={170} title="Agent" subtitle="Running" accent={COLORS.text}>
            <box gap={10}>
              <box
                width="100%"
                height={30}
                direction="row"
                alignY="center"
                paddingLeft={12}
                backgroundColor={0xffffff06}
                borderColor={0xffffff10}
                borderWidth={1}
                cornerRadius={8}
              >
                <text color={0xf0d0a1ff} fontSize={11}>⌘</text>
                <text color={0xf2e6d2ff} fontSize={11}>  Task. compute_shader_pipeline</text>
              </box>
              {AGENT_LINES.slice(2).map((line, index) => (
                <text color={index < 2 ? 0xdfdad0ff : 0xbfc6cfef} fontSize={10}>{line}</text>
              ))}
              <box width="100%" height={20} backgroundColor={0xffffff04} borderColor={0xffffff0c} borderWidth={1} cornerRadius={6}>
                <box width={32} height="100%" floating="parent" floatOffset={{ x: 250, y: 0 }} backgroundColor={0x243142ff} cornerRadius={6} />
              </box>
            </box>
          </WindowPanel>
        </box>

        <box
          width="100%"
          height={bottomH()}
          direction="row"
          alignY="center"
          alignX="space-between"
          paddingLeft={14}
          paddingRight={14}
          borderTop={1}
          borderColor={0xffffff0e}
          backgroundColor={0x0b0d11ea}
        >
          <text color={COLORS.textSoft} fontSize={11}>⚡  L345  EC15  |  Zig  |  Lightcode v2.0</text>
          <text color={COLORS.text} fontSize={11}>Lightcode v2.0  ▾</text>
        </box>
      </box>

      <box
        floating="root"
        floatOffset={{ x: Math.max(0, dims.width() - 76), y: Math.max(0, dims.height() - 94) }}
        width={40}
        height={40}
        zIndex={26}
        backgroundColor={0x00000000}
      >
        <text color={0xe6e0d2aa} fontSize={30}>✦</text>
      </box>
    </box>
  )
}


const probe = probeWgpuCanvasBridge()
const canvasBackend = probe.available ? tryCreateWgpuCanvasPainterBackend() : null
setCanvasPainterBackend(canvasBackend)

const terminal = await createTerminal()

let handle: MountHandle | null = null

function shutdown() {
  if (handle) {
    handle.destroy()
    handle = null
  }
  setCanvasPainterBackend(null)
  process.exit(0)
}

handle = mount(() => <App terminal={terminal} onExit={shutdown} />, terminal, {
  maxFps: 60,
})

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
