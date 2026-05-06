/**
 * layout-adapter.ts — VexartLayoutCtx factory backed by Flexily.
 *
 * Drop-in replacement for the legacy custom layout engine. The Flexily node
 * tree is retained on TGENode instances; this adapter only records per-frame
 * render metadata and reads computed layout from persistent nodes.
 * Returns synthetic RenderCommand[] from the positioned layout output.
 *
 * Flexily: pure JS, zero deps, zero-alloc hot path, Yoga-compatible API.
 *
 * Performance: uses parallel arrays (not WeakMap) for O(1) meta lookup,
 * and a node pool to minimize GC churn across frames.
 */

import type { RenderCommand, EffectConfig, ImagePaintConfig, CanvasPaintConfig } from "../ffi/render-graph"
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
  // Effect/image/canvas — attached directly to RenderCommand (eliminates Map.get in render-graph)
  let _effects: (EffectConfig | null)[] = []
  let _images: (ImagePaintConfig | null)[] = []
  let _canvases: (CanvasPaintConfig | null)[] = []

  // Quick lookup: Flexily Node → array index
  const _nodeToIndex = new Map<Node, number>()

  let _nodeStack: Node[] = []
  let _currentNode: Node | null = null
  let _pendingFlexNode: Node | null = null
  let _currentIdx = -1
  let _roots: Node[] = []
  const _ownedNodes = new Set<Node>()
  let _dfsCounter = 0
  let _nodeCount = 0

  // Last layout result — pre-allocated, cleared each endLayout()
  const _layoutMap = new Map<number, PositionedCommand>()
  const _childrenByParent = new Map<number, number[]>()
  const _scrollContainerIds = new Set<number>()
  const _textByNodeId = new Map<number, number>()
  const _cmds: RenderCommand[] = []
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
      _effects.push(null)
      _images.push(null)
      _canvases.push(null)
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
      _effects[idx] = null
      _images[idx] = null
      _canvases[idx] = null
    }
    _nodeToIndex.set(node, idx)
    return idx
  }

  function _pushNode(node: Node, parentId: number) {
    const idx = _addNode(node, parentId, _nodeStack.length === 0)
    if (_nodeStack.length === 0) {
      _roots.push(node)
    } else if (_ownedNodes.has(node)) {
      const parent = _nodeStack[_nodeStack.length - 1]
      if (_ownedNodes.has(parent)) parent.insertChild(node, parent.getChildCount())
    }
    _nodeStack.push(node)
    _currentNode = node
    _currentIdx = idx
  }

  function isOwnedCurrent(): boolean {
    return _currentNode !== null && _ownedNodes.has(_currentNode)
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
      for (const node of _ownedNodes) node.free()
      _ownedNodes.clear()
      _nodeCount = 0
      _roots.length = 0
      _nodeStack.length = 0
      _currentNode = null
      _pendingFlexNode = null
      _currentIdx = -1
      _nodeToIndex.clear()
    },

    beginLayout() {
      _nodeCount = 0
      _nodeStack.length = 0
      _roots.length = 0
      _currentNode = null
      _pendingFlexNode = null
      _currentIdx = -1
      _dfsCounter = 0
      _nodeToIndex.clear()
    },

    endLayout(rootNode?: Node | null): RenderCommand[] {
      const root = rootNode ?? _roots[0]
      if (root) root.calculateLayout(_viewportW, _viewportH, DIRECTION_LTR)

      // ── Stacking-context command emission ─────────────────────────────────
      // Position computation is merged into emitNode to eliminate a separate
      // collectPositions traversal (was the third full tree walk per frame).
      // Pre-allocated maps are cleared and reused (HP-2: avoid per-frame allocs).
      _layoutMap.clear()
      _childrenByParent.clear()
      _scrollContainerIds.clear()
      _textByNodeId.clear()
      _cmds.length = 0

      // Build children-by-nodeId and scroll/text lookups in one pass
      for (let i = 0; i < _nodeCount; i++) {
        const pid = _parentNodeIds[i]
        const arr = _childrenByParent.get(pid)
        if (arr) arr.push(i)
        else _childrenByParent.set(pid, [i])

        if (_isScrollX[i] || _isScrollY[i]) _scrollContainerIds.add(_nodeIds[i])
        if (_isText[i]) _textByNodeId.set(_nodeIds[i], i)
      }

      const sortedChildIndices = (parentId: number): number[] => {
        const children = _childrenByParent.get(parentId)
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

      const emitNode = (idx: number, parentAbsX: number, parentAbsY: number) => {
        const nodeId = _nodeIds[idx]
        const node = _allNodes[idx]

        // Compute absolute position on-the-fly (merged from former collectPositions)
        const absX = parentAbsX + node.getComputedLeft()
        const absY = parentAbsY + node.getComputedTop()
        const width = node.getComputedWidth()
        const height = node.getComputedHeight()

        const padL = node.getComputedPadding(EDGE_LEFT)
        const padR = node.getComputedPadding(EDGE_RIGHT)
        const padT = node.getComputedPadding(EDGE_TOP)
        const padB = node.getComputedPadding(EDGE_BOTTOM)
        const borL = node.getComputedBorder(EDGE_LEFT)
        const borR = node.getComputedBorder(EDGE_RIGHT)
        const borT = node.getComputedBorder(EDGE_TOP)
        const borB = node.getComputedBorder(EDGE_BOTTOM)

        // Store in _layoutMap for writeLayoutBack and downstream consumers
        _layoutMap.set(nodeId, {
          nodeId,
          x: absX, y: absY, width, height,
          contentX: absX + padL + borL,
          contentY: absY + padT + borT,
          contentW: Math.max(0, width - padL - padR - borL - borR),
          contentH: Math.max(0, height - padT - padB - borT - borB),
        })

        const bgColor = _bgColors[idx]
        if (bgColor !== 0 || _cornerRadii[idx] !== 0) {
          const cmd: RenderCommand = {
            type: CMD.RECTANGLE,
            x: absX, y: absY, width, height,
            color: bgColor >>> 0,
            cornerRadius: _cornerRadii[idx],
            extra1: 0, extra2: 0,
            nodeId,
          }
          if (_effects[idx]) cmd.effect = _effects[idx]!
          if (_images[idx]) cmd.image = _images[idx]!
          if (_canvases[idx]) cmd.canvas = _canvases[idx]!
          _cmds.push(cmd)
        }

        const textIdx = _textByNodeId.get(nodeId)
        if (textIdx !== undefined) {
          _cmds.push({
            type: CMD.TEXT,
            x: absX, y: absY, width, height,
            color: _textColors[textIdx] >>> 0,
            cornerRadius: 0, extra1: _textFontSizes[textIdx], extra2: _textFontIds[textIdx],
            text: _textContents[textIdx],
            nodeId,
          })
        }

        const isScroll = _scrollContainerIds.has(nodeId)
        if (isScroll) {
          _cmds.push({ type: CMD.SCISSOR_START, x: absX, y: absY, width, height, color: 0, cornerRadius: 0, extra1: 0, extra2: 0, nodeId })
        }

        for (const childIdx of sortedChildIndices(nodeId)) {
          emitNode(childIdx, absX, absY)
        }

        if (isScroll) {
          _cmds.push({ type: CMD.SCISSOR_END, x: 0, y: 0, width: 0, height: 0, color: 0, cornerRadius: 0, extra1: 0, extra2: 0 })
        }
      }

      for (const childIdx of sortedChildIndices(0)) {
        emitNode(childIdx, 0, 0)
      }

      _lastLayoutMap = _layoutMap
      return _cmds
    },

    setCurrentNodeId(nodeId: number) {
      if (_currentIdx >= 0) _nodeIds[_currentIdx] = nodeId
    },

    setCurrentFlexNode(node: Node | null) {
      _pendingFlexNode = node
    },

    openElement() {
      const node = _pendingFlexNode ?? Node.create()
      if (!_pendingFlexNode) _ownedNodes.add(node)
      _pendingFlexNode = null
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

    configureRectangle(color: number, radius: number) {
      if (_currentIdx >= 0) {
        _bgColors[_currentIdx] = color
        _cornerRadii[_currentIdx] = radius
      }
    },

    setEffect(effect: EffectConfig) {
      if (_currentIdx >= 0) _effects[_currentIdx] = effect
    },

    setImage(image: ImagePaintConfig) {
      if (_currentIdx >= 0) _images[_currentIdx] = image
    },

    setCanvas(canvas: CanvasPaintConfig) {
      if (_currentIdx >= 0) _canvases[_currentIdx] = canvas
    },

    configureBorder(_width: number) {
      if (!isOwnedCurrent()) { void _width; return }
      _currentNode!.setBorder(EDGE_ALL, _width)
    },

    configureBorderSides(_l: number, _r: number, _t: number, _b: number, _btw: number) {
      if (!isOwnedCurrent()) { void _l; void _r; void _t; void _b; void _btw; return }
      const node = _currentNode!
      if (_l > 0) node.setBorder(EDGE_LEFT, _l)
      if (_r > 0) node.setBorder(EDGE_RIGHT, _r)
      if (_t > 0) node.setBorder(EDGE_TOP, _t)
      if (_b > 0) node.setBorder(EDGE_BOTTOM, _b)
    },

    configureFloating(attachTo: number, ox: number, oy: number, _z: number, _ape: number, _app: number, _pc: number, _pid: number) {
      if (!_currentNode || _currentIdx < 0) return
      void attachTo; void ox; void oy; void _ape; void _app; void _pc; void _pid
      _isFloating[_currentIdx] = true
      _zIndexes[_currentIdx] = _z
      if (!isOwnedCurrent()) return
      _currentNode.setPositionType(POSITION_TYPE_ABSOLUTE)
      if (ox !== 0) _currentNode.setPosition(EDGE_LEFT, ox)
      if (oy !== 0) _currentNode.setPosition(EDGE_TOP, oy)
    },

    configureClip(_sx: boolean, _sy: boolean, _ox: number, _oy: number) {
      if (!_currentNode || _currentIdx < 0) return
      void _ox; void _oy
      if (_sx) _isScrollX[_currentIdx] = true
      if (_sy) _isScrollY[_currentIdx] = true
      if (isOwnedCurrent() && (_sx || _sy)) _currentNode.setOverflow(OVERFLOW_SCROLL)
    },

    text(_content: string, _color: number, _fontId: number, _fontSize: number, nodeId?: number, measuredW?: number, measuredH?: number, _fontFamily?: string, _fontWeight?: number, _fontStyle?: string) {
      void measuredW; void measuredH; void _fontFamily; void _fontWeight; void _fontStyle
      const node = _pendingFlexNode ?? Node.create()
      if (!_pendingFlexNode) _ownedNodes.add(node)
      _pendingFlexNode = null
      const parentId = _nodeStack.length > 0 ? _nodeIds[_nodeToIndex.get(_nodeStack[_nodeStack.length - 1])!] : 0
      const idx = _addNode(node, parentId, _nodeStack.length === 0)

      _nodeIds[idx] = nodeId ?? 0
      _isText[idx] = true
      _textContents[idx] = _content
      _textColors[idx] = _color
      _textFontIds[idx] = _fontId
      _textFontSizes[idx] = _fontSize

      if (_nodeStack.length === 0) {
        _roots.push(node)
      }
    },

    hashString(s: string): number {
      let h = 0x811c9dc5
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
      }
      return h >>> 0
    },

  }
}
