/**
 * SceneCanvas — declarative 2D scene graph on top of <surface>.
 *
 * Instead of imperative onDraw callbacks, you describe WHAT's in the scene
 * and the component handles rendering, viewport transform, hit-testing,
 * and interaction.
 *
 * Architecture:
 *   <SceneCanvas> owns a <surface> and a scene registry.
 *   Scene primitives (<SceneNode>, <SceneEdge>, etc.) register themselves
 *   via context. Each frame, SceneCanvas walks the registry and draws
 *   everything in the correct order (background → edges → nodes → labels → overlay).
 *
 * Usage:
 *   <SceneCanvas
 *     viewport={{ x: panX(), y: panY(), zoom: zoom() }}
 *     background={(ctx) => { ctx.rect(0, 0, 2000, 2000, { fill: 0x0a0a14ff }) }}
 *     onViewportChange={({ panX, panY, zoom }) => { ... }}
 *   >
 *     <SceneEdge from={posA} to={posB} color={0x56d4c8ff} glow />
 *     <SceneNode
 *       x={node.x} y={node.y} radius={40}
 *       shape="hexagon" fill={0x1a1a30ff} stroke={0x56d4c8ff}
 *       glow={{ color: 0x56d4c860, radius: 25, intensity: 50 }}
 *       selected={isSelected()}
 *       onSelect={() => select(node.id)}
 *       onDrag={(x, y) => move(node.id, x, y)}
 *       label="Camera" sublabel="matrix"
 *     />
 *     <SceneParticles config={particleConfig} />
 *   </SceneCanvas>
 */

import { createSignal, createContext, useContext, onMount, onCleanup, createEffect } from "solid-js"
import type { JSX, Accessor } from "solid-js"
import { markDirty, createParticleSystem, useInteractionLayer } from "@tge/renderer"
import type { CanvasContext, NodeMouseEvent, ParticleConfig, ParticleSystem } from "@tge/renderer"
import type { InteractionBinding } from "@tge/renderer"

// ── Scene item types ──

export type SceneNodeDef = {
  id: string
  x: Accessor<number>
  y: Accessor<number>
  radius: number
  shape: "circle" | "hexagon" | "diamond" | "octagon" | number // number = polygon sides
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
  onSelect?: () => void
  onDrag?: (x: number, y: number) => void
}

export type SceneEdgeDef = {
  id: string
  from: Accessor<{ x: number; y: number }>
  to: Accessor<{ x: number; y: number }>
  color: number
  width?: number
  glow?: boolean
  glowWidth?: number
  curvature?: number // 0 = straight, 0.1 = default
}

export type SceneParticlesDef = {
  id: string
  config: ParticleConfig
}

type SceneOverlayDef = {
  id: string
  draw: (ctx: CanvasContext) => void
}

// ── Registry (context) ──

type SceneRegistry = {
  registerNode: (def: SceneNodeDef) => void
  unregisterNode: (id: string) => void
  registerEdge: (def: SceneEdgeDef) => void
  unregisterEdge: (id: string) => void
  registerParticles: (def: SceneParticlesDef) => void
  unregisterParticles: (id: string) => void
  registerOverlay: (def: SceneOverlayDef) => void
  unregisterOverlay: (id: string) => void
}

const SceneCtx = createContext<SceneRegistry>()

// ── SceneCanvas component ──

export type SceneCanvasProps = {
  /** Viewport: { x, y, zoom }. Control externally for pan/zoom. */
  viewport?: { x: number; y: number; zoom: number }
  /** Called when user pans/zooms via mouse. */
  onViewportChange?: (vp: { x: number; y: number; zoom: number }) => void
  /** Background draw callback — runs first, before edges/nodes. */
  background?: (ctx: CanvasContext) => void
  /** Foreground overlay — runs last, after everything. */
  overlay?: (ctx: CanvasContext) => void
  /** Enable built-in pan (drag on empty space) and zoom (scroll). Default: true. */
  interactive?: boolean
  /** Width/height props passed to the surface. */
  width?: number | string
  height?: number | string
  /** Interaction layer binding for drag-only promotion/freeze. */
  interaction?: InteractionBinding
  /** Children — <SceneNode>, <SceneEdge>, <SceneParticles> */
  children?: JSX.Element
}

export function SceneCanvas(props: SceneCanvasProps) {
  const interaction = useInteractionLayer()
  // ── Scene registries ──
  const nodeMap = new Map<string, SceneNodeDef>()
  const edgeMap = new Map<string, SceneEdgeDef>()
  const particleMap = new Map<string, { def: SceneParticlesDef; system: ParticleSystem }>()
  const overlayMap = new Map<string, SceneOverlayDef>()

  const registry: SceneRegistry = {
    registerNode: (def) => { nodeMap.set(def.id, def); markDirty() },
    unregisterNode: (id) => { nodeMap.delete(id); markDirty() },
    registerEdge: (def) => { edgeMap.set(def.id, def); markDirty() },
    unregisterEdge: (id) => { edgeMap.delete(id); markDirty() },
    registerParticles: (def) => {
      const system = createParticleSystem(def.config)
      particleMap.set(def.id, { def, system })
      markDirty()
    },
    unregisterParticles: (id) => { particleMap.delete(id); markDirty() },
    registerOverlay: (def) => { overlayMap.set(def.id, def); markDirty() },
    unregisterOverlay: (id) => { overlayMap.delete(id); markDirty() },
  }

  // ── Internal pan/zoom state (used when interactive) ──
  const [internalPanX, setInternalPanX] = createSignal(0)
  const [internalPanY, setInternalPanY] = createSignal(0)
  const [internalZoom, setInternalZoom] = createSignal(1)

  function getViewport() {
    return props.viewport ?? { x: internalPanX(), y: internalPanY(), zoom: internalZoom() }
  }

  function getViewportBounds() {
    if (typeof props.width !== "number" || typeof props.height !== "number") return null
    const vp = getViewport()
    return {
      left: vp.x,
      top: vp.y,
      right: vp.x + props.width / vp.zoom,
      bottom: vp.y + props.height / vp.zoom,
    }
  }

  // ── Animation tick for particles ──
  let tickInterval: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    tickInterval = setInterval(() => {
      for (const { system } of particleMap.values()) {
        system.tick(0.033)
      }
      if (particleMap.size > 0) markDirty()
    }, 33)
  })
  onCleanup(() => { if (tickInterval) clearInterval(tickInterval) })

  // ── Interaction state ──
  let dragTarget: string | null = null
  let isPanning = false
  let dragAnchorX = 0
  let dragAnchorY = 0
  let panAnchorX = 0
  let panAnchorY = 0

  function screenToWorld(sx: number, sy: number) {
    const vp = getViewport()
    return {
      x: sx / vp.zoom + vp.x,
      y: sy / vp.zoom + vp.y,
    }
  }

  function hitTestNode(worldX: number, worldY: number): string | null {
    // Reverse order — last registered = visually on top
    const entries = [...nodeMap.entries()].reverse()
    for (const [id, def] of entries) {
      const dx = worldX - def.x()
      const dy = worldY - def.y()
      if (dx * dx + dy * dy <= def.radius * def.radius) return id
    }
    return null
  }

  function handleMouseDown(evt: NodeMouseEvent) {
    const interactive = props.interactive !== false
    const world = screenToWorld(evt.nodeX, evt.nodeY)
    const hit = hitTestNode(world.x, world.y)

    if (hit) {
      const def = nodeMap.get(hit)
      if (def?.onSelect) def.onSelect()
      if (def?.onDrag) {
        dragTarget = hit
        dragAnchorX = world.x - def.x()
        dragAnchorY = world.y - def.y()
        const binding = props.interaction ?? "auto"
        if (binding === "auto") interaction.begin("drag")
        else if (binding !== "none") binding.begin("drag")
      }
    } else if (interactive) {
      isPanning = true
      panAnchorX = evt.x
      panAnchorY = evt.y
      const binding = props.interaction ?? "auto"
      if (binding === "auto") interaction.begin("drag")
      else if (binding !== "none") binding.begin("drag")
    }
  }

  function handleMouseMove(evt: NodeMouseEvent) {
    const vp = getViewport()

    if (dragTarget) {
      const def = nodeMap.get(dragTarget)
      if (def?.onDrag) {
        const world = screenToWorld(evt.nodeX, evt.nodeY)
        def.onDrag(world.x - dragAnchorX, world.y - dragAnchorY)
        markDirty()
      }
    } else if (isPanning) {
      const dx = (evt.x - panAnchorX) / vp.zoom
      const dy = (evt.y - panAnchorY) / vp.zoom
      const newX = vp.x - dx
      const newY = vp.y - dy
      panAnchorX = evt.x
      panAnchorY = evt.y

      if (props.onViewportChange) {
        props.onViewportChange({ x: newX, y: newY, zoom: vp.zoom })
      } else {
        setInternalPanX(newX)
        setInternalPanY(newY)
      }
      markDirty()
    }
  }

  function handleMouseUp() {
    if (dragTarget || isPanning) {
      const binding = props.interaction ?? "auto"
      if (binding === "auto") interaction.end("drag")
      else if (binding !== "none") binding.end("drag")
    }
    dragTarget = null
    isPanning = false
  }

  // ── Drawing ──

  function drawEdge(ctx: CanvasContext, def: SceneEdgeDef) {
    const from = def.from()
    const to = def.to()
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return

    const curvature = def.curvature ?? 0.1
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    const cpx = mx + (-dy / len) * (len * curvature)
    const cpy = my + (dx / len) * (len * curvature)

    const lineWidth = def.width ?? 1

    // Glow layer (wide, faint)
    if (def.glow !== false) {
      const glowAlpha = (def.color & 0xff) >>> 0
      const glowColor = ((def.color & 0xffffff00) | Math.round(glowAlpha * 0.3)) >>> 0
      const glowW = def.glowWidth ?? Math.max(lineWidth * 5, 6)
      ctx.bezier(from.x, from.y, cpx, cpy, to.x, to.y, { color: glowColor, width: glowW })
    }

    // Core line
    ctx.bezier(from.x, from.y, cpx, cpy, to.x, to.y, { color: def.color, width: lineWidth })
  }

  function isNodeVisible(def: SceneNodeDef) {
    const bounds = getViewportBounds()
    if (!bounds) return true
    const x = def.x()
    const y = def.y()
    const glowPad = def.glow ? def.glow.radius * 2 : 0
    const pad = def.radius + glowPad + 12
    return x + pad >= bounds.left && x - pad <= bounds.right && y + pad >= bounds.top && y - pad <= bounds.bottom
  }

  function isEdgeVisible(def: SceneEdgeDef) {
    const bounds = getViewportBounds()
    if (!bounds) return true
    const from = def.from()
    const to = def.to()
    const pad = Math.max(def.glowWidth ?? 0, def.width ?? 1, 48)
    const minX = Math.min(from.x, to.x) - pad
    const maxX = Math.max(from.x, to.x) + pad
    const minY = Math.min(from.y, to.y) - pad
    const maxY = Math.max(from.y, to.y) + pad
    return maxX >= bounds.left && minX <= bounds.right && maxY >= bounds.top && minY <= bounds.bottom
  }

  function drawNode(ctx: CanvasContext, def: SceneNodeDef) {
    const x = def.x()
    const y = def.y()
    const selected = def.selected?.() ?? false
    const sides = typeof def.shape === "number" ? def.shape
      : def.shape === "hexagon" ? 6
      : def.shape === "diamond" ? 4
      : def.shape === "octagon" ? 8
      : 0 // circle
    const rotation = def.shape === "diamond" ? 45 : sides >= 6 ? 30 : 0

    // Glow layers
    if (def.glow) {
      const gl = def.glow
      // Outer glow (large, soft)
      const outerR = selected ? gl.radius * 2 : gl.radius
      const outerI = selected ? gl.intensity * 0.7 : gl.intensity * 0.4
      const outerA = Math.round(((gl.color & 0xff) * 0.4))
      const outerColor = ((gl.color & 0xffffff00) | outerA) >>> 0
      ctx.glow(x, y, def.radius + outerR, def.radius + outerR, outerColor, Math.round(outerI))

      // Inner glow (core bloom)
      const innerA = Math.round(((gl.color & 0xff) * 0.7))
      const innerColor = ((gl.color & 0xffffff00) | innerA) >>> 0
      ctx.glow(x, y, def.radius + 5, def.radius + 5, innerColor, selected ? gl.intensity : Math.round(gl.intensity * 0.5))
    }

    // Shape fill
    if (sides > 0) {
      ctx.polygon(x, y, def.radius, sides, {
        fill: def.fill,
        stroke: def.stroke,
        strokeWidth: def.strokeWidth ?? (selected ? 3 : 2),
        rotation,
      })
    } else {
      // Circle
      ctx.circle(x, y, def.radius, {
        fill: def.fill,
        stroke: def.stroke,
        strokeWidth: def.strokeWidth ?? (selected ? 3 : 2),
      })
    }

    // Selection pulse
    if (selected && def.glow) {
      const gl = def.glow
      const pa = Math.round(20 * 0.7) // simplified — no time dep
      const pc = ((def.stroke & 0xffffff00) | pa) >>> 0
      ctx.glow(x, y, def.radius + 45, def.radius + 45, pc, 35)
    }

    // Label
    if (def.label) {
      const lw = def.label.length * 7
      const labelColor = def.labelColor ?? 0xeeeeeeff
      ctx.text(x - Math.round(lw / 2), y - (def.sublabel ? 6 : 4), def.label, labelColor)
    }

    // Sublabel
    if (def.sublabel) {
      const sw = def.sublabel.length * 7
      const sublabelColor = def.sublabelColor ?? 0x666680ff
      ctx.text(x - Math.round(sw / 2), y + 8, def.sublabel, sublabelColor)
    }

    // Status dot
    if (def.statusDot) {
      const dotX = x + Math.round(def.radius * 0.55)
      const dotY = y - Math.round(def.radius * 0.65)
      if (def.statusDot.glow) {
        ctx.glow(dotX, dotY, 10, 10, (def.statusDot.color & 0xffffff00 | 0x40) >>> 0, 50)
      }
      ctx.circle(dotX, dotY, 5, { fill: def.statusDot.color })
    }
  }

  function onDraw(ctx: CanvasContext) {
    // Layer 1: Background
    if (props.background) props.background(ctx)

    // Layer 2: Particles (behind edges/nodes)
    for (const { system } of particleMap.values()) {
      system.draw(ctx)
    }

    // Layer 3: Edges
    for (const def of edgeMap.values()) {
      if (!isEdgeVisible(def)) continue
      drawEdge(ctx, def)
    }

    // Layer 4: Nodes
    for (const def of nodeMap.values()) {
      if (!isNodeVisible(def)) continue
      drawNode(ctx, def)
    }

    // Layer 5: Overlays
    for (const def of overlayMap.values()) {
      def.draw(ctx)
    }

    // Layer 6: Foreground
    if (props.overlay) props.overlay(ctx)
  }

  return (
    <SceneCtx.Provider value={registry}>
      <surface
        ref={interaction.ref}
        width={props.width ?? "grow"}
        height={props.height ?? "grow"}
        interactionMode={interaction.mode() === "none" ? undefined : interaction.mode()}
        viewport={getViewport()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDraw={onDraw}
      />
      {props.children}
    </SceneCtx.Provider>
  )
}

// ── Scene primitives ──

export type SceneNodeProps = {
  id: string
  x: Accessor<number> | number
  y: Accessor<number> | number
  radius: number
  shape?: "circle" | "hexagon" | "diamond" | "octagon" | number
  fill: number
  stroke: number
  strokeWidth?: number
  glow?: { color: number; radius: number; intensity: number }
  selected?: Accessor<boolean> | boolean
  label?: string
  sublabel?: string
  labelColor?: number
  sublabelColor?: number
  statusDot?: { color: number; glow?: boolean }
  onSelect?: () => void
  onDrag?: (x: number, y: number) => void
}

/** Declarative scene node — registers in the nearest SceneCanvas. */
export function SceneNode(props: SceneNodeProps) {
  const reg = useContext(SceneCtx)
  if (!reg) return null

  const xAcc = typeof props.x === "function" ? props.x : () => props.x as number
  const yAcc = typeof props.y === "function" ? props.y : () => props.y as number
  const selectedAcc = props.selected === undefined ? undefined
    : typeof props.selected === "function" ? props.selected
    : () => props.selected as boolean

  onMount(() => {
    reg.registerNode({
      id: props.id,
      x: xAcc,
      y: yAcc,
      radius: props.radius,
      shape: props.shape ?? "circle",
      fill: props.fill,
      stroke: props.stroke,
      strokeWidth: props.strokeWidth,
      glow: props.glow,
      selected: selectedAcc,
      label: props.label,
      sublabel: props.sublabel,
      labelColor: props.labelColor,
      sublabelColor: props.sublabelColor,
      statusDot: props.statusDot,
      onSelect: props.onSelect,
      onDrag: props.onDrag,
    })
  })

  onCleanup(() => reg.unregisterNode(props.id))
  return null
}

export type SceneEdgeProps = {
  id: string
  from: Accessor<{ x: number; y: number }> | { x: number; y: number }
  to: Accessor<{ x: number; y: number }> | { x: number; y: number }
  color: number
  width?: number
  glow?: boolean
  glowWidth?: number
  curvature?: number
}

/** Declarative scene edge — registers in the nearest SceneCanvas. */
export function SceneEdge(props: SceneEdgeProps) {
  const reg = useContext(SceneCtx)
  if (!reg) return null

  const fromAcc = typeof props.from === "function" ? props.from : () => props.from as { x: number; y: number }
  const toAcc = typeof props.to === "function" ? props.to : () => props.to as { x: number; y: number }

  onMount(() => {
    reg.registerEdge({
      id: props.id,
      from: fromAcc,
      to: toAcc,
      color: props.color,
      width: props.width,
      glow: props.glow,
      glowWidth: props.glowWidth,
      curvature: props.curvature,
    })
  })

  onCleanup(() => reg.unregisterEdge(props.id))
  return null
}

export type SceneParticlesProps = {
  id: string
  config: ParticleConfig
}

/** Declarative particle field — registers in the nearest SceneCanvas. */
export function SceneParticles(props: SceneParticlesProps) {
  const reg = useContext(SceneCtx)
  if (!reg) return null

  onMount(() => {
    reg.registerParticles({ id: props.id, config: props.config })
  })

  onCleanup(() => reg.unregisterParticles(props.id))
  return null
}

export type SceneOverlayProps = {
  id: string
  draw: (ctx: CanvasContext) => void
}

/** Imperative overlay — for custom draw logic on top of the scene. */
export function SceneOverlay(props: SceneOverlayProps) {
  const reg = useContext(SceneCtx)
  if (!reg) return null

  onMount(() => {
    reg.registerOverlay({ id: props.id, draw: props.draw })
  })

  onCleanup(() => reg.unregisterOverlay(props.id))
  return null
}
