/**
 * GraphState — reactive store for the node graph.
 *
 * Owns: node positions (draggable), viewport (pan/zoom), edges (structural).
 * Completely decoupled from the window system.
 *
 * Persistence: call snapshot() to get a serializable copy.
 *              call restore(snap) on startup to reload from disk.
 */

import { createSignal } from "solid-js"
import { markDirty } from "../../runtime/src/index"

// ── Types ──

export type GraphNodeDef = {
  id: string
  x: number
  y: number
  label?: string
  sublabel?: string
  shape?: "circle" | "hexagon" | "diamond" | "octagon" | number
  fill?: number
  stroke?: number
  glow?: { color: number; radius: number; intensity: number }
  kind?: string
}

export type GraphEdgeDef = {
  id: string
  from: string
  to: string
  color?: number
  width?: number
  glow?: boolean
}

export type GraphViewport = {
  x: number
  y: number
  zoom: number
}

export type GraphSnapshot = {
  positions: Record<string, { x: number; y: number }>
  viewport: GraphViewport
}

export type GraphState = {
  // Static structure (defined at creation, not reactive)
  nodes: GraphNodeDef[]
  edges: GraphEdgeDef[]

  // Reactive position accessors per node
  nodeX: (id: string) => () => number
  nodeY: (id: string) => () => number

  // Reactive edge anchor accessors (follow node positions)
  edgeFrom: (edgeId: string) => () => { x: number; y: number }
  edgeTo: (edgeId: string) => () => { x: number; y: number }

  // Reactive viewport
  viewport: () => GraphViewport

  // Mutations
  moveNode: (id: string, x: number, y: number) => void
  setViewport: (vp: GraphViewport) => void

  // Persistence
  snapshot: () => GraphSnapshot
  restore: (snap: GraphSnapshot) => void
}

// ── Implementation ──

export function createGraphState(
  nodes: GraphNodeDef[],
  edges: GraphEdgeDef[],
  onChange?: () => void,
): GraphState {
  const initial: Record<string, { x: number; y: number }> =
    Object.fromEntries(nodes.map(n => [n.id, { x: n.x, y: n.y }]))

  const [positions, setPositions] = createSignal<Record<string, { x: number; y: number }>>(initial)
  const [viewport, setViewportSignal] = createSignal<GraphViewport>({ x: 0, y: 0, zoom: 1 })

  function nodeX(id: string) {
    return () => positions()[id]?.x ?? 0
  }

  function nodeY(id: string) {
    return () => positions()[id]?.y ?? 0
  }

  function edgeFrom(edgeId: string) {
    const edge = edges.find(e => e.id === edgeId)
    if (!edge) return () => ({ x: 0, y: 0 })
    return () => positions()[edge.from] ?? { x: 0, y: 0 }
  }

  function edgeTo(edgeId: string) {
    const edge = edges.find(e => e.id === edgeId)
    if (!edge) return () => ({ x: 0, y: 0 })
    return () => positions()[edge.to] ?? { x: 0, y: 0 }
  }

  function moveNode(id: string, x: number, y: number) {
    setPositions(prev => ({ ...prev, [id]: { x, y } }))
    markDirty()
    onChange?.()
  }

  function setViewport(vp: GraphViewport) {
    setViewportSignal(vp)
    markDirty()
    onChange?.()
  }

  function snapshot(): GraphSnapshot {
    const pos = positions()
    return {
      positions: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, { x: v.x, y: v.y }])),
      viewport: { ...viewport() },
    }
  }

  function restore(snap: GraphSnapshot) {
    setPositions({ ...initial, ...snap.positions })
    setViewportSignal(snap.viewport)
    markDirty()
  }

  return {
    nodes,
    edges,
    nodeX,
    nodeY,
    edgeFrom,
    edgeTo,
    viewport,
    moveNode,
    setViewport,
    snapshot,
    restore,
  }
}
