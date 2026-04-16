import { createContext, useContext } from "solid-js"
import { createSignal, type Accessor, type JSX } from "solid-js"
import { markDirty, useDrag, type CanvasContext, type NodeHandle } from "@tge/renderer"

export interface RetainedGraphPoint {
  x: number
  y: number
}

export interface RetainedGraphViewport {
  x: number
  y: number
  zoom: number
}

const GRAPH_SHAPE = {
  CIRCLE: "circle",
  HEXAGON: "hexagon",
  DIAMOND: "diamond",
  OCTAGON: "octagon",
} as const

export type RetainedGraphShape = (typeof GRAPH_SHAPE)[keyof typeof GRAPH_SHAPE] | number

interface RetainedGraphContextValue {
  width: Accessor<number>
  height: Accessor<number>
  viewport: Accessor<RetainedGraphViewport>
  rootHandle: Accessor<NodeHandle | null>
  screenToWorld: (x: number, y: number) => RetainedGraphPoint
  worldToLocal: (x: number, y: number) => RetainedGraphPoint
}

const RetainedGraphContext = createContext<RetainedGraphContextValue>()

function getGraphContext() {
  const ctx = useContext(RetainedGraphContext)
  if (!ctx) throw new Error("RetainedGraph primitives must be used inside <RetainedGraph>")
  return ctx
}

function resolveAccessorValue<T>(value: Accessor<T> | T) {
  return typeof value === "function" ? (value as Accessor<T>)() : value
}

function measureLabelWidth(text?: string) {
  if (!text) return 0
  return text.length * 7
}

function drawRetainedNode(ctx: CanvasContext, props: RetainedGraphNodeProps, x: number, y: number, radius: number) {
  const selected = props.selected?.() ?? false
  const sides = typeof props.shape === "number" ? props.shape
    : props.shape === GRAPH_SHAPE.HEXAGON ? 6
    : props.shape === GRAPH_SHAPE.DIAMOND ? 4
    : props.shape === GRAPH_SHAPE.OCTAGON ? 8
    : 0
  const rotation = props.shape === GRAPH_SHAPE.DIAMOND ? 45 : sides >= 6 ? 30 : 0

  if (props.glow) {
    const gl = props.glow
    const outerR = selected ? gl.radius * 2 : gl.radius
    const outerI = selected ? gl.intensity * 0.7 : gl.intensity * 0.4
    const outerA = Math.round((gl.color & 0xff) * 0.4)
    const outerColor = ((gl.color & 0xffffff00) | outerA) >>> 0
    ctx.glow(x, y, radius + outerR, radius + outerR, outerColor, Math.round(outerI))

    const innerA = Math.round((gl.color & 0xff) * 0.7)
    const innerColor = ((gl.color & 0xffffff00) | innerA) >>> 0
    ctx.glow(x, y, radius + 5, radius + 5, innerColor, selected ? gl.intensity : Math.round(gl.intensity * 0.5))
  }

  if (sides > 0) {
    ctx.polygon(x, y, radius, sides, {
      fill: props.fill,
      stroke: props.stroke,
      strokeWidth: props.strokeWidth ?? (selected ? 3 : 2),
      rotation,
    })
  } else {
    ctx.circle(x, y, radius, {
      fill: props.fill,
      stroke: props.stroke,
      strokeWidth: props.strokeWidth ?? (selected ? 3 : 2),
    })
  }

  if (selected && props.glow) {
    const pulseColor = ((props.stroke & 0xffffff00) | 14) >>> 0
    ctx.glow(x, y, radius + 45, radius + 45, pulseColor, 35)
  }

  if (props.label) {
    const labelWidth = measureLabelWidth(props.label)
    ctx.text(x - Math.round(labelWidth / 2), y - (props.sublabel ? 6 : 4), props.label, props.labelColor ?? 0xeeeeeeff)
  }

  if (props.sublabel) {
    const sublabelWidth = measureLabelWidth(props.sublabel)
    ctx.text(x - Math.round(sublabelWidth / 2), y + 8, props.sublabel, props.sublabelColor ?? 0x666680ff)
  }

  if (props.statusDot) {
    const dotX = x + Math.round(radius * 0.55)
    const dotY = y - Math.round(radius * 0.65)
    if (props.statusDot.glow) {
      ctx.glow(dotX, dotY, 10, 10, ((props.statusDot.color & 0xffffff00) | 0x40) >>> 0, 50)
    }
    ctx.circle(dotX, dotY, 5, { fill: props.statusDot.color })
  }
}

function createBezier(from: RetainedGraphPoint, to: RetainedGraphPoint, curvature?: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return { cpx: from.x, cpy: from.y }
  const bend = curvature ?? 0.1
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  return {
    cpx: mx + (-dy / len) * (len * bend),
    cpy: my + (dx / len) * (len * bend),
  }
}

export interface RetainedGraphProps {
  width: number
  height: number
  viewport?: RetainedGraphViewport
  children?: JSX.Element
}

export function RetainedGraph(props: RetainedGraphProps) {
  const [rootHandle, setRootHandle] = createSignal<NodeHandle | null>(null)

  function getViewport() {
    return props.viewport ?? { x: 0, y: 0, zoom: 1 }
  }

  function screenToWorld(x: number, y: number) {
    const root = rootHandle()
    const vp = getViewport()
    const rootX = root?.layout.x ?? 0
    const rootY = root?.layout.y ?? 0
    return {
      x: (x - rootX) / vp.zoom + vp.x,
      y: (y - rootY) / vp.zoom + vp.y,
    }
  }

  function worldToLocal(x: number, y: number) {
    const vp = getViewport()
    return {
      x: (x - vp.x) * vp.zoom,
      y: (y - vp.y) * vp.zoom,
    }
  }

  return (
    <RetainedGraphContext.Provider value={{
      width: () => props.width,
      height: () => props.height,
      viewport: getViewport,
      rootHandle,
      screenToWorld,
      worldToLocal,
    }}>
      <box ref={setRootHandle} width={props.width} height={props.height}>
        {props.children}
      </box>
    </RetainedGraphContext.Provider>
  )
}

export interface RetainedGraphFieldProps {
  id: string
  zIndex?: number
  onDraw: (ctx: CanvasContext, size: { width: number; height: number }, viewport: RetainedGraphViewport) => void
}

export function RetainedGraphField(props: RetainedGraphFieldProps) {
  const graph = getGraphContext()

  return (
    <box layer floating="parent" floatOffset={{ x: 0, y: 0 }} zIndex={props.zIndex ?? 0} width={graph.width()} height={graph.height()} pointerPassthrough>
      <surface
        width={graph.width()}
        height={graph.height()}
        onDraw={(ctx) => props.onDraw(ctx, { width: graph.width(), height: graph.height() }, graph.viewport())}
      />
    </box>
  )
}

export interface RetainedGraphEdgeProps {
  id: string
  from: Accessor<RetainedGraphPoint> | RetainedGraphPoint
  to: Accessor<RetainedGraphPoint> | RetainedGraphPoint
  color: number
  width?: number
  glow?: boolean
  glowWidth?: number
  curvature?: number
  zIndex?: number
}

export function RetainedGraphEdge(props: RetainedGraphEdgeProps) {
  const graph = getGraphContext()
  const from = () => {
    const point = resolveAccessorValue(props.from)
    return graph.worldToLocal(point.x, point.y)
  }
  const to = () => {
    const point = resolveAccessorValue(props.to)
    return graph.worldToLocal(point.x, point.y)
  }
  const lineWidth = () => props.width ?? 1
  const glowWidth = () => props.glowWidth ?? Math.max(lineWidth() * 5, 6)
  const pad = () => Math.max(glowWidth(), lineWidth(), 24)

  const bounds = () => {
    const fromPoint = from()
    const toPoint = to()
    const bezier = createBezier(fromPoint, toPoint, props.curvature)
    const left = Math.floor(Math.min(fromPoint.x, bezier.cpx, toPoint.x) - pad())
    const top = Math.floor(Math.min(fromPoint.y, bezier.cpy, toPoint.y) - pad())
    const right = Math.ceil(Math.max(fromPoint.x, bezier.cpx, toPoint.x) + pad())
    const bottom = Math.ceil(Math.max(fromPoint.y, bezier.cpy, toPoint.y) + pad())
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      from: { x: fromPoint.x - left, y: fromPoint.y - top },
      to: { x: toPoint.x - left, y: toPoint.y - top },
    }
  }

  return (
    <box layer floating="parent" floatOffset={{ x: bounds().x, y: bounds().y }} zIndex={props.zIndex ?? 10} width={bounds().width} height={bounds().height} pointerPassthrough>
      <surface
        width={bounds().width}
        height={bounds().height}
        onDraw={(ctx) => {
          const edgeBounds = bounds()
          const bezier = createBezier(edgeBounds.from, edgeBounds.to, props.curvature)
          if (props.glow !== false) {
            const glowAlpha = props.color & 0xff
            const glowColor = ((props.color & 0xffffff00) | Math.round(glowAlpha * 0.3)) >>> 0
            ctx.bezier(edgeBounds.from.x, edgeBounds.from.y, bezier.cpx, bezier.cpy, edgeBounds.to.x, edgeBounds.to.y, { color: glowColor, width: glowWidth() })
          }
          ctx.bezier(edgeBounds.from.x, edgeBounds.from.y, bezier.cpx, bezier.cpy, edgeBounds.to.x, edgeBounds.to.y, { color: props.color, width: lineWidth() })
        }}
      />
    </box>
  )
}

export interface RetainedGraphNodeProps {
  id: string
  x: Accessor<number> | number
  y: Accessor<number> | number
  radius: number
  shape?: RetainedGraphShape
  fill: number
  stroke: number
  strokeWidth?: number
  glow?: { color: number; radius: number; intensity: number }
  selected?: Accessor<boolean>
  label?: string
  sublabel?: string
  labelColor?: number
  sublabelColor?: number
  statusDot?: { color: number; glow?: boolean }
  zIndex?: number
  onSelect?: () => void
  onDrag?: (x: number, y: number) => void
}

export function RetainedGraphNode(props: RetainedGraphNodeProps) {
  const graph = getGraphContext()
  const x = () => typeof props.x === "function" ? props.x() : props.x
  const y = () => typeof props.y === "function" ? props.y() : props.y
  let dragOffsetX = 0
  let dragOffsetY = 0

  const projected = () => graph.worldToLocal(x(), y())
  const radius = () => props.radius * graph.viewport().zoom
  const labelWidth = () => Math.max(measureLabelWidth(props.label), measureLabelWidth(props.sublabel))
  const pad = () => radius() + (props.glow ? props.glow.radius * 2 : 0) + Math.ceil(labelWidth() / 2) + 24
  const bounds = () => ({
    x: Math.round(projected().x - pad()),
    y: Math.round(projected().y - pad()),
    width: Math.max(1, Math.round(pad() * 2)),
    height: Math.max(1, Math.round(pad() * 2)),
    centerX: Math.round(pad()),
    centerY: Math.round(pad()),
  })

  const { dragProps } = useDrag({
    onDragStart: (event) => {
      props.onSelect?.()
      const world = graph.screenToWorld(event.x, event.y)
      dragOffsetX = world.x - x()
      dragOffsetY = world.y - y()
    },
    onDrag: (event) => {
      if (!props.onDrag) return
      const world = graph.screenToWorld(event.x, event.y)
      props.onDrag(world.x - dragOffsetX, world.y - dragOffsetY)
      markDirty()
    },
  })

  return (
    <box
      {...dragProps}
      layer
      floating="parent"
      floatOffset={{ x: bounds().x, y: bounds().y }}
      zIndex={props.zIndex ?? 20}
      width={bounds().width}
      height={bounds().height}
    >
      <surface
        width={bounds().width}
        height={bounds().height}
        onDraw={(ctx) => drawRetainedNode(ctx, props, bounds().centerX, bounds().centerY, radius())}
      />
    </box>
  )
}

export interface RetainedGraphOverlayBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RetainedGraphOverlayProps {
  id: string
  bounds: Accessor<RetainedGraphOverlayBounds> | RetainedGraphOverlayBounds
  zIndex?: number
  onDraw: (ctx: CanvasContext, bounds: RetainedGraphOverlayBounds) => void
}

export function RetainedGraphOverlay(props: RetainedGraphOverlayProps) {
  const graph = getGraphContext()
  const worldBounds = () => resolveAccessorValue(props.bounds)
  const projectedBounds = () => {
    const world = worldBounds()
    const local = graph.worldToLocal(world.x, world.y)
    const zoom = graph.viewport().zoom
    return {
      x: Math.round(local.x),
      y: Math.round(local.y),
      width: Math.max(1, Math.round(world.width * zoom)),
      height: Math.max(1, Math.round(world.height * zoom)),
    }
  }

  return (
    <box layer floating="parent" floatOffset={{ x: projectedBounds().x, y: projectedBounds().y }} zIndex={props.zIndex ?? 30} width={projectedBounds().width} height={projectedBounds().height} pointerPassthrough>
      <surface
        width={projectedBounds().width}
        height={projectedBounds().height}
        onDraw={(ctx) => props.onDraw(ctx, projectedBounds())}
      />
    </box>
  )
}
