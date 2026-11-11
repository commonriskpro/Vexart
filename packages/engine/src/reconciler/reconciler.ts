import { releaseNodeImage } from "../ffi/native-image-assets"
import { FLEX_DIRECTION_COLUMN } from "flexily"
/**
 * SolidJS custom renderer for Vexart.
 *
 * @public
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
  parseSizing,
  adjustFocusableAncestors,
  syncExtendedFlexProps,
  syncResolvedLayout,
} from "../ffi/node"
import { isLayoutProp, isTextLayoutProp, syncAllLayoutProps, syncLayoutProp } from "../ffi/flex-sync"
import { BACKDROP_FIELDS } from "../ffi/render-graph"
import { DIRTY_KIND, markDirty, markLayoutDirty } from "./dirty"
import { createHandle, type NodeHandle } from "./handle"
import { markLayerBacked, onNodePropertyChanged, onSubtreeChanged, unmarkLayerBacked } from "../animation/compositor-path"
import { registerNodeFocusable, unregisterNodeFocusable, updateNodeFocusEntry, updateNodeFocusId } from "./focus"
import { markNodeLayerDamaged, getCapturedNodeId, releasePointerCapture } from "./pointer"
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
  "color",
])

const OBJECT_PROPS = new Set([
  "shadow",
  "boxShadow",
  "glow",
  "gradient",
  "cornerRadii",
  "transform",
  "hoverStyle",
  "activeStyle",
  "focusStyle",
  "filter",
  "floatOffset",
  "floatAttach",
])

// Grid track and area lists deliberately use replacement semantics. Do not
// run them through the shallow object comparison above: a new list is the
// invalidation boundary even when its entries happen to be equal. In-place
// mutation is outside the contract and is intentionally not observed.
const GRID_REPLACEMENT_PROPS = new Set([
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridTemplateAreas",
])

const VISUAL_DAMAGE_PROPS = new Set([
  "className",
  "defaultStyle",
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
  ...BACKDROP_FIELDS,
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

const LAYOUT_PROP_NAMES = new Set([
  "width", "height",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "paddingX", "paddingY",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "marginX", "marginY",
  "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderLeft", "borderRight", "borderTop", "borderBottom",
  "flex", "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis",
  "direction",
  "gap", "rowGap", "columnGap",
  "position", "display", "overflow", "overflowX", "overflowY",
  "minWidth", "maxWidth", "minHeight", "maxHeight",
  "alignItems", "alignSelf", "alignContent", "justifyContent", "justifyItems", "justifySelf", "alignX", "alignY",
  "top", "right", "bottom", "left",
  "aspectRatio",
  "layout",
  "gridTemplateColumns", "gridTemplateRows", "gridAutoColumns", "gridAutoRows",
  "gridAutoFlow", "gridTemplateAreas", "gridColumn", "gridRow", "gridArea",
  "floating", "floatOffset",
  "fontSize", "fontFamily", "fontWeight", "fontStyle", "lineHeight", "whiteSpace", "wordBreak",
])

function isLayoutProperty(name: string): boolean {
  if (LAYOUT_PROP_NAMES.has(name)) return true
  if (name.startsWith("padding") || name.startsWith("margin") || name.startsWith("flex")) return true
  if (name.startsWith("border") && name.endsWith("Width")) return true
  return false
}

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

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keysA = Object.keys(left)
  const keysB = Object.keys(right)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (left[key] !== right[key]) return false
  }
  return true
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

/** Pre-parse color fields inside a shadow object (or array of shadows). */
function resolveShadow(shadow: unknown): unknown {
  if (!shadow) return shadow
  if (Array.isArray(shadow)) {
    return shadow.map((s) => {
      if (!s || typeof s !== "object") return s
      const candidate = s as { x?: unknown; y?: unknown; blur?: unknown; color?: unknown }
      return { x: candidate.x, y: candidate.y, blur: candidate.blur, color: resolveColor(candidate.color) }
    })
  }
  if (typeof shadow !== "object") return shadow
  const candidate = shadow as { x?: unknown; y?: unknown; blur?: unknown; color?: unknown }
  return { x: candidate.x, y: candidate.y, blur: candidate.blur, color: resolveColor(candidate.color) }
}

/** Pre-parse color fields inside a gradient object. */
function resolveGradient(gradient: unknown): unknown {
  if (!gradient || typeof gradient !== "object") return gradient
  const candidate = gradient as { type?: unknown; from?: unknown; to?: unknown; angle?: unknown }
  return {
    type: candidate.type,
    from: resolveColor(candidate.from),
    to: resolveColor(candidate.to),
    angle: candidate.angle,
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
  if (resolved.shadow || resolved.boxShadow) {
    resolved.shadow = resolveShadow(resolved.shadow ?? resolved.boxShadow)
  }
  if (resolved.gradient) {
    resolved.gradient = resolveGradient(resolved.gradient)
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

function syncChangedProp(node: TGENode, name: string) {
  if (name === "src" && node.kind === "img") releaseNodeImage(node)
  if (isLayoutProp(name)) syncLayoutProp(node, name, (node.props as Record<string, unknown>)[name])
  if (name === "rowGap" || name === "columnGap") syncLayoutProp(node, "gap", node.props.gap)
  if (name === "flexBasis" || name === "gap" || name === "rowGap" || name === "columnGap") syncExtendedFlexProps(node)
  if (node.kind === "text" && isTextLayoutProp(name)) node._flexNode?.markDirty()
  if (node.kind === "box" && isTextLayoutProp(name)) {
    for (const child of node.children) {
      if (child.kind === "text") child._flexNode?.markDirty()
    }
  }
}

const BLOCK_HTML_TAGS = new Set(["div", "section", "header", "footer", "main", "nav"])
const TEXT_HTML_TAGS = new Set(["text", "span", "p", "h1", "h2", "h3", "h4", "label"])
const HEADING_DEFAULTS: Record<string, { fontSize: number; fontWeight: number }> = {
  h1: { fontSize: 28, fontWeight: 700 },
  h2: { fontSize: 22, fontWeight: 700 },
  h3: { fontSize: 18, fontWeight: 600 },
  h4: { fontSize: 16, fontWeight: 600 },
}
const tagDefaultsMap = new WeakMap<TGENode, Partial<TGEProps>>()
const mouseAliasStates = new WeakMap<TGENode, { over?: boolean; out?: boolean }>()

function resolveStyleDefaultsColors(style: unknown): Partial<TGEProps> | undefined {
  if (!style || typeof style !== "object") return undefined
  const resolved: Record<string, unknown> = { ...(style as Record<string, unknown>) }
  for (const key of Object.keys(resolved)) {
    if (((PROP_FLAGS[key] ?? 0) & FLAG_COLOR) !== 0) {
      resolved[key] = resolveColor(resolved[key])
    }
  }
  if (resolved.glow) resolved.glow = resolveGlow(resolved.glow)
  if (resolved.shadow || resolved.boxShadow) resolved.shadow = resolveShadow(resolved.shadow ?? resolved.boxShadow)
  if (resolved.gradient) resolved.gradient = resolveGradient(resolved.gradient)
  if (resolved.hoverStyle) resolved.hoverStyle = resolveInteractiveStyle(resolved.hoverStyle)
  if (resolved.activeStyle) resolved.activeStyle = resolveInteractiveStyle(resolved.activeStyle)
  if (resolved.focusStyle) resolved.focusStyle = resolveInteractiveStyle(resolved.focusStyle)
  return resolved as Partial<TGEProps>
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
    if (TEXT_HTML_TAGS.has(type)) {
      const node = createNode("text")
      const heading = HEADING_DEFAULTS[type]
      if (heading) {
        const defaultStyle: Partial<TGEProps> = { fontSize: heading.fontSize, fontWeight: heading.fontWeight }
        tagDefaultsMap.set(node, defaultStyle)
        node.props.defaultStyle = defaultStyle
        node.props.fontSize = heading.fontSize
        node.props.fontWeight = heading.fontWeight
        node._defaultLayoutKeys = new Set(["fontSize", "fontWeight"])
        node._syncedDefaultStyle = defaultStyle
      }
      return node
    }
    if (type === "img" || type === "image") return createNode("img")
    if (type === "canvas" || type === "surface") return createNode("canvas")
    const node = createNode("box")
    if (BLOCK_HTML_TAGS.has(type)) {
      const defaultStyle: Partial<TGEProps> = { direction: "column" }
      tagDefaultsMap.set(node, defaultStyle)
      node.props.defaultStyle = defaultStyle
      node.props.direction = "column"
      node._defaultLayoutKeys = new Set(["direction"])
      node._syncedDefaultStyle = defaultStyle
      node._flexNode?.setFlexDirection(FLEX_DIRECTION_COLUMN)
    } else if (type === "button") {
      const defaultStyle: Partial<TGEProps> = { focusable: true, alignX: "center", alignY: "center" }
      tagDefaultsMap.set(node, defaultStyle)
      node.props.defaultStyle = defaultStyle
      node.props.focusable = true
      node.props.alignX = "center"
      node.props.alignY = "center"
      node._defaultLayoutKeys = new Set(["focusable", "alignX", "alignY"])
      node._syncedDefaultStyle = defaultStyle
      node._focusableCount = 1
      registerNodeFocusable(node)
      syncAllLayoutProps(node)
    }
    return node
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
    target._flexNode?.markDirty()
    markNodeVisualDamage(target)
    markNodeDirty(target)
    markLayoutDirty()
  },

  setProperty(node: TGENode, name: string, value: unknown) {
    const currentProps = node.props as Record<string, unknown>
    if (
      currentProps[name] === value
      && !node._defaultLayoutKeys?.has(name)
      && !node._classLayoutKeys?.has(name)
      && !node._styleKeys?.has(name)
    ) return
    if (!GRID_REPLACEMENT_PROPS.has(name) && OBJECT_PROPS.has(name) && shallowEqual(currentProps[name], value)) return

    // ref callback — pass a NodeHandle to the user
    if (name === "ref" && typeof value === "function") {
      (value as (handle: NodeHandle) => void)(createHandle(node))
      return
    }

    // defaultStyle prop — lowest precedence layer, synced to Flexily
    if (name === "defaultStyle") {
      markPropsDirty(node)
      const wasFocusable = !!node.props.focusable
      const tagDefaults = tagDefaultsMap.get(node)
      const resolvedDefaults = resolveStyleDefaultsColors(value)
      node.props.defaultStyle = tagDefaults
        ? (resolvedDefaults ? { ...tagDefaults, ...resolvedDefaults } : tagDefaults)
        : resolvedDefaults
      syncResolvedLayout(node)
      const isFocusable = !!node.props.focusable
      if (wasFocusable !== isFocusable) {
        const delta = isFocusable ? 1 : -1
        node._focusableCount = Math.max(0, node._focusableCount + delta)
        adjustFocusableAncestors(node.parent, delta)
        if (isFocusable) registerNodeFocusable(node)
        else unregisterNodeFocusable(node)
      }
      markLayoutDirty()
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // className prop — sync layout props to Flexily without polluting visual node.props
    if (name === "className") {
      markPropsDirty(node)
      node.props.className = value as string | undefined
      syncResolvedLayout(node)
      markLayoutDirty()
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // classOverride prop — allows className to override direct component props
    if (name === "classOverride") {
      markPropsDirty(node)
      node.props.classOverride = !!value
      syncResolvedLayout(node)
      markLayoutDirty()
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // Padding shorthand: [Y, X] or [T, R, B, L] → expand to per-side props
    if (name === "padding" && Array.isArray(value)) {
      markPropsDirty(node)
      const p = value as number[]
      for (const side of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"]) {
        node._defaultLayoutKeys?.delete(side)
        node._classLayoutKeys?.delete(side)
        node._styleKeys?.delete(side)
      }
      if (p.length === 2) {
        // [Y, X]
        node.props.paddingTop = p[0]; node.props.paddingBottom = p[0]
        node.props.paddingLeft = p[1]; node.props.paddingRight = p[1]
      } else if (p.length === 4) {
        // [T, R, B, L]
        node.props.paddingTop = p[0]; node.props.paddingRight = p[1]
        node.props.paddingBottom = p[2]; node.props.paddingLeft = p[3]
      }
      syncLayoutProp(node, "padding", node.props.padding)
      markLayoutDirty()
      markNodeDirty(node)
      return
    }

    // Margin shorthand: [Y, X] or [T, R, B, L] → expand to per-side props.
    if (name === "margin" && Array.isArray(value)) {
      markPropsDirty(node)
      const p = value as number[]
      for (const side of ["marginTop", "marginBottom", "marginLeft", "marginRight"]) {
        node._defaultLayoutKeys?.delete(side)
        node._classLayoutKeys?.delete(side)
        node._styleKeys?.delete(side)
      }
      if (p.length === 2) {
        node.props.marginTop = p[0]; node.props.marginBottom = p[0]
        node.props.marginLeft = p[1]; node.props.marginRight = p[1]
      } else if (p.length === 4) {
        node.props.marginTop = p[0]; node.props.marginRight = p[1]
        node.props.marginBottom = p[2]; node.props.marginLeft = p[3]
      }
      syncLayoutProp(node, "margin", node.props.margin)
      markLayoutDirty()
      markNodeDirty(node)
      return
    }

    // style prop — merge: direct props override style
    if (name === "style" && (value === undefined || value === null)) {
      markPropsDirty(node)
      delete currentProps.style
      const prevStyleKeys = node._styleKeys
      let styleHasLayout = false
      if (prevStyleKeys) {
        for (const key of prevStyleKeys) {
          if (isLayoutProperty(key)) styleHasLayout = true
          delete currentProps[key]
          if (key === "width") node._widthSizing = null
          else if (key === "height") node._heightSizing = null
          syncChangedProp(node, key)
        }
      }
      node._styleKeys = undefined
      if (node.props.className || node.props.defaultStyle) syncResolvedLayout(node)
      if (styleHasLayout) markLayoutDirty()
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }
    if (name === "style" && typeof value === "object" && value !== null) {
      markPropsDirty(node)
      currentProps.style = value
      const style = value as Record<string, unknown>
      const newKeys = new Set(Object.keys(style))
      const prevStyleKeys = node._styleKeys
      let styleHasLayout = false
      let removedKey = false
      if (prevStyleKeys) {
        for (const key of prevStyleKeys) {
          if (!newKeys.has(key)) {
            removedKey = true
            if (isLayoutProperty(key)) styleHasLayout = true
            delete (node.props as Record<string, unknown>)[key]
            if (key === "width") node._widthSizing = null
            else if (key === "height") node._heightSizing = null
            syncChangedProp(node, key)
          }
        }
      }
      node._styleKeys = newKeys
      for (const key of newKeys) {
        if (isLayoutProperty(key)) styleHasLayout = true
        // Only set if NOT already set as a direct prop
        if (
          (node.props as Record<string, unknown>)[key] === undefined
          || prevStyleKeys?.has(key)
          || node._defaultLayoutKeys?.has(key)
          || node._classLayoutKeys?.has(key)
        ) {
          node._defaultLayoutKeys?.delete(key)
          node._classLayoutKeys?.delete(key)
          let val = style[key]
          const flags = PROP_FLAGS[key] ?? 0
          if ((flags & FLAG_COLOR) !== 0) val = resolveColor(val)
          if (key === "layout" && val === "grid") {
            for (const defKey of ["direction", "alignX", "alignY"]) {
              if (node._defaultLayoutKeys?.has(defKey)) {
                delete currentProps[defKey]
                node._defaultLayoutKeys.delete(defKey)
              }
            }
          }
          if (key === "width" || key === "height") {
            ;(node.props as Record<string, unknown>)[key] = val
            if (key === "width") node._widthSizing = parseSizing(val as number | string | undefined)
            else node._heightSizing = parseSizing(val as number | string | undefined)
            syncChangedProp(node, key)
            continue
          }
          ;(node.props as Record<string, unknown>)[key] = val
          syncChangedProp(node, key)
        }
      }
      if (removedKey && (node.props.className || node.props.defaultStyle)) {
        syncResolvedLayout(node)
      }
      if (styleHasLayout) markLayoutDirty()
      markNodeDirty(node)
      return
    }

    // Direct prop overrides defaultStyle / className / style ownership
    node._defaultLayoutKeys?.delete(name)
    node._classLayoutKeys?.delete(name)
    node._styleKeys?.delete(name)
    if (name === "layout" && value === "grid") {
      for (const defKey of ["direction", "alignX", "alignY"]) {
        if (node._defaultLayoutKeys?.has(defKey)) {
          delete currentProps[defKey]
          node._defaultLayoutKeys.delete(defKey)
        }
      }
    }

    // ── Pre-parse colors: string → u32 once, not every frame ──
    const flags = PROP_FLAGS[name] ?? 0

    if ((flags & FLAG_COLOR) !== 0) {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveColor(value)
      syncChangedProp(node, name)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // ── Pre-parse sizing: string → SizingInfo once, not every frame ──
    if (name === "width") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = value
      node._widthSizing = parseSizing(value as number | string | undefined)
      syncLayoutProp(node, name, value)
      markLayoutDirty()
      markNodeDirty(node)
      return
    }
    if (name === "height") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = value
      node._heightSizing = parseSizing(value as number | string | undefined)
      syncLayoutProp(node, name, value)
      markLayoutDirty()
      markNodeDirty(node)
      return
    }

    // Pre-parse glow.color
    if (name === "glow") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveGlow(value)
      syncChangedProp(node, name)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // Pre-parse shadow colors (string → u32)
    if (name === "shadow" || name === "boxShadow") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveShadow(value)
      syncChangedProp(node, name)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // Pre-parse gradient colors (string → u32)
    if (name === "gradient") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveGradient(value)
      syncChangedProp(node, name)
      markNodeVisualDamage(node)
      markNodeDirty(node)
      return
    }

    // Pre-parse interactive style color fields
    if (name === "hoverStyle" || name === "activeStyle" || name === "focusStyle") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = resolveInteractiveStyle(value)
      syncChangedProp(node, name)
      if (value && typeof value === "object" && Object.keys(value).some(isLayoutProperty)) {
        markLayoutDirty()
      }
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
      syncChangedProp(node, name)
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

    if (name === "focusId") {
      markPropsDirty(node)
      ;(node.props as Record<string, unknown>)[name] = value
      syncChangedProp(node, name)
      if (node.props.focusable && typeof value === "string") {
        updateNodeFocusId(node, value)
      }
      maybeNotifyCompositor(node, name)
      markNodeDirty(node)
      return
    }

    // onKeyDown / onPress / onClick on a focusable node — update the focus entry
    if (name === "onKeyDown" || name === "onPress" || name === "onClick") {
      markPropsDirty(node)
      if (value === undefined) delete currentProps[name]
      else currentProps[name] = value
      syncChangedProp(node, name)
      updateNodeFocusEntry(node)
      maybeNotifyCompositor(node, name)
      markNodeDirty(node)
      return
    }

    // Mouse enter/leave aliases — keep onMouseOver/onMouseOut synced for loop wakeups
    if (name === "onMouseOver" || name === "onMouseEnter" || name === "onHoverEnter") {
      markPropsDirty(node)
      if (value === undefined) delete currentProps[name]
      else currentProps[name] = value
      const aliasState = mouseAliasStates.get(node) ?? {}
      if (name === "onMouseOver") {
        aliasState.over = false
        if (value === undefined) {
          const fallback = node.props.onMouseEnter ?? node.props.onHoverEnter
          if (fallback) {
            node.props.onMouseOver = fallback
            aliasState.over = true
          }
        }
      } else if (currentProps.onMouseOver === undefined || aliasState.over) {
        const fallback = node.props.onMouseEnter ?? node.props.onHoverEnter
        if (fallback) {
          node.props.onMouseOver = fallback
          aliasState.over = true
        } else {
          delete currentProps.onMouseOver
          aliasState.over = false
        }
      }
      mouseAliasStates.set(node, aliasState)
      maybeNotifyCompositor(node, name)
      markNodeDirty(node)
      return
    }
    if (name === "onMouseOut" || name === "onMouseLeave" || name === "onHoverLeave") {
      markPropsDirty(node)
      if (value === undefined) delete currentProps[name]
      else currentProps[name] = value
      const aliasState = mouseAliasStates.get(node) ?? {}
      if (name === "onMouseOut") {
        aliasState.out = false
        if (value === undefined) {
          const fallback = node.props.onMouseLeave ?? node.props.onHoverLeave
          if (fallback) {
            node.props.onMouseOut = fallback
            aliasState.out = true
          }
        }
      } else if (currentProps.onMouseOut === undefined || aliasState.out) {
        const fallback = node.props.onMouseLeave ?? node.props.onHoverLeave
        if (fallback) {
          node.props.onMouseOut = fallback
          aliasState.out = true
        } else {
          delete currentProps.onMouseOut
          aliasState.out = false
        }
      }
      mouseAliasStates.set(node, aliasState)
      maybeNotifyCompositor(node, name)
      markNodeDirty(node)
      return
    }

    markPropsDirty(node)
    if (value === undefined) delete currentProps[name]
    else currentProps[name] = value
    if (value === undefined && (node.props.className || node.props.defaultStyle) && (isLayoutProp(name) || isTextLayoutProp(name) || name === "rowGap" || name === "columnGap")) {
      syncResolvedLayout(node)
    } else {
      syncChangedProp(node, name)
    }
    if (name === "layer" || name === "willChange") syncCompositorLayerBacking(node)
    maybeNotifyCompositor(node, name)
    if (isLayoutProperty(name)) markLayoutDirty()
    if ((flags & FLAG_VISUAL_DAMAGE) !== 0) markNodeVisualDamage(node)
    markNodeDirty(node)
  },

  insertNode(parent: TGENode, node: TGENode, anchor?: TGENode) {
    insertChild(parent, node, anchor)
    syncCompositorLayerBacking(node)
    onSubtreeChanged(parent.id)
    markLayoutDirty()
    markDirty()
  },

  isTextNode(node: TGENode): boolean {
    return node.kind === "text"
  },

  removeNode(parent: TGENode, node: TGENode) {
    if (node.id === getCapturedNodeId()) {
      releasePointerCapture(node.id)
    }
    // Recursively unregister all focusable nodes in the subtree.
    // Without this, destroyed children remain as ghost entries in the
    // focus ring and Tab key cycles through invisible elements.
    unregisterSubtree(node)
    unmarkSubtreeLayerBacking(node)
    onSubtreeChanged(parent.id)
    removeChild(parent, node)
    markLayoutDirty()
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
export const setProp = renderer.setProp
/** @public */
export const mergeProps = renderer.mergeProps

type Props = Record<string, unknown>
const spreadPropsCache = new WeakMap<object, object>()

function wrapRefProps<T>(props: T): T {
  if (typeof props !== "object" || props === null) return props
  const cached = spreadPropsCache.get(props)
  if (cached) return cached as T

  // Keep the original object as the prototype so getters and Solid proxies
  // remain live. The own ref accessor adapts whatever callback is current
  // when Solid's spread effect reads it, including a ref that starts unset.
  const wrapped = Object.create(props as object) as Props
  Object.defineProperty(wrapped, "ref", {
    configurable: true,
    enumerable: true,
    get() {
      const ref = Reflect.get(props as object, "ref", props)
      if (typeof ref !== "function") return ref
      return (node: TGENode) => (ref as (handle: NodeHandle) => void)(createHandle(node))
    },
  })
  spreadPropsCache.set(props, wrapped)
  return wrapped as T
}

/** Solid spread with the same NodeHandle ref contract as setProp. */
export function spread<T>(node: TGENode, accessor: (() => T) | T, skipChildren?: boolean): void {
  if (typeof accessor === "function") {
    renderer.spread(node, () => wrapRefProps((accessor as () => T)()), skipChildren)
    return
  }
  renderer.spread(node, wrapRefProps(accessor), skipChildren)
}

/** Solid's universal compiler lowers refs and directives to `use`. */
export function use<A, T>(fn: (element: NodeHandle, arg: A) => T, element: TGENode, arg?: A): T {
  return renderer.use(
    (_element, nextArg) => fn(createHandle(element), nextArg),
    element,
    arg as A,
  )
}

// Re-export SolidJS control flow
export { For, Show, Switch, Match, Index, ErrorBoundary } from "solid-js"
