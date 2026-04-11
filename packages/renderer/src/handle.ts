/**
 * NodeHandle — public API for interacting with TGENode instances via refs.
 *
 * This is the user-facing handle returned by the `ref` callback.
 * It wraps a TGENode with a clean API for:
 *   - Reading computed layout geometry (x, y, width, height)
 *   - Focus / blur control
 *   - Tree traversal (children, parent)
 *   - Lifecycle checks (isDestroyed)
 *
 * Usage:
 *   let boxRef: NodeHandle | undefined
 *
 *   <box ref={(h) => boxRef = h} backgroundColor="#16213e">
 *     <text>Hello</text>
 *   </box>
 *
 *   // Later:
 *   boxRef.layout           // → { x, y, width, height }
 *   boxRef.focus()          // → focus this element
 *   boxRef.children.length  // → number of child handles
 *   boxRef.isDestroyed      // → false
 */

import type { TGENode, LayoutRect } from "./node"
import { setFocus, focusedId } from "./focus"

export type NodeHandle = {
  /** Stable unique node ID */
  readonly id: number
  /** Node kind: "box" | "text" | "root" */
  readonly kind: string
  /** Computed layout rect from the last Clay layout pass */
  readonly layout: LayoutRect
  /** Whether this node has been removed from the tree */
  readonly isDestroyed: boolean
  /** Focus this element (registers it if not already focusable) */
  focus: () => void
  /** Blur this element (unfocus if currently focused) */
  blur: () => void
  /** Whether this element is currently focused */
  readonly isFocused: boolean
  /** Child node handles */
  readonly children: NodeHandle[]
  /** Parent node handle, or null for root */
  readonly parent: NodeHandle | null
  /** Access the underlying TGENode (for advanced internal use) */
  readonly _node: TGENode
}

/** Weak cache so the same TGENode always returns the same handle */
const handleCache = new WeakMap<TGENode, NodeHandle>()

/**
 * Create a NodeHandle for a TGENode.
 *
 * Uses a WeakMap cache so the same node always returns the same handle object.
 * The handle is a lazy proxy — layout/children/parent are read on access,
 * always reflecting current state.
 */
export function createHandle(node: TGENode): NodeHandle {
  const cached = handleCache.get(node)
  if (cached) return cached

  const focusId = `node-${node.id}`

  const handle: NodeHandle = {
    get id() { return node.id },
    get kind() { return node.kind },
    get layout() { return node.layout },
    get isDestroyed() { return node.destroyed },

    focus() {
      setFocus(focusId)
    },

    blur() {
      if (focusedId() === focusId) {
        setFocus("")
      }
    },

    get isFocused() {
      return focusedId() === focusId
    },

    get children() {
      return node.children.map(createHandle)
    },

    get parent() {
      return node.parent ? createHandle(node.parent) : null
    },

    get _node() { return node },
  }

  handleCache.set(node, handle)
  return handle
}
