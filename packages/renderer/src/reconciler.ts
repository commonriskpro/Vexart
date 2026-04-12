/**
 * SolidJS custom renderer for TGE.
 *
 * Implements the 10 methods required by solid-js/universal createRenderer.
 * Translates JSX operations into TGENode tree manipulations.
 *
 * The reconciler doesn't do rendering itself — it just maintains the
 * TGENode tree. The render loop walks this tree each frame.
 */

import { createRenderer } from "solid-js/universal"
import {
  type TGENode,
  type TGEProps,
  createNode,
  createTextNode,
  insertChild,
  removeChild,
  parseColor,
} from "./node"
import { markDirty } from "./dirty"
import { createHandle } from "./handle"

export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode: solidCreateTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} = createRenderer<TGENode>({
  createElement(type: string): TGENode {
    const node = createNode(type === "text" ? "text" : "box")
    return node
  },

  createTextNode(value: string): TGENode {
    return createTextNode(String(value))
  },

  replaceText(node: TGENode, value: string) {
    node.text = String(value)
    markDirty()
  },

  setProperty(node: TGENode, name: string, value: unknown) {
    // ref callback — pass a NodeHandle to the user
    if (name === "ref" && typeof value === "function") {
      (value as (handle: ReturnType<typeof createHandle>) => void)(createHandle(node))
      return
    }

    // Padding shorthand: [Y, X] or [T, R, B, L] → expand to per-side props
    if (name === "padding" && Array.isArray(value)) {
      const p = value as number[]
      if (p.length === 2) {
        // [Y, X]
        node.props.paddingTop = p[0]; node.props.paddingBottom = p[0]
        node.props.paddingLeft = p[1]; node.props.paddingRight = p[1]
      } else if (p.length === 4) {
        // [T, R, B, L]
        node.props.paddingTop = p[0]; node.props.paddingRight = p[1]
        node.props.paddingBottom = p[2]; node.props.paddingLeft = p[3]
      }
      markDirty()
      return
    }

    // style prop — merge: direct props override style
    if (name === "style" && typeof value === "object" && value !== null) {
      const style = value as Record<string, unknown>
      for (const key of Object.keys(style)) {
        // Only set if NOT already set as a direct prop
        if ((node.props as Record<string, unknown>)[key] === undefined) {
          (node.props as Record<string, unknown>)[key] = style[key]
        }
      }
      markDirty()
      return
    }

    (node.props as Record<string, unknown>)[name] = value
    markDirty()
  },

  insertNode(parent: TGENode, node: TGENode, anchor?: TGENode) {
    insertChild(parent, node, anchor)
    markDirty()
  },

  isTextNode(node: TGENode): boolean {
    return node.kind === "text"
  },

  removeNode(parent: TGENode, node: TGENode) {
    removeChild(parent, node)
    markDirty()
  },

  getParentNode(node: TGENode): TGENode | undefined {
    return node.parent ?? undefined
  },

  getFirstChild(node: TGENode): TGENode | undefined {
    return node.children[0]
  },

  getNextSibling(node: TGENode): TGENode | undefined {
    if (!node.parent) return undefined
    const idx = node.parent.children.indexOf(node)
    return node.parent.children[idx + 1]
  },
})

// Re-export SolidJS control flow
export { For, Show, Switch, Match, Index, ErrorBoundary } from "solid-js"
