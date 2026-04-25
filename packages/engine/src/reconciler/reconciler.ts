/**
 * SolidJS custom renderer for TGE.
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
} from "../ffi/node"
import { markDirty } from "./dirty"
import { createHandle } from "./handle"
import { markLayerBacked, onNodePropertyChanged, onSubtreeChanged, unmarkLayerBacked } from "../animation/compositor-path"
import { registerNodeFocusable, unregisterNodeFocusable, updateNodeFocusEntry } from "./focus"
import { markNodeLayerDamaged } from "./pointer"
import {
  nativeSceneCreateNode,
  nativeSceneDestroyNode,
  nativeSceneInsert,
  nativeSceneRemove,
  nativeSceneSetProp,
  nativeSceneSetText,
} from "../ffi/native-scene"
import { isNativeSceneGraphEnabled } from "../ffi/native-scene-graph-flags"

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

function unmarkSubtreeLayerBacking(node: TGENode) {
  unmarkLayerBacked(node.id)
  for (const child of node.children) {
    unmarkSubtreeLayerBacking(child)
  }
}

const renderer = createRenderer<TGENode>({
  createElement(type: string): TGENode {
    const kind = type === "text" ? "text" : type === "img" || type === "image" ? "img" : type === "canvas" || type === "surface" ? "canvas" : "box"
    const node = createNode(kind)
    if (isNativeSceneGraphEnabled()) {
      node._nativeId = nativeSceneCreateNode(kind)
    }
    return node
  },

  createTextNode(value: string): TGENode {
    const node = createTextNode(String(value))
    if (isNativeSceneGraphEnabled()) {
      node._nativeId = nativeSceneCreateNode("text")
      nativeSceneSetText(node._nativeId, node.text)
    }
    return node
  },

  replaceText(node: TGENode, value: string) {
    node.text = String(value)
    nativeSceneSetText(node._nativeId, node.text)
    markNodeVisualDamage(node)
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
      nativeSceneSetProp(node._nativeId, "padding", value)
      markDirty()
      return
    }

    // Margin shorthand: [Y, X] or [T, R, B, L] → expand to per-side props.
    if (name === "margin" && Array.isArray(value)) {
      const p = value as number[]
      if (p.length === 2) {
        node.props.marginTop = p[0]; node.props.marginBottom = p[0]
        node.props.marginLeft = p[1]; node.props.marginRight = p[1]
        nativeSceneSetProp(node._nativeId, "marginTop", p[0])
        nativeSceneSetProp(node._nativeId, "marginBottom", p[0])
        nativeSceneSetProp(node._nativeId, "marginLeft", p[1])
        nativeSceneSetProp(node._nativeId, "marginRight", p[1])
      } else if (p.length === 4) {
        node.props.marginTop = p[0]; node.props.marginRight = p[1]
        node.props.marginBottom = p[2]; node.props.marginLeft = p[3]
        nativeSceneSetProp(node._nativeId, "marginTop", p[0])
        nativeSceneSetProp(node._nativeId, "marginRight", p[1])
        nativeSceneSetProp(node._nativeId, "marginBottom", p[2])
        nativeSceneSetProp(node._nativeId, "marginLeft", p[3])
      } else {
        nativeSceneSetProp(node._nativeId, "margin", value)
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
      nativeSceneSetProp(node._nativeId, "style", style)
      markDirty()
      return
    }

    // ── Pre-parse colors: string → u32 once, not every frame ──
    if (COLOR_PROPS.has(name)) {
      (node.props as Record<string, unknown>)[name] = resolveColor(value)
      nativeSceneSetProp(node._nativeId, name, (node.props as Record<string, unknown>)[name])
      markNodeVisualDamage(node)
      markDirty()
      return
    }

    // ── Pre-parse sizing: string → SizingInfo once, not every frame ──
    if (name === "width") {
      (node.props as Record<string, unknown>)[name] = value
      node._widthSizing = parseSizing(value as number | string | undefined)
      nativeSceneSetProp(node._nativeId, name, value)
      markDirty()
      return
    }
    if (name === "height") {
      (node.props as Record<string, unknown>)[name] = value
      node._heightSizing = parseSizing(value as number | string | undefined)
      nativeSceneSetProp(node._nativeId, name, value)
      markDirty()
      return
    }

    // Pre-parse glow.color
    if (name === "glow") {
      (node.props as Record<string, unknown>)[name] = resolveGlow(value)
      nativeSceneSetProp(node._nativeId, name, (node.props as Record<string, unknown>)[name])
      markNodeVisualDamage(node)
      markDirty()
      return
    }

    // Pre-parse interactive style color fields
    if (name === "hoverStyle" || name === "activeStyle" || name === "focusStyle") {
      (node.props as Record<string, unknown>)[name] = resolveInteractiveStyle(value)
      nativeSceneSetProp(node._nativeId, name, (node.props as Record<string, unknown>)[name])
      markNodeVisualDamage(node)
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
      nativeSceneSetProp(node._nativeId, name, value)
      onNodePropertyChanged(node.id, name)
      markDirty()
      return
    }

    // onKeyDown / onPress on a focusable node — update the focus entry
    if (name === "onKeyDown" || name === "onPress") {
      (node.props as Record<string, unknown>)[name] = value
      updateNodeFocusEntry(node)
      nativeSceneSetProp(node._nativeId, name, value)
      onNodePropertyChanged(node.id, name)
      markDirty()
      return
    }

    (node.props as Record<string, unknown>)[name] = value
    if (name === "layer" || name === "willChange") syncCompositorLayerBacking(node)
    nativeSceneSetProp(node._nativeId, name, value)
    onNodePropertyChanged(node.id, name)
    if (VISUAL_DAMAGE_PROPS.has(name)) markNodeVisualDamage(node)
    markDirty()
  },

  insertNode(parent: TGENode, node: TGENode, anchor?: TGENode) {
    insertChild(parent, node, anchor)
    syncCompositorLayerBacking(node)
    onSubtreeChanged(parent.id)
    nativeSceneInsert(parent._nativeId, node._nativeId, anchor?._nativeId)
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
    nativeSceneRemove(parent._nativeId, node._nativeId)
    nativeSceneDestroyNode(node._nativeId)
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
