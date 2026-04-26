import type { TGENode, LayoutRect } from "../ffi/node"
import { setFocus, focusedId, setFocusedId } from "./focus"

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
  readonly _node: TGENode
}

const handleCache = new WeakMap<TGENode, NodeHandle>()

/** @public */
export function createHandle(node: TGENode): NodeHandle {
  const cached = handleCache.get(node)
  if (cached) return cached

  const focusId = `node-${node.id}`

  const handle: NodeHandle = {
    get id() { return node.id },
    get kind() { return node.kind },
    get layout() { return node.layout },
    get isDestroyed() { return node.destroyed },
    focus() { setFocus(focusId) },
    blur() { if (focusedId() === focusId) setFocusedId(null) },
    get isFocused() { return focusedId() === focusId },
    get children() { return node.children.map(createHandle) },
    get parent() { return node.parent ? createHandle(node.parent) : null },
    get _node() { return node },
  }

  handleCache.set(node, handle)
  return handle
}
