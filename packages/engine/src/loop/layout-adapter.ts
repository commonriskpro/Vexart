/**
 * layout-adapter.ts — VexartLayoutCtx factory + layout buffer helpers.
 *
 * Drop-in replacement for the legacy clay object. Builds a flat layout
 * command tree during walkTree, then computes layout in TypeScript.
 * Returns synthetic RenderCommand[] from the positioned layout output.
 *
 * Extracted from loop.ts lines ~49–568 as part of Phase 3 Slice 1.2.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §File Changes
 */

import type { RenderCommand } from "../ffi/render-graph"
import { CMD as _CMD_RG } from "../ffi/render-graph"

// ── Local constants previously from clay.ts ───────────────────────────────

/** CMD constants — same values as in the legacy Clay bridge. */
const CMD = {
  ..._CMD_RG,
} as const

/** Floating attach-to mode. */
export const ATTACH_TO = {
  NONE: 0,
  PARENT: 1,
  ELEMENT: 2,
  ROOT: 3,
} as const

/** Floating attach point (3x3 grid). */
export const ATTACH_POINT = {
  LEFT_TOP: 0,
  LEFT_CENTER: 1,
  LEFT_BOTTOM: 2,
  CENTER_TOP: 3,
  CENTER_CENTER: 4,
  CENTER_BOTTOM: 5,
  RIGHT_TOP: 6,
  RIGHT_CENTER: 7,
  RIGHT_BOTTOM: 8,
} as const

/** Pointer capture mode. */
export const POINTER_CAPTURE = {
  CAPTURE: 0,
  PASSTHROUGH: 1,
} as const

// ── VexartLayoutCtx ───────────────────────────────────────────────────────

/** Layout node open payload constants */
const OPEN_PAYLOAD_BYTES = 112
const LAYOUT_CMD_OPEN = 0
const LAYOUT_CMD_CLOSE = 1
const FLAG_IS_ROOT = 1 << 0
const FLAG_FLOATING_ABS = 1 << 1
const FLAG_SCROLL_X = 1 << 2
const FLAG_SCROLL_Y = 1 << 3

export type PositionedCommand = {
  nodeId: number
  x: number
  y: number
  width: number
  height: number
  contentX: number
  contentY: number
  contentW: number
  contentH: number
}

// Per-node accumulated state for building OPEN payload
export type NodeOpenState = {
  nodeId: number
  parentNodeId: number
  flags: number
  flexDir: number
  posKind: number
  sizeWKind: number
  sizeHKind: number
  sizeW: number
  sizeH: number
  minW: number; minH: number
  maxW: number; maxH: number
  flexGrow: number; flexShrink: number
  justifyContent: number; alignItems: number; alignContent: number
  padTop: number; padRight: number; padBottom: number; padLeft: number
  borderTop: number; borderRight: number; borderBottom: number; borderLeft: number
  gapRow: number; gapCol: number
  insetTop: number; insetRight: number; insetBottom: number; insetLeft: number
  zIndex: number
  // Synthetic render command data
  bgColor: number
  cornerRadius: number
  // Deferred OPEN tracking — written to buffer when first child opens or at closeElement
  _openWritten: boolean
}

export const _defaultOpen = (): NodeOpenState => ({
  nodeId: 0, parentNodeId: 0, flags: 0,
  flexDir: 1 /* column */, posKind: 0, sizeWKind: 0, sizeHKind: 0, sizeW: 0, sizeH: 0,
  minW: 0, minH: 0, maxW: 0, maxH: 0, flexGrow: 0, flexShrink: 1,
  // 255 = None → Taffy uses its default (Stretch for align_items, Start for justify_content).
  // Clay used implicit stretch; Taffy needs 255 (None) to activate the same default behavior.
  justifyContent: 255, alignItems: 255, alignContent: 255,
  padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
  borderTop: 0, borderRight: 0, borderBottom: 0, borderLeft: 0,
  _openWritten: false,
  gapRow: 0, gapCol: 0,
  insetTop: 0, insetRight: 0, insetBottom: 0, insetLeft: 0,
  zIndex: 0,
  bgColor: 0, cornerRadius: 0,
})

/** Vexart size kind enum (matches layout/tree.rs: 0=Auto,1=Length,2=Percent) */
export function _vxSizeKind(k: number): number {
  // SIZING from node.ts: FIT=0, GROW=1, PERCENT=2, FIXED=3
  if (k === 1 /* GROW */) return 0  // Auto
  if (k === 3 /* FIXED */) return 1  // Length
  if (k === 2 /* PERCENT */) return 2  // Percent
  return 0  // Auto (FIT maps to Auto with no flex_grow)
}

/** Vexart flex-grow from SIZING: GROW=1.0, others=0.0 */
export function _vxFlexGrow(sizing: { type: number } | null, explicit: number): number {
  if (explicit > 0) return explicit
  if (sizing?.type === 1 /* GROW */) return 1.0
  return 0.0
}

/** Vexart justify_content / align_items from ALIGN_X/ALIGN_Y enum.
 *  Rust: 0=Start, 1=End, 2=Center, 3=SpaceBetween, 255=None
 *  Clay ALIGN_X: LEFT=0, RIGHT=1, CENTER=2, SPACE_BETWEEN=3
 */
export function _vxAlign(v: number): number {
  if (v === 1 /* RIGHT/BOTTOM */) return 1
  if (v === 2 /* CENTER */) return 2
  if (v === 3 /* SPACE_BETWEEN */) return 3
  return 0 // LEFT/TOP → Start
}

/**
 * VexartLayoutCtx — Clay-compatible layout context backed by TypeScript layout.
 * Methods mirror the legacy `clay` object API for drop-in use in loop.ts.
 */
export function createVexartLayoutCtx() {
  let _viewportW = 0
  let _viewportH = 0
  let _parentStack: NodeOpenState[] = []
  let _current: NodeOpenState = _defaultOpen()
  let _allOpenStates: NodeOpenState[] = []  // order matches OPEN commands
  // Text entries — stores metadata for CMD.TEXT generation in endLayout()
  type TextEntry = { nodeId: number; content: string; color: number; fontId: number; fontSize: number }
  let _textEntries: TextEntry[] = []
  let _pendingSetId: string | null = null
  let _scrollOffsets = new Map<string, { x: number; y: number }>()
  let _scrollDataCache = new Map<string, { scrollX: number; scrollY: number; contentWidth: number; contentHeight: number; viewportWidth: number; viewportHeight: number; found: boolean }>()

  function _writeOpenCommand(state: NodeOpenState) {
    _allOpenStates.push(state)
  }

  function _writeCloseCommand() {
  }

  // Last layout result — used by writeLayoutBack to update ALL nodes
  let _lastLayoutMap: Map<number, PositionedCommand> | null = null
  function getLastLayoutMap() { return _lastLayoutMap }

  return {
    /** Access the last parsed layout map for direct node layout updates. */
    getLastLayoutMap,

    init(width: number, height: number): boolean {
      _viewportW = width
      _viewportH = height
      return true
    },

    setDimensions(width: number, height: number) {
      _viewportW = width
      _viewportH = height
    },

    destroy() {
    },

    beginLayout() {
      _parentStack = []
      _allOpenStates = []
      _textEntries = []
      _current = _defaultOpen()
      _pendingSetId = null
    },

     endLayout(): RenderCommand[] {
      const childrenByParent = new Map<number, NodeOpenState[]>()
      for (const state of _allOpenStates) {
        const children = childrenByParent.get(state.parentNodeId) ?? []
        children.push(state)
        childrenByParent.set(state.parentNodeId, children)
      }

      const measured = new Map<number, { width: number; height: number }>()
      function sizeValue(kind: number, value: number, parent: number, fallback: number) {
        if (kind === 1) return value
        if (kind === 2) return parent * value
        return fallback
      }
      function measure(state: NodeOpenState, parentW: number, parentH: number): { width: number; height: number } {
        const children = childrenByParent.get(state.nodeId) ?? []
        let innerW = 0
        let innerH = 0
        for (const child of children) {
          const childSize = measure(child, parentW, parentH)
          if (state.flexDir === 0) {
            innerW += childSize.width
            innerH = Math.max(innerH, childSize.height)
          } else {
            innerW = Math.max(innerW, childSize.width)
            innerH += childSize.height
          }
        }
        const gap = Math.max(0, children.length - 1) * state.gapRow
        if (state.flexDir === 0) innerW += gap
        else innerH += gap
        const rootW = state.flags & FLAG_IS_ROOT ? _viewportW : parentW
        const rootH = state.flags & FLAG_IS_ROOT ? _viewportH : parentH
        const fallbackW = innerW + state.padLeft + state.padRight + state.borderLeft + state.borderRight
        const fallbackH = innerH + state.padTop + state.padBottom + state.borderTop + state.borderBottom
        const width = Math.max(state.minW || 0, Math.min(state.maxW || Infinity, sizeValue(state.sizeWKind, state.sizeW, rootW, (state.flags & FLAG_IS_ROOT) ? _viewportW : fallbackW)))
        const height = Math.max(state.minH || 0, Math.min(state.maxH || Infinity, sizeValue(state.sizeHKind, state.sizeH, rootH, (state.flags & FLAG_IS_ROOT) ? _viewportH : fallbackH)))
        const result = { width, height }
        measured.set(state.nodeId, result)
        return result
      }

      const layoutMap = new Map<number, PositionedCommand>()
      function place(state: NodeOpenState, x: number, y: number, width: number, height: number) {
        const contentX = x + state.padLeft + state.borderLeft
        const contentY = y + state.padTop + state.borderTop
        const contentW = Math.max(0, width - state.padLeft - state.padRight - state.borderLeft - state.borderRight)
        const contentH = Math.max(0, height - state.padTop - state.padBottom - state.borderTop - state.borderBottom)
        layoutMap.set(state.nodeId, { nodeId: state.nodeId, x, y, width, height, contentX, contentY, contentW, contentH })
        const children = childrenByParent.get(state.nodeId) ?? []
        let cursor = state.flexDir === 0 ? contentX : contentY
        for (const child of children) {
          if (child.posKind === 1) continue
          const childSize = measured.get(child.nodeId) ?? { width: 0, height: 0 }
          const childW = child.flexGrow > 0 && state.flexDir === 0 ? contentW : childSize.width
          const childH = child.flexGrow > 0 && state.flexDir !== 0 ? contentH : childSize.height
          place(child, state.flexDir === 0 ? cursor : contentX, state.flexDir === 0 ? contentY : cursor, childW, childH)
          cursor += (state.flexDir === 0 ? childW : childH) + state.gapRow
        }
        for (const child of children) {
          if (child.posKind !== 1) continue
          const childSize = measured.get(child.nodeId) ?? { width: 0, height: 0 }
          place(child, contentX + child.insetLeft, contentY + child.insetTop, childSize.width, childSize.height)
        }
      }

      for (const root of childrenByParent.get(0) ?? []) {
        const size = measure(root, _viewportW, _viewportH)
        place(root, 0, 0, size.width, size.height)
      }
      _lastLayoutMap = layoutMap

      // ── Stacking-context command emission ─────────────────────────────────
      //
      // _allOpenStates is captured in DFS order, but rendering cannot be a raw
      // global DFS once floating zIndex enters the picture. Browsers and OS
      // compositors treat a positioned/z-ordered subtree atomically: children are
      // ordered inside their parent context and cannot escape above a sibling
      // context. We mirror that here by rebuilding the node tree from
      // parentNodeId, sorting siblings by their local floating zIndex, and then
      // emitting each subtree as a unit.
      //
      // This intentionally makes zIndex local to the parent stacking context,
      // not one global number across the whole frame. A child with zIndex=999
      // remains inside its parent window/context.

      // Build nodeId → DFS index map from _allOpenStates
      const dfsIndex = new Map<number, number>()
      for (let i = 0; i < _allOpenStates.length; i++) {
        dfsIndex.set(_allOpenStates[i].nodeId, i)
      }

      type TextEntry = { nodeId: number; content: string; color: number; fontId: number; fontSize: number }
      const textById = new Map<number, TextEntry>()
      for (const te of _textEntries) {
        textById.set(te.nodeId, te)
      }

      // Build scroll container set
      const scrollContainerIds = new Set<number>()
      for (const state of _allOpenStates) {
        if (state.flags & (FLAG_SCROLL_X | FLAG_SCROLL_Y)) {
          scrollContainerIds.add(state.nodeId)
        }
      }

      const cmds: RenderCommand[] = []

      function makeRect(pos: { x: number; y: number; width: number; height: number }, state: NodeOpenState): RenderCommand {
        return {
          type: CMD.RECTANGLE,
          x: pos.x, y: pos.y, width: pos.width, height: pos.height,
          color: [(state.bgColor >>> 24) & 0xff, (state.bgColor >>> 16) & 0xff, (state.bgColor >>> 8) & 0xff, state.bgColor & 0xff] as [number,number,number,number],
          cornerRadius: state.cornerRadius,
          extra1: 0, extra2: 0,
          nodeId: state.nodeId,
        }
      }

      function localZ(state: NodeOpenState) {
        return (state.flags & FLAG_FLOATING_ABS) ? state.zIndex : 0
      }

      function sortedChildren(parentId: number) {
        const children = childrenByParent.get(parentId) ?? []
        if (!children.some((child) => child.posKind === 1)) return children
        return [...children].sort((a, b) => {
          const z = localZ(a) - localZ(b)
          if (z !== 0) return z
          return (dfsIndex.get(a.nodeId) ?? 0) - (dfsIndex.get(b.nodeId) ?? 0)
        })
      }

      function emitText(te: TextEntry) {
        const pos = layoutMap.get(te.nodeId)
        if (!pos) return
        cmds.push({
            type: CMD.TEXT,
            x: pos.x, y: pos.y, width: pos.width, height: pos.height,
            color: [(te.color >>> 24) & 0xff, (te.color >>> 16) & 0xff, (te.color >>> 8) & 0xff, te.color & 0xff] as [number,number,number,number],
            cornerRadius: 0, extra1: te.fontSize, extra2: te.fontId, text: te.content,
            nodeId: te.nodeId,
        })
      }

      function emitNode(state: NodeOpenState) {
        const pos = layoutMap.get(state.nodeId)
        if (!pos) return

        if (state.bgColor !== 0 || state.cornerRadius !== 0) {
          cmds.push(makeRect(pos, state))
        }

        const text = textById.get(state.nodeId)
        if (text) emitText(text)

        const isScrollContainer = scrollContainerIds.has(state.nodeId)
        if (isScrollContainer) {
          cmds.push({ type: CMD.SCISSOR_START, x: pos.x, y: pos.y, width: pos.width, height: pos.height, color: [0, 0, 0, 0] as [number,number,number,number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: state.nodeId })
        }

        for (const child of sortedChildren(state.nodeId)) {
          emitNode(child)
        }

        if (isScrollContainer) {
          cmds.push({ type: CMD.SCISSOR_END, x: 0, y: 0, width: 0, height: 0, color: [0, 0, 0, 0] as [number,number,number,number], cornerRadius: 0, extra1: 0, extra2: 0 })
        }
      }

      for (const root of sortedChildren(0)) {
        emitNode(root)
      }

      return cmds
    },

    /** Set the current node's stable Vexart ID. Called right after openElement/setId. */
    setCurrentNodeId(nodeId: number) {
      if (_current) _current.nodeId = nodeId
    },

    openElement() {
      // Flush the parent's OPEN before opening a child.
      // This ensures the buffer order is: OPEN(parent) OPEN(child) ... CLOSE(child) CLOSE(parent)
      if (_parentStack.length > 0) {
        const parentState = _parentStack[_parentStack.length - 1]
        if (!parentState._openWritten) {
          _writeOpenCommand(parentState)
          parentState._openWritten = true
        }
      }
      const parent = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1] : null
      const state: NodeOpenState = _defaultOpen()
      state.parentNodeId = parent?.nodeId ?? 0
      if (_parentStack.length === 0) state.flags |= FLAG_IS_ROOT
      _pendingSetId = null
      _parentStack.push(state)
      _current = state
    },

    closeElement() {
      const state = _parentStack.pop()
      if (!state) return
      // If this node's OPEN was never written (leaf node with no children),
      // write it now before the CLOSE.
      if (!state._openWritten) {
        _writeOpenCommand(state)
      }
      _writeCloseCommand()
      _current = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1] : _defaultOpen()
    },

    setId(id: string) {
      // In legacy Clay, setId() calls openElement() internally.
      // Here we do the same: push a new state and mark the id.
      // Flush parent's OPEN first (same as openElement).
      if (_parentStack.length > 0) {
        const parentState = _parentStack[_parentStack.length - 1]
        if (!parentState._openWritten) {
          _writeOpenCommand(parentState)
          parentState._openWritten = true
        }
      }
      const parent = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1] : null
      const state: NodeOpenState = _defaultOpen()
      state.parentNodeId = parent?.nodeId ?? 0
      if (_parentStack.length === 0) state.flags |= FLAG_IS_ROOT
      _pendingSetId = id
      _parentStack.push(state)
      _current = state
    },

    configureLayout(dir: number, px: number, py: number, gap: number, ax: number, ay: number) {
      const s = _current
      s.flexDir = dir
      s.padLeft = px; s.padRight = px; s.padTop = py; s.padBottom = py
      s.gapRow = gap; s.gapCol = gap
      // Flexbox: justify_content = main axis, align_items = cross axis.
      // Vexart API: alignX = always horizontal, alignY = always vertical.
      // Column: main=Y, cross=X → swap so alignX→align_items, alignY→justify_content
      // Row:    main=X, cross=Y → no swap (alignX→justify_content, alignY→align_items)
      if (dir === 1 /* column */ || dir === 3 /* column-reverse */) {
        s.justifyContent = ay; s.alignItems = ax
      } else {
        s.justifyContent = ax; s.alignItems = ay
      }
    },

    configureLayoutFull(dir: number, padL: number, padR: number, padT: number, padB: number, gap: number, ax: number, ay: number) {
      const s = _current
      s.flexDir = dir
      s.padLeft = padL; s.padRight = padR; s.padTop = padT; s.padBottom = padB
      s.gapRow = gap; s.gapCol = gap
      if (dir === 1 || dir === 3) {
        s.justifyContent = ay; s.alignItems = ax
      } else {
        s.justifyContent = ax; s.alignItems = ay
      }
    },

    configureSizing(wType: number, wVal: number, hType: number, hVal: number) {
      const s = _current
      s.sizeWKind = _vxSizeKind(wType)
      s.sizeW = wVal
      s.sizeHKind = _vxSizeKind(hType)
      s.sizeH = hVal
      if (wType === 1 /* GROW */) s.flexGrow = 1.0
    },

    configureSizingMinMax(wType: number, wVal: number, minW: number, maxW: number, hType: number, hVal: number, minH: number, maxH: number) {
      const s = _current
      s.sizeWKind = _vxSizeKind(wType)
      s.sizeW = wVal
      s.sizeHKind = _vxSizeKind(hType)
      s.sizeH = hVal
      s.minW = minW; s.maxW = maxW; s.minH = minH; s.maxH = maxH
      if (wType === 1 /* GROW */) s.flexGrow = 1.0
    },

    configureRectangle(color: number, radius: number) {
      _current.bgColor = color
      _current.cornerRadius = radius
    },

    configureBorder(_color: number, _width: number) {
      // Border reservation noted; full border rendering handled by paint layer
      const s = _current
      const w = _width
      s.borderTop = w; s.borderRight = w; s.borderBottom = w; s.borderLeft = w
    },

    /**
     * Configure per-side border widths for space reservation.
     *
     * SUPPORTED: per-side border widths (_l, _r, _t, _b) — mapped to Taffy border.
     * NOT SUPPORTED: borderBetweenChildren (_btw) — Taffy has no equivalent;
     *   this was a Clay-specific layout primitive. Use `gap` instead.
     * NOTE: _color is ignored here; border color is applied at paint time via effects queue.
     */
    configureBorderSides(_color: number, _l: number, _r: number, _t: number, _b: number, _btw: number) {
      const s = _current
      s.borderLeft = _l; s.borderRight = _r; s.borderTop = _t; s.borderBottom = _b
    },

    /**
     * Configure a floating (absolutely-positioned) element.
     *
     * SUPPORTED (maps to Taffy absolute position with insets):
     *   - ox, oy → inset_left, inset_top (pixel offset from attach origin)
     *
     * NOT SUPPORTED (Clay-specific features with no Taffy equivalent):
     *   - attachTo (PARENT/ROOT/ELEMENT) — Taffy has no attach-point concept;
     *     all floating elements are positioned relative to their containing block.
     *   - attachPoints (ape/app — 3×3 grid anchor) — not available in Taffy.
     *   - pointerPassthrough (_pc) — must be implemented at the hit-test layer (TS-side).
     *   - elementId (_pid) — "attach to element" mode is not supported; use ox/oy directly.
      *   - zIndex (_z) — Taffy ignores paint order; endLayout() applies it when
      *     emitting subtree-atomic stacking context commands.
     *
     * The correct Taffy mapping for floating is absolute position + insets.
     * Callers that need attach-point semantics must compute ox/oy themselves.
     */
    configureFloating(attachTo: number, ox: number, oy: number, _z: number, _ape: number, _app: number, _pc: number, _pid: number) {
      const s = _current
      s.flags |= FLAG_FLOATING_ABS
      s.posKind = 1  // Absolute
      s.insetLeft = ox; s.insetTop = oy
      s.zIndex = _z
    },

    /**
     * Configure scroll/clip container flags.
     *
     * SUPPORTED: _sx/_sy set FLAG_SCROLL_X/Y on the Taffy node so that
     *   Taffy uses overflow:scroll (children are not compressed by flex_shrink).
     *
     * NOT SUPPORTED: _ox/_oy (Clay-era scroll offsets) — scroll offsets are
     *   now applied TS-side in applyScrollOffsets() after layout. These params
     *   are accepted for signature compatibility but intentionally ignored.
     */
    configureClip(_sx: boolean, _sy: boolean, _ox: number, _oy: number) {
      const s = _current
      if (_sx) s.flags |= FLAG_SCROLL_X
      if (_sy) s.flags |= FLAG_SCROLL_Y
    },

    text(_content: string, _color: number, _fontId: number, _fontSize: number, nodeId?: number, measuredW?: number, measuredH?: number) {
      // Flush parent OPEN before emitting child text node (same as openElement).
      if (_parentStack.length > 0) {
        const parentState = _parentStack[_parentStack.length - 1]
        if (!parentState._openWritten) {
          _writeOpenCommand(parentState)
          parentState._openWritten = true
        }
      }
      const state: NodeOpenState = _defaultOpen()
      if (nodeId !== undefined) state.nodeId = nodeId
      state.parentNodeId = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1].nodeId : 0
      if (measuredW !== undefined && measuredH !== undefined && measuredW > 0 && measuredH > 0) {
        state.sizeWKind = 1; state.sizeW = measuredW    // Length (Rust value 1 = Dimension::length)
        state.sizeHKind = 1; state.sizeH = measuredH    // Length (Rust value 1 = Dimension::length)
      } else {
        state.sizeWKind = 0; state.sizeHKind = 0  // Auto (0x0 without measure callback)
      }
      _writeOpenCommand(state)
      _writeCloseCommand()
      // Store text metadata for CMD.TEXT generation in endLayout()
      _textEntries.push({ nodeId: state.nodeId, content: _content, color: _color, fontId: _fontId, fontSize: _fontSize })
    },

    hashString(s: string): number {
      let h = 0x811c9dc5
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
      }
      return h >>> 0
    },

    getScrollContainerData(id: string): { scrollX: number; scrollY: number; contentWidth: number; contentHeight: number; viewportWidth: number; viewportHeight: number; found: boolean } {
      return _scrollDataCache.get(id) ?? { scrollX: 0, scrollY: 0, contentWidth: 0, contentHeight: 0, viewportWidth: 0, viewportHeight: 0, found: false }
    },

    setScrollPosition(id: string, x: number, y: number) {
      const d = _scrollDataCache.get(id)
      if (d) { d.scrollX = x; d.scrollY = y }
    },

    getElementData(label: string): { found: boolean; x: number; y: number; width: number; height: number } {
      return { found: false, x: 0, y: 0, width: 0, height: 0 }
    },
  }
}
