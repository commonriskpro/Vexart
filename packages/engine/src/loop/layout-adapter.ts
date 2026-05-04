/**
 * layout-adapter.ts — VexartLayoutCtx factory backed by Flexily.
 *
 * Drop-in replacement for the legacy custom layout engine. Builds a
 * Flexily node tree during walkTree open/close/configure calls, then
 * computes layout via Flexily's calculateLayout() in endLayout().
 * Returns synthetic RenderCommand[] from the positioned layout output.
 *
 * Flexily: pure JS, zero deps, zero-alloc hot path, Yoga-compatible API.
 *
 * Performance: uses parallel arrays (not WeakMap) for O(1) meta lookup,
 * and a node pool to minimize GC churn across frames.
 */

import type { RenderCommand } from "../ffi/render-graph"
import { CMD as _CMD_RG } from "../ffi/render-graph"
import {
  Node,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  POSITION_TYPE_ABSOLUTE,
  OVERFLOW_SCROLL,
  EDGE_LEFT,
  EDGE_TOP,
  EDGE_RIGHT,
  EDGE_BOTTOM,
  EDGE_ALL,
  GUTTER_ALL,
  DIRECTION_LTR,
  ALIGN_FLEX_START,
  ALIGN_FLEX_END,
  ALIGN_CENTER,
  ALIGN_SPACE_BETWEEN,
  ALIGN_STRETCH,
  JUSTIFY_FLEX_START,
  JUSTIFY_FLEX_END,
  JUSTIFY_CENTER,
  JUSTIFY_SPACE_BETWEEN,
  MEASURE_MODE_UNDEFINED,
  MEASURE_MODE_AT_MOST,
  MEASURE_MODE_EXACTLY,
} from "flexily"
import { measureTextConstrained, measureForLayout } from "../ffi/text-layout"

// ── Layout constants ──────────────────────────────────────────────────────

/** CMD constants for layout adapter render commands. */
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

/**
 * Map Vexart ALIGN_X/ALIGN_Y (0=left/top, 1=right/bottom, 2=center, 3=space-between)
 * to Flexily justify constants.
 */
function mapJustify(v: number): number {
  if (v === 1) return JUSTIFY_FLEX_END
  if (v === 2) return JUSTIFY_CENTER
  if (v === 3) return JUSTIFY_SPACE_BETWEEN
  return JUSTIFY_FLEX_START  // 0 or default
}

/**
 * Map Vexart ALIGN_X/ALIGN_Y to Flexily align constants.
 * 255 = "None" in the old adapter → maps to ALIGN_STRETCH (Yoga/Flexily default for alignItems).
 */
function mapAlign(v: number): number {
  if (v === 255) return ALIGN_STRETCH
  if (v === 1) return ALIGN_FLEX_END
  if (v === 2) return ALIGN_CENTER
  if (v === 3) return ALIGN_SPACE_BETWEEN
  return ALIGN_FLEX_START  // 0 or default
}

/**
 * VexartLayoutCtx — layout context backed by Flexily.
 * Methods provide the walk-tree adapter API used by the render loop.
 */
export function createVexartLayoutCtx() {
  let _viewportW = 0
  let _viewportH = 0

  // ── Parallel arrays for O(1) meta access ──
  // Index matches position in _allNodes. Avoids WeakMap overhead entirely.
  let _allNodes: Node[] = []
  let _nodeIds: number[] = []          // per-node Vexart ID
  let _parentNodeIds: number[] = []    // parent's Vexart ID (0=root)
  let _isFloating: boolean[] = []
  let _isScrollX: boolean[] = []
  let _isScrollY: boolean[] = []
  let _zIndexes: number[] = []
  let _bgColors: number[] = []
  let _cornerRadii: number[] = []
  let _dfsIndexes: number[] = []
  // Text meta — only for text nodes
  let _isText: boolean[] = []
  let _textContents: string[] = []
  let _textColors: number[] = []
  let _textFontIds: number[] = []
  let _textFontSizes: number[] = []

  // Quick lookup: Flexily Node → array index
  const _nodeToIndex = new Map<Node, number>()

  let _nodeStack: Node[] = []
  let _currentNode: Node | null = null
  let _currentIdx = -1
  let _roots: Node[] = []
  let _dfsCounter = 0
  let _nodeCount = 0

  // Scroll data cache (legacy compat)
  const _scrollDataCache = new Map<string, { scrollX: number; scrollY: number; contentWidth: number; contentHeight: number; viewportWidth: number; viewportHeight: number; found: boolean }>()

  // Last layout result
  let _lastLayoutMap: Map<number, PositionedCommand> | null = null
  function getLastLayoutMap() { return _lastLayoutMap }

  function _addNode(node: Node, parentId: number, isRoot: boolean): number {
    const idx = _nodeCount++
    if (idx >= _allNodes.length) {
      // Grow arrays (amortized)
      _allNodes.push(node)
      _nodeIds.push(0)
      _parentNodeIds.push(parentId)
      _isFloating.push(false)
      _isScrollX.push(false)
      _isScrollY.push(false)
      _zIndexes.push(0)
      _bgColors.push(0)
      _cornerRadii.push(0)
      _dfsIndexes.push(_dfsCounter++)
      _isText.push(false)
      _textContents.push("")
      _textColors.push(0)
      _textFontIds.push(0)
      _textFontSizes.push(0)
    } else {
      // Reuse slot
      _allNodes[idx] = node
      _nodeIds[idx] = 0
      _parentNodeIds[idx] = parentId
      _isFloating[idx] = false
      _isScrollX[idx] = false
      _isScrollY[idx] = false
      _zIndexes[idx] = 0
      _bgColors[idx] = 0
      _cornerRadii[idx] = 0
      _dfsIndexes[idx] = _dfsCounter++
      _isText[idx] = false
      _textContents[idx] = ""
      _textColors[idx] = 0
      _textFontIds[idx] = 0
      _textFontSizes[idx] = 0
    }
    _nodeToIndex.set(node, idx)
    return idx
  }

  function _pushNode(node: Node, parentId: number) {
    const idx = _addNode(node, parentId, _nodeStack.length === 0)

    if (_nodeStack.length > 0) {
      const parent = _nodeStack[_nodeStack.length - 1]
      parent.insertChild(node, parent.getChildCount())
    } else {
      _roots.push(node)
    }

    _nodeStack.push(node)
    _currentNode = node
    _currentIdx = idx
  }

  return {
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
      for (let i = 0; i < _nodeCount; i++) {
        _allNodes[i].free()
      }
      _nodeCount = 0
      _roots.length = 0
      _nodeStack.length = 0
      _currentNode = null
      _currentIdx = -1
      _nodeToIndex.clear()
    },

    beginLayout() {
      // Free previous tree nodes
      for (let i = 0; i < _nodeCount; i++) {
        _allNodes[i].free()
      }
      _nodeCount = 0
      _nodeStack.length = 0
      _roots.length = 0
      _currentNode = null
      _currentIdx = -1
      _dfsCounter = 0
      _nodeToIndex.clear()
    },

    endLayout(): RenderCommand[] {
      // Compute layout for each root
      for (const root of _roots) {
        root.calculateLayout(_viewportW, _viewportH, DIRECTION_LTR)
      }

      // TODO(perf): Merge position collection into walkTree postorder to eliminate
      // this third full tree traversal. Currently: walkTree → calculateLayout → collectPositions.
      // Collect absolute positions by walking the Flexily tree
      const layoutMap = new Map<number, PositionedCommand>()

      const collectPositions = (node: Node, parentAbsX: number, parentAbsY: number) => {
        const idx = _nodeToIndex.get(node)
        if (idx === undefined) return

        const left = node.getComputedLeft()
        const top = node.getComputedTop()
        const width = node.getComputedWidth()
        const height = node.getComputedHeight()

        const absX = parentAbsX + left
        const absY = parentAbsY + top

        const padL = node.getComputedPadding(EDGE_LEFT)
        const padR = node.getComputedPadding(EDGE_RIGHT)
        const padT = node.getComputedPadding(EDGE_TOP)
        const padB = node.getComputedPadding(EDGE_BOTTOM)
        const borL = node.getComputedBorder(EDGE_LEFT)
        const borR = node.getComputedBorder(EDGE_RIGHT)
        const borT = node.getComputedBorder(EDGE_TOP)
        const borB = node.getComputedBorder(EDGE_BOTTOM)

        layoutMap.set(_nodeIds[idx], {
          nodeId: _nodeIds[idx],
          x: absX, y: absY, width, height,
          contentX: absX + padL + borL,
          contentY: absY + padT + borT,
          contentW: Math.max(0, width - padL - padR - borL - borR),
          contentH: Math.max(0, height - padT - padB - borT - borB),
        })

        const childCount = node.getChildCount()
        for (let i = 0; i < childCount; i++) {
          const child = node.getChild(i)
          if (child) collectPositions(child, absX, absY)
        }
      }

      for (const root of _roots) {
        collectPositions(root, 0, 0)
      }

      _lastLayoutMap = layoutMap

      // ── Stacking-context command emission ─────────────────────────────────
      // Build children-by-nodeId and scroll/text lookups in one pass
      const childrenByParent = new Map<number, number[]>()  // parentNodeId → child indices
      const scrollContainerIds = new Set<number>()
      const textByNodeId = new Map<number, number>()  // nodeId → index

      for (let i = 0; i < _nodeCount; i++) {
        const pid = _parentNodeIds[i]
        const arr = childrenByParent.get(pid)
        if (arr) arr.push(i)
        else childrenByParent.set(pid, [i])

        if (_isScrollX[i] || _isScrollY[i]) scrollContainerIds.add(_nodeIds[i])
        if (_isText[i]) textByNodeId.set(_nodeIds[i], i)
      }

      const cmds: RenderCommand[] = []

      const sortedChildIndices = (parentId: number): number[] => {
        const children = childrenByParent.get(parentId)
        if (!children) return []
        let hasFloating = false
        for (let i = 0; i < children.length; i++) {
          if (_isFloating[children[i]]) { hasFloating = true; break }
        }
        if (!hasFloating) return children
        return [...children].sort((a, b) => {
          const za = _isFloating[a] ? _zIndexes[a] : 0
          const zb = _isFloating[b] ? _zIndexes[b] : 0
          const z = za - zb
          if (z !== 0) return z
          return _dfsIndexes[a] - _dfsIndexes[b]
        })
      }

      const emitNode = (idx: number) => {
        const nodeId = _nodeIds[idx]
        const pos = layoutMap.get(nodeId)
        if (!pos) return

        const bgColor = _bgColors[idx]
        if (bgColor !== 0 || _cornerRadii[idx] !== 0) {
          cmds.push({
            type: CMD.RECTANGLE,
            x: pos.x, y: pos.y, width: pos.width, height: pos.height,
            color: [(bgColor >>> 24) & 0xff, (bgColor >>> 16) & 0xff, (bgColor >>> 8) & 0xff, bgColor & 0xff] as [number, number, number, number],
            cornerRadius: _cornerRadii[idx],
            extra1: 0, extra2: 0,
            nodeId,
          })
        }

        const textIdx = textByNodeId.get(nodeId)
        if (textIdx !== undefined) {
          const tc = _textColors[textIdx]
          cmds.push({
            type: CMD.TEXT,
            x: pos.x, y: pos.y, width: pos.width, height: pos.height,
            color: [(tc >>> 24) & 0xff, (tc >>> 16) & 0xff, (tc >>> 8) & 0xff, tc & 0xff] as [number, number, number, number],
            cornerRadius: 0, extra1: _textFontSizes[textIdx], extra2: _textFontIds[textIdx],
            text: _textContents[textIdx],
            nodeId,
          })
        }

        const isScroll = scrollContainerIds.has(nodeId)
        if (isScroll) {
          cmds.push({ type: CMD.SCISSOR_START, x: pos.x, y: pos.y, width: pos.width, height: pos.height, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId })
        }

        for (const childIdx of sortedChildIndices(nodeId)) {
          emitNode(childIdx)
        }

        if (isScroll) {
          cmds.push({ type: CMD.SCISSOR_END, x: 0, y: 0, width: 0, height: 0, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0 })
        }
      }

      for (const childIdx of sortedChildIndices(0)) {
        emitNode(childIdx)
      }

      return cmds
    },

    setCurrentNodeId(nodeId: number) {
      if (_currentIdx >= 0) _nodeIds[_currentIdx] = nodeId
    },

    openElement() {
      const node = Node.create()
      const parentId = _nodeStack.length > 0 ? _nodeIds[_nodeToIndex.get(_nodeStack[_nodeStack.length - 1])!] : 0
      _pushNode(node, parentId)
    },

    closeElement() {
      if (_nodeStack.length === 0) return
      _nodeStack.pop()
      if (_nodeStack.length > 0) {
        _currentNode = _nodeStack[_nodeStack.length - 1]
        _currentIdx = _nodeToIndex.get(_currentNode)!
      } else {
        _currentNode = null
        _currentIdx = -1
      }
    },

    setId(_id: string) {
      this.openElement()
    },

    configureLayout(dir: number, px: number, py: number, gap: number, ax: number, ay: number) {
      if (!_currentNode) return
      const node = _currentNode

      node.setFlexDirection(dir === 0 ? FLEX_DIRECTION_ROW : FLEX_DIRECTION_COLUMN)

      node.setPadding(EDGE_LEFT, px)
      node.setPadding(EDGE_RIGHT, px)
      node.setPadding(EDGE_TOP, py)
      node.setPadding(EDGE_BOTTOM, py)

      if (gap > 0) node.setGap(GUTTER_ALL, gap)

      if (dir === 1) {
        node.setJustifyContent(mapJustify(ay))
        node.setAlignItems(mapAlign(ax))
      } else {
        node.setJustifyContent(mapJustify(ax))
        node.setAlignItems(mapAlign(ay))
      }
    },

    configureLayoutFull(dir: number, padL: number, padR: number, padT: number, padB: number, gap: number, ax: number, ay: number) {
      if (!_currentNode) return
      const node = _currentNode

      node.setFlexDirection(dir === 0 ? FLEX_DIRECTION_ROW : FLEX_DIRECTION_COLUMN)

      node.setPadding(EDGE_LEFT, padL)
      node.setPadding(EDGE_RIGHT, padR)
      node.setPadding(EDGE_TOP, padT)
      node.setPadding(EDGE_BOTTOM, padB)

      if (gap > 0) node.setGap(GUTTER_ALL, gap)

      if (dir === 1 || dir === 3) {
        node.setJustifyContent(mapJustify(ay))
        node.setAlignItems(mapAlign(ax))
      } else {
        node.setJustifyContent(mapJustify(ax))
        node.setAlignItems(mapAlign(ay))
      }
    },

    configureMargin(left: number, right: number, top: number, bottom: number) {
      if (!_currentNode) return
      const node = _currentNode

      if (left > 0) node.setMargin(EDGE_LEFT, left)
      if (right > 0) node.setMargin(EDGE_RIGHT, right)
      if (top > 0) node.setMargin(EDGE_TOP, top)
      if (bottom > 0) node.setMargin(EDGE_BOTTOM, bottom)
    },

    configureSizing(wType: number, wVal: number, hType: number, hVal: number) {
      if (!_currentNode) return
      const node = _currentNode

      // SIZING: FIT=0, GROW=1, PERCENT=2, FIXED=3
      // NOTE: Vexart stores PERCENT as a 0-1 ratio (e.g. 1.0 = 100%).
      // Flexily expects 0-100 (e.g. 100 = 100%). Multiply by 100.
      switch (wType) {
        case 0: /* FIT */ break
        case 1: /* GROW */ node.setFlexGrow(1); break
        case 2: /* PERCENT */ node.setWidthPercent(wVal * 100); break
        case 3: /* FIXED */ node.setWidth(wVal); break
      }

      switch (hType) {
        case 0: /* FIT */ break
        case 1: /* GROW */ node.setFlexGrow(1); break
        case 2: /* PERCENT */ node.setHeightPercent(hVal * 100); break
        case 3: /* FIXED */ node.setHeight(hVal); break
      }
    },

    configureSizingMinMax(wType: number, wVal: number, minW: number, maxW: number, hType: number, hVal: number, minH: number, maxH: number) {
      if (!_currentNode) return
      this.configureSizing(wType, wVal, hType, hVal)

      const node = _currentNode
      if (minW > 0) node.setMinWidth(minW)
      if (maxW < 100000) node.setMaxWidth(maxW)
      if (minH > 0) node.setMinHeight(minH)
      if (maxH < 100000) node.setMaxHeight(maxH)
    },

    configureRectangle(color: number, radius: number) {
      if (_currentIdx >= 0) {
        _bgColors[_currentIdx] = color
        _cornerRadii[_currentIdx] = radius
      }
    },

    configureBorder(_color: number, _width: number) {
      if (!_currentNode) return
      _currentNode.setBorder(EDGE_ALL, _width)
    },

    configureBorderSides(_color: number, _l: number, _r: number, _t: number, _b: number, _btw: number) {
      if (!_currentNode) return
      const node = _currentNode
      if (_l > 0) node.setBorder(EDGE_LEFT, _l)
      if (_r > 0) node.setBorder(EDGE_RIGHT, _r)
      if (_t > 0) node.setBorder(EDGE_TOP, _t)
      if (_b > 0) node.setBorder(EDGE_BOTTOM, _b)
    },

    configureFloating(attachTo: number, ox: number, oy: number, _z: number, _ape: number, _app: number, _pc: number, _pid: number) {
      if (!_currentNode || _currentIdx < 0) return
      _isFloating[_currentIdx] = true
      _zIndexes[_currentIdx] = _z
      _currentNode.setPositionType(POSITION_TYPE_ABSOLUTE)
      if (ox !== 0) _currentNode.setPosition(EDGE_LEFT, ox)
      if (oy !== 0) _currentNode.setPosition(EDGE_TOP, oy)
    },

    configureClip(_sx: boolean, _sy: boolean, _ox: number, _oy: number) {
      if (!_currentNode || _currentIdx < 0) return
      if (_sx) _isScrollX[_currentIdx] = true
      if (_sy) _isScrollY[_currentIdx] = true
      if (_sx || _sy) _currentNode.setOverflow(OVERFLOW_SCROLL)
    },

    text(_content: string, _color: number, _fontId: number, _fontSize: number, nodeId?: number, measuredW?: number, measuredH?: number) {
      const node = Node.create()
      const parentId = _nodeStack.length > 0 ? _nodeIds[_nodeToIndex.get(_nodeStack[_nodeStack.length - 1])!] : 0
      const idx = _addNode(node, parentId, _nodeStack.length === 0)

      _nodeIds[idx] = nodeId ?? 0
      _isText[idx] = true
      _textContents[idx] = _content
      _textColors[idx] = _color
      _textFontIds[idx] = _fontId
      _textFontSizes[idx] = _fontSize

      if (_nodeStack.length > 0) {
        const parent = _nodeStack[_nodeStack.length - 1]
        parent.insertChild(node, parent.getChildCount())
      } else {
        _roots.push(node)
      }

      // Use Flexily measure function for text nodes so word-wrapped height
      // is computed correctly when the parent constrains width.
      const content = _content
      const fontId = _fontId
      const fontSize = _fontSize
      node.setMeasureFunc((width, widthMode, _height, _heightMode) => {
        const maxW = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width
        if (maxW === Infinity || maxW <= 0) {
          // No width constraint — return natural (single-line) dimensions
          const natural = measureForLayout(content, fontId, fontSize)
          return { width: natural.width, height: natural.height }
        }
        return measureTextConstrained(content, fontId, fontSize, maxW)
      })
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
