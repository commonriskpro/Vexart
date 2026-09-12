import type { TGENode, LayoutRect } from "../ffi/node"
import { focusedId, getNodeFocusId, setFocus, setFocusedId } from "./focus"

/** @public */
export type NodeHandle = {
  readonly id: number
  readonly kind: string
  readonly layout: LayoutRect
  readonly isDestroyed: boolean
  focus: () => void
  blur: () => void
  readonly isFocused: boolean
  readonly children: NodeHandle[]
  readonly parent: NodeHandle | null
}

const handleCache = new WeakMap<TGENode, NodeHandle>()
const nodeByHandle = new WeakMap<NodeHandle, TGENode>()

function getActiveFocusId(node: TGENode): string | undefined {
  if (node.destroyed) return undefined
  return getNodeFocusId(node)
}

/** Resolve an engine-owned handle for internal reconciler code. */
export function getHandleNode(handle: NodeHandle): TGENode {
  const node = nodeByHandle.get(handle)
  if (!node) throw new TypeError("Expected a NodeHandle created by Vexart")
  return node
}

/** @public */
export function createHandle(node: TGENode): NodeHandle {
  const cached = handleCache.get(node)
  if (cached) return cached

  const handle: NodeHandle = {
    get id() { return node.id },
    get kind() { return node.kind },
    get layout() { return node.layout },
    get isDestroyed() { return node.destroyed },
    focus() {
      const focusId = getActiveFocusId(node)
      if (focusId !== undefined) setFocus(focusId)
    },
    blur() {
      const focusId = getActiveFocusId(node)
      if (focusId !== undefined && focusedId() === focusId) setFocusedId(null)
    },
    get isFocused() {
      const currentFocusId = focusedId()
      const focusId = getActiveFocusId(node)
      return focusId !== undefined && currentFocusId === focusId
    },
    get children() { return node.children.map(createHandle) },
    get parent() { return node.parent ? createHandle(node.parent) : null },
  }

  handleCache.set(node, handle)
  nodeByHandle.set(handle, node)
  return handle
}
