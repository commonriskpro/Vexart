/**
 * Flexily Node Tree
 *
 * Tree operations, hierarchy management, and transaction snapshotting for flexbox/grid layout.
 */

import * as C from "./constants.js"
import { type FlexInfo } from "./types.js"
import { traversalStack } from "./utils.js"
import type {
  GridCalculateResult,
  GridIntrinsicContribution,
  GridLayoutError,
} from "./grid/grid-model.js"
import type { GridIntrinsicCycleCache } from "./grid/grid-intrinsic-cycle.js"
import type { Node } from "./node-zero.js"

export type GridStateSnapshot = {
  readonly node: Node
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly flex: FlexInfo
  readonly dirty: boolean
  readonly hasNewLayout: boolean
  readonly lastCalcW: number
  readonly lastCalcH: number
  readonly lastCalcDir: number
  readonly gridCache: GridIntrinsicCycleCache | undefined
  readonly gridContributions: readonly GridIntrinsicContribution[]
  readonly gridResult: GridCalculateResult | null
  readonly gridError: GridLayoutError | null
  readonly gridValidationError: GridLayoutError | null
}

export function cloneGridCache(cache: GridIntrinsicCycleCache | undefined): GridIntrinsicCycleCache | undefined {
  if (!cache) return undefined
  return { entries: new Map(cache.entries), hits: cache.hits, misses: cache.misses }
}

/**
 * Update the ancestor bit used to guard Grid error transactions.
 */
export function refreshGridDescendant(node: Node): void {
  let current: Node | null = node
  while (current !== null) {
    let hasGrid = false
    for (const child of current._children) {
      if (child._gridMode || child._hasGridDescendant) {
        hasGrid = true
        break
      }
    }
    if (current._hasGridDescendant === hasGrid) break
    current._hasGridDescendant = hasGrid
    current = current._parent
  }
}

/**
 * Insert a child node at the specified index with cycle guard and sibling invalidation.
 */
export function insertChildNode(parent: Node, child: Node, index: number): void {
  if (child === parent) {
    throw new Error("Cannot insert a node as a child of itself")
  }
  let ancestor: Node | null = parent._parent
  while (ancestor !== null) {
    if (ancestor === child) {
      throw new Error("Cannot insert an ancestor as a child (would create a cycle)")
    }
    ancestor = ancestor._parent
  }

  if (child._parent !== null) {
    child._parent.removeChild(child)
  }
  child._parent = parent
  const clampedIndex = Math.max(0, Math.min(index, parent._children.length))
  parent._children.splice(clampedIndex, 0, child)
  for (let i = clampedIndex + 1; i < parent._children.length; i++) {
    parent._children[i]!._flex.layoutValid = false
  }
  refreshGridDescendant(parent)
}

/**
 * Remove a child node from parent and invalidate sibling layout validity.
 */
export function removeChildNode(parent: Node, child: Node): boolean {
  const index = parent._children.indexOf(child)
  if (index !== -1) {
    parent._children.splice(index, 1)
    child._parent = null
    for (let i = index; i < parent._children.length; i++) {
      parent._children[i]!._flex.layoutValid = false
    }
    refreshGridDescendant(parent)
    return true
  }
  return false
}

/**
 * Detach node from parent and children.
 */
export function freeNode(node: Node): void {
  if (node._parent !== null) {
    node._parent.removeChild(node)
  }
  for (const child of node._children) {
    child._parent = null
  }
  node._children = []
  node._hasGridDescendant = false
}

/**
 * Free root and all descendants iteratively to avoid stack overflow.
 */
export function freeRecursiveNode(root: Node): void {
  const nodes: Node[] = []
  traversalStack.length = 0
  traversalStack.push(root)
  while (traversalStack.length > 0) {
    const current = traversalStack.pop() as Node
    nodes.push(current)
    for (const child of current._children) {
      traversalStack.push(child)
    }
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    nodes[i]!.free()
  }
}

/**
 * Reset this node to a clean initial state for reuse.
 */
export function resetNode(node: Node): void {
  if (node._parent !== null) {
    node._parent.removeChild(node)
    node._parent = null
  }
  for (const child of node._children) {
    child._parent = null
  }
  node._children.length = 0
  node._hasGridDescendant = false

  node.resetStyle()

  node._layoutMode = "flex"
  node._gridMode = false
  node._gridStyle = null
  node._gridItemStyle = {}
  node._gridIntrinsicMeasureFunc = null
  node._gridRevision = 0
  node._gridIntrinsicCache = undefined
  node._gridContributions = []
  node._gridResult = null
  node._gridError = null
  node._gridValidationError = null

  node._measureFunc = null
  node._baselineFunc = null

  node._m0 = undefined
  node._m1 = undefined
  node._m2 = undefined
  node._m3 = undefined
  node._lc0 = undefined
  node._lc1 = undefined
  node._measureResult.width = 0
  node._measureResult.height = 0
  node._layoutResult.width = 0
  node._layoutResult.height = 0

  node._layout.left = 0
  node._layout.top = 0
  node._layout.width = 0
  node._layout.height = 0

  node._flex.mainSize = 0
  node._flex.baseSize = 0
  node._flex.mainMargin = 0
  node._flex.flexGrow = 0
  node._flex.flexShrink = 0
  node._flex.minMain = 0
  node._flex.maxMain = Infinity
  node._flex.mainStartMarginAuto = false
  node._flex.mainEndMarginAuto = false
  node._flex.mainStartMarginValue = 0
  node._flex.mainEndMarginValue = 0
  node._flex.marginL = 0
  node._flex.marginT = 0
  node._flex.marginR = 0
  node._flex.marginB = 0
  node._flex.frozen = false
  node._flex.lineIndex = 0
  node._flex.relativeIndex = -1
  node._flex.baseline = 0
  node._flex.lastAvailW = NaN
  node._flex.lastAvailH = NaN
  node._flex.lastOffsetX = NaN
  node._flex.lastOffsetY = NaN
  node._flex.lastAbsX = NaN
  node._flex.lastAbsY = NaN
  node._flex.layoutValid = false
  node._flex.lastDir = 0

  node._isDirty = true
  node._hasNewLayout = false
  node._lastCalcW = NaN
  node._lastCalcH = NaN
  node._lastCalcDir = 0
}

/**
 * Reset layout cache entries for a node and all its descendants.
 */
export function resetLayoutCacheTree(root: Node): void {
  traversalStack.length = 0
  traversalStack.push(root)
  while (traversalStack.length > 0) {
    const node = traversalStack.pop() as Node
    if (node._lc0) node._lc0.availW = -1
    if (node._lc1) node._lc1.availW = -1
    for (const child of node._children) {
      traversalStack.push(child)
    }
  }
}

/**
 * Capture transaction state across all descendants for nested Grid error recovery.
 */
export function captureGridState(root: Node): GridStateSnapshot[] {
  const snapshots: GridStateSnapshot[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const current = stack.pop() as Node
    const layout = current._layout
    snapshots.push({
      node: current,
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
      flex: { ...current._flex },
      dirty: current._isDirty,
      hasNewLayout: current._hasNewLayout,
      lastCalcW: current._lastCalcW,
      lastCalcH: current._lastCalcH,
      lastCalcDir: current._lastCalcDir,
      gridCache: cloneGridCache(current._gridIntrinsicCache),
      gridContributions: current._gridContributions,
      gridResult: current._gridResult,
      gridError: current._gridError,
      gridValidationError: current._gridValidationError,
    })
    for (const child of current._children) stack.push(child)
  }
  return snapshots
}

/**
 * Restore transaction state across captured snapshots after a nested Grid error.
 */
export function restoreGridState(snapshots: readonly GridStateSnapshot[]): void {
  for (const snapshot of snapshots) {
    const current = snapshot.node
    current._layout.left = snapshot.left
    current._layout.top = snapshot.top
    current._layout.width = snapshot.width
    current._layout.height = snapshot.height
    Object.assign(current._flex, snapshot.flex)
    current._isDirty = snapshot.dirty
    current._hasNewLayout = snapshot.hasNewLayout
    current._lastCalcW = snapshot.lastCalcW
    current._lastCalcH = snapshot.lastCalcH
    current._lastCalcDir = snapshot.lastCalcDir
    current._gridIntrinsicCache = cloneGridCache(snapshot.gridCache)
    current._gridContributions = snapshot.gridContributions
    current._gridResult = snapshot.gridResult
    current._gridError = snapshot.gridError
    current._gridValidationError = snapshot.gridValidationError
  }
}

/**
 * Check for any Grid errors in visible descendant nodes.
 */
export function findGridDescendantError(root: Node): GridLayoutError | null {
  const stack = [...root._children]
  while (stack.length > 0) {
    const current = stack.pop() as Node
    if (current.style.display === C.DISPLAY_NONE) continue
    if (current._gridError) return current._gridError
    if (current._hasGridDescendant) {
      for (const child of current._children) stack.push(child)
    }
  }
  return null
}
