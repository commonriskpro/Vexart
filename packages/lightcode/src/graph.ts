import { createSignal, type Accessor } from "solid-js"
import { markDirty } from "@tge/renderer"

export interface GraphPoint {
  x: number
  y: number
}

export interface GraphNodeSeed {
  id: string
  x: number
  y: number
}

export interface DraggableGraphState<TNode extends GraphNodeSeed> {
  positions: Accessor<Record<string, GraphPoint>>
  getPosition: (id: string) => GraphPoint
  getNodeX: (node: TNode) => Accessor<number>
  getNodeY: (node: TNode) => Accessor<number>
  getEdgeAnchor: (id: string) => Accessor<GraphPoint>
  moveNode: (id: string, x: number, y: number) => void
  reset: () => void
}

function createInitialPositions<TNode extends GraphNodeSeed>(nodes: TNode[]) {
  return Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }])) as Record<string, GraphPoint>
}

export function useDraggableGraph<TNode extends GraphNodeSeed>(nodes: TNode[]): DraggableGraphState<TNode> {
  const initialPositions = createInitialPositions(nodes)
  const [positions, setPositions] = createSignal(initialPositions)

  function getPosition(id: string) {
    return positions()[id] ?? { x: 0, y: 0 }
  }

  function getNodeX(node: TNode) {
    return () => positions()[node.id]?.x ?? node.x
  }

  function getNodeY(node: TNode) {
    return () => positions()[node.id]?.y ?? node.y
  }

  function getEdgeAnchor(id: string) {
    return () => getPosition(id)
  }

  function moveNode(id: string, x: number, y: number) {
    setPositions((prev) => ({ ...prev, [id]: { x, y } }))
    markDirty()
  }

  function reset() {
    setPositions(initialPositions)
    markDirty()
  }

  return {
    positions,
    getPosition,
    getNodeX,
    getNodeY,
    getEdgeAnchor,
    moveNode,
    reset,
  }
}
