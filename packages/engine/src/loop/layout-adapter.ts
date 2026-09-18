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

import { Node, DISPLAY_NONE, DIRECTION_LTR, type GridLayoutError } from "flexily"
import type { TGENode } from "../ffi/node"

// ── Layout constants ──────────────────────────────────────────────────────



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
 * VexartLayoutCtx — layout context backed by Flexily.
 * Methods provide the walk-tree adapter API used by the render loop.
 */
export function createVexartLayoutCtx() {
  let _viewportW = 0
  let _viewportH = 0
  let _lastLayoutError: GridLayoutError | null = null
  let _hasAnyTransforms = false

  let _nodeStack: Node[] = []
  const _gridErrorStack: Node[] = []
  let _currentNode: Node | null = null
  let _pendingFlexNode: Node | null = null
  let _roots: Node[] = []
  const _ownedNodes = new Set<Node>()

  /** Find an error on this retained root or any nested Grid node. */
  function findGridError(root: Node): GridLayoutError | null {
    _gridErrorStack.length = 0
    _gridErrorStack.push(root)
    while (_gridErrorStack.length > 0) {
      const node = _gridErrorStack.pop()!
      // A hidden subtree is excluded from layout. Ignore retained Grid
      // results from an earlier visible pass while looking for errors to
      // publish for the current frame.
      if (node.style.display === DISPLAY_NONE) continue
      if (node.isGridMode()) {
        const error = node.getGridResult()?.error
        if (error) {
          _gridErrorStack.length = 0
          return error
        }
      }
      for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index)
        if (child && child.style.display !== DISPLAY_NONE) _gridErrorStack.push(child)
      }
    }
    return null
  }

  /**
   * Calculate every retained root through Flexily's single entry point.
   * Grid is a mode on the same Node, so this deliberately does not create a
   * second solver call or a second geometry map.
   * resulting local rects through the existing computed-layout accessors.
   */
  function calculateRootsInternal(roots: readonly Node[]): GridLayoutError | null {
    for (const root of roots) {
      const result = root.calculateLayout(_viewportW, _viewportH, DIRECTION_LTR)
      if (result?.error) return result.error
      // Flexily's Flex dispatcher intentionally returns void even when a
      // nested Grid returns an error. Inspect the same retained tree so the
      // engine never publishes a parent layout around an invalid child.
      const error = findGridError(root)
      if (error) return error
    }
    return null
  }

  function _pushNode(node: Node) {
    if (_nodeStack.length === 0) {
      _roots.push(node)
    } else if (_ownedNodes.has(node)) {
      const parent = _nodeStack[_nodeStack.length - 1]
      if (_ownedNodes.has(parent)) parent.insertChild(node, parent.getChildCount())
    }
    _nodeStack.push(node)
    _currentNode = node
  }

  return {
    getLastLayoutError() { return _lastLayoutError },
    get hasAnyTransforms() { return _hasAnyTransforms },
    set hasAnyTransforms(val: boolean) { _hasAnyTransforms = val },

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
      _roots.length = 0
      _nodeStack.length = 0
      _gridErrorStack.length = 0
      _currentNode = null
      _pendingFlexNode = null
      _lastLayoutError = null
    },

    beginLayout() {
      _nodeStack.length = 0
      _roots.length = 0
      _currentNode = null
      _pendingFlexNode = null
      _hasAnyTransforms = false
    },

    calculateRoots(rootNode?: Node | null): GridLayoutError | null {
      const roots = rootNode
        ? [rootNode, ..._roots.filter((root) => root !== rootNode)]
        : _roots
      const error = calculateRootsInternal(roots)
      _lastLayoutError = error
      return error
    },

    setCurrentNodeId(_nodeId: number) {},

    setNodeRefById(_map: Map<number, TGENode> | null) {},

    setCurrentFlexNode(node: Node | null) {
      _pendingFlexNode = node
    },

    openElement() {
      const node = _pendingFlexNode ?? Node.create()
      if (!_pendingFlexNode) _ownedNodes.add(node)
      _pendingFlexNode = null
      _pushNode(node)
    },

    closeElement() {
      if (_nodeStack.length === 0) return
      _nodeStack.pop()
      _currentNode = _nodeStack.length > 0 ? _nodeStack[_nodeStack.length - 1] : null
    },

    setId(_id: string) {
      this.openElement()
    },

  }
}
