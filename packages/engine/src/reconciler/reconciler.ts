/**
 * SolidJS custom renderer for Vexart.
 *
 * @public
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
  adjustFocusableAncestors,
} from "../ffi/node"
import { DIRTY_KIND, markDirty } from "./dirty"
import { createHandle } from "./handle"
import { markLayerBacked, onNodePropertyChanged, onSubtreeChanged, unmarkLayerBacked } from "../animation/compositor-path"
import { registerNodeFocusable, unregisterNodeFocusable, updateNodeFocusEntry } from "./focus"
import { markNodeLayerDamaged } from "./pointer"
import { markLayerDirtyByKey } from "../loop/composite"

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

const VISUAL_DAMAGE_PROPS = new Set([
  "backgroundColor",
  "borderColor",
  "borderWidth",
  "borderLeft",
  "borderRight",
  "borderTop",
  "borderBottom",
  "cornerRadius",
  "borderRadius",
  "cornerRadii",
  "shadow",
  "boxShadow",
  "glow",
  "gradient",
  "backdropBlur",
  "backdropBrightness",
  "backdropContrast",
  "backdropSaturate",
  "backdropGrayscale",
  "backdropInvert",
  "backdropSepia",
  "backdropHueRotate",
  "opacity",
  "filter",
  "transform",
  "transformOrigin",
  "color",
  "fontSize",
  "fontId",
  "lineHeight",
  "fontWeight",
  "fontStyle",
  "src",
  "objectFit",
  "onDraw",
  "viewport",
])

const FLAG_VISUAL_DAMAGE = 1
const FLAG_COLOR = 2
const FLAG_STYLE_SUB_COLOR = 4
const FLAG_COMPOSITOR = 8
const PROP_FLAGS: Record<string, number> = {}
for (const prop of VISUAL_DAMAGE_PROPS) PROP_FLAGS[prop] = (PROP_FLAGS[prop] ?? 0) | FLAG_VISUAL_DAMAGE
for (const prop of COLOR_PROPS) PROP_FLAGS[prop] = (PROP_FLAGS[prop] ?? 0) | FLAG_COLOR
for (const prop of STYLE_SUB_COLOR_PROPS) PROP_FLAGS[prop] = (PROP_FLAGS[prop] ?? 0) | FLAG_STYLE_SUB_COLOR
for (const prop of ["layer", "willChange", "transform", "transformOrigin", "opacity", "filter"]) PROP_FLAGS[prop] = (PROP_FLAGS[prop] ?? 0) | FLAG_COMPOSITOR

function markNodeVisualDamage(node: TGENode) {
  if (node.layout.width > 0 && node.layout.height > 0) {
    markNodeLayerDamaged(node.id, {
      x: node.layout.x,
      y: node.layout.y,
      width: node.layout.width,
      height: node.layout.height,
    })
    return
  }
  markNodeLayerDamaged(node.id)
}

/** Resolve a color value (string or number) to u32. Called once per prop change, not per frame. */
function resolveColor(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return parseColor(value)
  return 0
}

/** Pre-parse color fields inside a glow object. */
function resolveGlow(glow: unknown): unknown {
  if (!glow || typeof glow !== "object") return glow
  const candidate = glow as { radius?: unknown; color?: unknown; intensity?: unknown }
  return {
    radius: candidate.radius,
    color: resolveColor(candidate.color),
    intensity: candidate.intensity,
  }
}

/** Pre-parse color fields inside an interactive style object (hoverStyle/activeStyle/focusStyle). */
function resolveInteractiveStyle(style: unknown): unknown {
  if (!style || typeof style !== "object") return style
  const resolved: Record<string, unknown> = { ...(style as Record<string, unknown>) }
  for (const key of Object.keys(resolved)) {
    if ((PROP_FLAGS[key] & FLAG_STYLE_SUB_COLOR) === 0) continue
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
  if (node._focusableCount === 0) return
  if (node.props.focusable) unregisterNodeFocusable(node)
  for (const child of node.children) {
    if (child._focusableCount > 0) {
      unregisterSubtree(child)
    }
  }
}

function markPropsDirty(node: TGENode) {
  node._vpDirty = true
}

function bumpNodeMutation(node: TGENode) {
  node._generation++
  let current: TGENode | null = node
  while (current) {
    current._stableFrameCount = 0
    current._unstableFrameCount = Math.max(1, current._unstableFrameCount)
    current = current.parent
  }
}

function markNodeDirty(node: TGENode) {
  bumpNodeMutation(node)
  markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: node.id })
  if (node._layerKey) {
    markLayerDirtyByKey(node._layerKey)
  }
}

function hasCompositorLayerBacking(node: TGENode) {
  if (node.props.layer === true) return true
  const willChange = node.props.willChange
  if (!willChange) return false
  const values = Array.isArray(willChange) ? willChange : [willChange]
  return values.includes("transform") || values.includes("opacity")
}

function syncCompositorLayerBacking(node: TGENode) {
  if (hasCompositorLayerBacking(node)) {
    markLayerBacked(node.id)
    return
  }
  unmarkLayerBacked(node.id)
}

function maybeNotifyCompositor(node: TGENode, name: string) {
  if (((PROP_FLAGS[name] ?? 0) & FLAG_COMPOSITOR) !== 0) onNodePropertyChanged(node.id, name)
}

function unmarkSubtreeLayerBacking(node: TGENode) {
  unmarkLayerBacked(node.id)
  for (const child of node.children) {
    unmarkSubtreeLayerBacking(child)
  }
}

const renderer = createRenderer<TGENode>({
  createElement(type: string): TGENode {
    const kind = type === "text" ? "text" : type === "img" || type === "image" ? "img" : type === "canvas" || type === "surface" ? "canvas" : "box"
    return createNode(kind)
  },

  createTextNode(value: string): TGENode {
    return createTextNode(String(value))
  },

  replaceText(node: TGENode, value: string) {
    node.text = String(value)
    // Raw text children (created by createTextNode) are never walked by walkTree —
    // the parent <text> element is the unit tracked by nodeRefById & layer cache.
    // Mark the parent dirty so scoped dirty tracking resolves correctly instead
    // of falling back to markAllDirty().
    const target = node.parent?.kind === "text" ? node.parent : node
    markNodeVisualDamage(target)
    markNodeDirty(target)
  },

  setProperty(node: TGENode, name: string, value: unknown) {
    const currentProps = node.props as Record<string, unknown>
    if (currentProps[name] === value) return

    // ref callback — pass a NodeHandle to the user
    if (name === "ref" && typeof value === "function") {
      (value as (handle: ReturnType<typeof createHandle>) => void)(createHandle(node))
      return
    }

    // Padding shorthand: [Y, X] or [T, R, B, L] → expand to per-side props
    if (name === "padding" && Array.isArray(value)) {
      markPropsDirty(node)
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
      markNodeDirty(node)
      return
    }

    // Margin shorthand: [Y, X] or [T, R, B, L] → expand to per-side props.
    if (name === "margin" && Array.isArray(value)) {
      markPropsDirty(node)
      const p = value as number[]
      if (p.length === 2) {
        node.props.marginTop = p[0]; node.props.marginBottom = p[0]
        node.props.marginLeft = p[1]; node.props.marginRight = p[1]
      } else if (p.length === 4) {
        node.props.marginTop = p[0]; node.props.marginRight = p[1]
        node.props.marginBottom = p[2]; node.props.marginLeft = p[3]
      }
      markNodeDirty(node)
      return
    }

    // style prop — merge: direct props override style
    if (name === "style" && typeof value === "object" && value !== null) {
      markPropsDirty(node)
      const style = value as Record<string, unknown>
      for (const key of Object.keys(style)) {
        // Only set if NOT already set as a direct prop
        if ((node.props as Record<string, unknown>)[key] === undefined) {
          (node.props as Record<string, unknown>)[key] = style[key]
        }
      }
      markNodeDirty(node)
      return
    }

    // ── Pre-parse colors: string → u32 once, not every frame ──
    const flags = PROP_FLAGS[name] ?? 0

    if ((flags & FLAG_COLOR) !== 0) {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveColor(value)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // ── Pre-parse sizing: string → SizingInfo once, not every frame ──
    if (name === "width") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = value
      node._widthSizing = parseSizing(value as number | string | undefined)
      markNodeDirty(node)
      return
    }
    if (name === "height") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = value
      node._heightSizing = parseSizing(value as number | string | undefined)
      markNodeDirty(node)
      return
    }

    // Pre-parse glow.color
    if (name === "glow") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveGlow(value)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // Pre-parse interactive style color fields
    if (name === "hoverStyle" || name === "activeStyle" || name === "focusStyle") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveInteractiveStyle(value)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // focusable prop — auto-register/unregister in focus system
    if (name === "focusable") {
      markPropsDirty(node)
      const wasFocusable = !!node.props.focusable
      const isFocusable = !!value
      ;(node.props as Record<string, unknown>)[name] = value
      if (wasFocusable !== isFocusable) {
        const delta = isFocusable ? 1 : -1
        node._focusableCount = Math.max(0, node._focusableCount + delta)
        adjustFocusableAncestors(node.parent, delta)
      }
      if (value) {
        registerNodeFocusable(node)
      } else {
        unregisterNodeFocusable(node)
      }
      maybeNotifyCompositor(node, name)
      markNodeDirty(node)
      return
    }

    // onKeyDown / onPress on a focusable node — update the focus entry
    if (name === "onKeyDown" || name === "onPress") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = value
      updateNodeFocusEntry(node)
      maybeNotifyCompositor(node, name)
      markNodeDirty(node)
      return
    }

    markPropsDirty(node)
    ;(node.props as Record<string, unknown>)[name] = value
    if (name === "layer" || name === "willChange") syncCompositorLayerBacking(node)
    maybeNotifyCompositor(node, name)
    if ((flags & FLAG_VISUAL_DAMAGE) !== 0) markNodeVisualDamage(node)
    markNodeDirty(node)
  },

  insertNode(parent: TGENode, node: TGENode, anchor?: TGENode) {
    insertChild(parent, node, anchor)
    syncCompositorLayerBacking(node)
    onSubtreeChanged(parent.id)
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
    unmarkSubtreeLayerBacking(node)
    onSubtreeChanged(parent.id)
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
    return node.parent.children[node._siblingIndex + 1]
  },
})

/** @public */
export const render = renderer.render
/** @public */
export const effect = renderer.effect
/** @public */
export const memo = renderer.memo
/** @public */
export const createComponent = renderer.createComponent
/** @public */
export const createElement = renderer.createElement
/** @public */
export const solidCreateTextNode = renderer.createTextNode
/** @public */
export const insertNode = renderer.insertNode
/** @public */
export const insert = renderer.insert
/** @public */
export const spread = renderer.spread
/** @public */
export const setProp = renderer.setProp
/** @public */
export const mergeProps = renderer.mergeProps
/** @public */
export const use = renderer.use

// Re-export SolidJS control flow
export { For, Show, Switch, Match, Index, ErrorBoundary } from "solid-js"
