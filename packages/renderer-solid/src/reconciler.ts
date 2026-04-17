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
  type SizingInfo,
  createNode,
  createTextNode,
  insertChild,
  removeChild,
  parseColor,
  parseSizing,
} from "../../engine/src/ffi/node"
import { markDirty } from "../../engine/src/reconciler/dirty"
import { createHandle } from "../../engine/src/reconciler/handle"
import { registerNodeFocusable, unregisterNodeFocusable, updateNodeFocusEntry } from "../../engine/src/reconciler/focus"

// ── Color props that need pre-parsing ──
// These are resolved from string → u32 ONCE in setProperty,
// not every frame in walkTree. Theme hot-swap works because
// SolidJS re-fires setProperty when a reactive signal changes.

const COLOR_PROPS = new Set([
  "backgroundColor",
  "borderColor",
  "color",
])

// Sub-object color fields: glow.color, hoverStyle.backgroundColor, etc.
const STYLE_SUB_COLOR_PROPS = new Set([
  "backgroundColor",
  "borderColor",
])

/** Resolve a color value (string or number) to u32. Called once per prop change, not per frame. */
function resolveColor(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return parseColor(value)
  return 0
}

/** Pre-parse color fields inside a glow object. */
function resolveGlow(glow: any): any {
  if (!glow || typeof glow !== "object") return glow
  return {
    radius: glow.radius,
    color: resolveColor(glow.color),
    intensity: glow.intensity,
  }
}

/** Pre-parse color fields inside an interactive style object (hoverStyle/activeStyle/focusStyle). */
function resolveInteractiveStyle(style: any): any {
  if (!style || typeof style !== "object") return style
  const resolved = { ...style }
  for (const key of STYLE_SUB_COLOR_PROPS) {
    if (key in resolved) {
      resolved[key] = resolveColor(resolved[key])
    }
  }
  if (resolved.glow) {
    resolved.glow = resolveGlow(resolved.glow)
  }
  return resolved
}

/**
 * Recursively unregister all focusable nodes in a subtree.
 * Uses early prune: skips leaf nodes that aren't focusable themselves,
 * only recurses into children that are focusable or have their own children.
 */
function unregisterSubtree(node: TGENode) {
  if (node.props.focusable) unregisterNodeFocusable(node)
  for (const child of node.children) {
    if (child.props.focusable || child.children.length > 0) {
      unregisterSubtree(child)
    }
  }
}

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
    const kind = type === "text" ? "text" : type === "img" ? "img" : type === "canvas" || type === "surface" ? "canvas" : "box"
    const node = createNode(kind)
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

    // ── Pre-parse colors: string → u32 once, not every frame ──
    if (COLOR_PROPS.has(name)) {
      (node.props as Record<string, unknown>)[name] = resolveColor(value)
      markDirty()
      return
    }

    // ── Pre-parse sizing: string → SizingInfo once, not every frame ──
    if (name === "width") {
      (node.props as Record<string, unknown>)[name] = value
      node._widthSizing = parseSizing(value as number | string | undefined)
      markDirty()
      return
    }
    if (name === "height") {
      (node.props as Record<string, unknown>)[name] = value
      node._heightSizing = parseSizing(value as number | string | undefined)
      markDirty()
      return
    }

    // Pre-parse glow.color
    if (name === "glow") {
      (node.props as Record<string, unknown>)[name] = resolveGlow(value)
      markDirty()
      return
    }

    // Pre-parse interactive style color fields
    if (name === "hoverStyle" || name === "activeStyle" || name === "focusStyle") {
      (node.props as Record<string, unknown>)[name] = resolveInteractiveStyle(value)
      markDirty()
      return
    }

    // focusable prop — auto-register/unregister in focus system
    if (name === "focusable") {
      (node.props as Record<string, unknown>)[name] = value
      if (value) {
        registerNodeFocusable(node)
      } else {
        unregisterNodeFocusable(node)
      }
      markDirty()
      return
    }

    // onKeyDown / onPress on a focusable node — update the focus entry
    if (name === "onKeyDown" || name === "onPress") {
      (node.props as Record<string, unknown>)[name] = value
      updateNodeFocusEntry(node)
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
    // Recursively unregister all focusable nodes in the subtree.
    // Without this, destroyed children remain as ghost entries in the
    // focus ring and Tab key cycles through invisible elements.
    unregisterSubtree(node)
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
