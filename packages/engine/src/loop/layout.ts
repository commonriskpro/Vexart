/**
 * layout.ts — Layout writeback + interaction state management.
 *
 * Contains standalone functions that were previously closures inside
 * `createRenderLoop`. Each function receives its dependencies as explicit
 * parameters (state bag pattern) instead of capturing them via closure.
 *
 * Extracted from loop.ts as part of Phase 3 Slice 1.3.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Downstream-First
 */

import type { TGENode } from "../ffi/node"
import { createPressEvent } from "../ffi/node"
import { focusedId, setFocusedId, getNodeFocusId } from "../reconciler/focus"
import { buildNodeMouseEvent, getEffectivePosition, isFullyOutsideScrollViewport, isPointInsideScrollViewports } from "../reconciler/hit-test"
import { isInteractiveNode } from "./predicates"
// ── Stacking-order sorting ───────────────────────────────────────────────
function localStackingZ(node: TGENode) {
  return node.props.floating ? (node.props.zIndex ?? 0) : 0
}

function depth(node: TGENode) {
  // Use cached _depth from walkTree when available (O(1) vs O(d) parent walk)
  if (node._depth > 0) return node._depth
  let total = 0
  let current: TGENode | null = node
  while (current) {
    total++
    current = current.parent
  }
  return total
}

export function compareStackingPaintOrder(a: TGENode, b: TGENode) {
  if (a === b) return 0

  let left = a
  let right = b
  let leftDepth = depth(left)
  let rightDepth = depth(right)

  while (leftDepth > rightDepth && left.parent) {
    left = left.parent
    leftDepth--
  }
  while (rightDepth > leftDepth && right.parent) {
    right = right.parent
    rightDepth--
  }

  if (left === right) return depth(a) - depth(b)

  while (left.parent && right.parent && left.parent !== right.parent) {
    left = left.parent
    right = right.parent
  }

  const z = localStackingZ(left) - localStackingZ(right)
  if (z !== 0) return z
  return left._siblingIndex - right._siblingIndex
}

export function sortNodesByStackingPaintOrder(nodes: TGENode[]) {
  const needsSort = nodes.some((node) => !!node.props.floating && (node.props.zIndex ?? 0) !== 0)
  if (!needsSort) return nodes
  return [...nodes].sort(compareStackingPaintOrder)
}

// ── Interactive state (hover/active/focus) ────────────────────────────────

/**
 * State bag for updateInteractiveStates.
 * The coordinator passes these slices in and owns all mutable fields.
 */
export type InteractiveStatesBag = {
  rectNodes: TGENode[]
  rectNodeById: Map<number, TGENode>
  pointerX: number
  pointerY: number
  pointerDown: boolean
  pointerDirty: boolean
  pendingPress: boolean
  pendingRelease: boolean
  capturedNodeId: number
  pressOriginSet: boolean
  prevActiveNode: TGENode | null
  /** Scroll offsets keyed by scroll container nodeId. Used for hit-testing without mutating node.layout. */
  scrollOffsets: Map<number, { x: number; y: number }>
  /** Called when any interaction state changes (triggers repaint). */
  onChanged: () => void
  /** Called when a specific node had visual-only interaction state changes. */
  onNodeVisualChanged?: (node: TGENode) => void
}

// ── Hit-testing helper ────────────────────────────────────────────────────

function hitTestNode(
  node: TGENode,
  pointerX: number,
  pointerY: number,
  isCaptured: boolean,
  scrollOffsets: Map<number, { x: number; y: number }>,
): boolean {
  if (isCaptured) return true
  if (!isPointInsideScrollViewports(node, pointerX, pointerY, scrollOffsets)) return false
  const l = node.layout

  // HP-6: Compute effective screen position with scroll offset
  const effectivePosition = getEffectivePosition(node, scrollOffsets)
  const effectiveX = effectivePosition.x
  const effectiveY = effectivePosition.y

  // Transform-aware hit-test: use accumulated inverse matrix if present
  const hitInverse = node._accTransformInverse ?? node._transformInverse
  if (hitInverse) {
    const relX = pointerX - effectiveX
    const relY = pointerY - effectiveY
    const w = hitInverse[6] * relX + hitInverse[7] * relY + hitInverse[8]
    if (Math.abs(w) <= 1e-12) return false
    const localX = (hitInverse[0] * relX + hitInverse[1] * relY + hitInverse[2]) / w
    const localY = (hitInverse[3] * relX + hitInverse[4] * relY + hitInverse[5]) / w
    const hitW = l.width
    const hitH = l.height
    const hitX = 0
    const hitY = 0
    return (
      localX >= hitX - 0.5 &&
      localX < hitX + hitW + 0.5 &&
      localY >= hitY - 0.5 &&
      localY < hitY + hitH + 0.5
    )
  }

  // Standard axis-aligned hit-test
  const hitW = l.width
  const hitH = l.height
  const hitX = effectiveX
  const hitY = effectiveY
  return (
    pointerX >= hitX - 0.5 &&
    pointerX < hitX + hitW + 0.5 &&
    pointerY >= hitY - 0.5 &&
    pointerY < hitY + hitH + 0.5
  )
}

// ── Scroll viewport culling ──────────────────────────────────────────────

/** Returns true if node is outside its scroll viewport and should be skipped. */
function clearOffscreenInteractiveState(
  node: TGENode,
  bag: InteractiveStatesBag,
): { skip: boolean; changed: boolean } {
  if (node.props.scrollX || node.props.scrollY) return { skip: false, changed: false }

  const fullyOutsideViewport = isFullyOutsideScrollViewport(node)
  let scrollParent = node.parent
  while (scrollParent) {
    if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
      if (fullyOutsideViewport) {
        let changed = false
        if (node._hovered) {
          node._hovered = false
          node._vpDirty = true
          if (node.props.hoverStyle) { changed = true; bag.onNodeVisualChanged?.(node) }
        }
        if (node._active) {
          node._active = false
          node._vpDirty = true
          if (node.props.activeStyle) { changed = true; bag.onNodeVisualChanged?.(node) }
        }
        return { skip: true, changed }
      }
      break
    }
    scrollParent = scrollParent.parent
  }
  return { skip: !!(scrollParent && fullyOutsideViewport), changed: false }
}

// ── Click target resolution ──────────────────────────────────────────────

/**
 * Resolve which node should receive onPress.
 * Three scenarios:
 *   A) Normal: was active, now released while still hovered
 *   B) Fast click: press+release in same frame
 *   C) Node recycled: use hovered node at release position
 */
function resolveClickTarget(
  bag: InteractiveStatesBag,
  justPressed: boolean,
  justReleased: boolean,
  pressedThisFrame: TGENode | null,
  hoveredPressTarget: TGENode | null,
): TGENode | null {
  if (bag.prevActiveNode && !bag.prevActiveNode._active && bag.prevActiveNode._hovered) {
    return bag.prevActiveNode // Scenario A
  }
  if (justPressed && justReleased) return pressedThisFrame // Scenario B
  if (justReleased && bag.pressOriginSet) return hoveredPressTarget // Scenario C
  return null
}

// ── onPress bubbling ─────────────────────────────────────────────────────

function dispatchPress(clickTarget: TGENode) {
  const event = createPressEvent()
  let target: TGENode | null = clickTarget
  while (target && !event.propagationStopped) {
    if (target.props.focusable) {
      const fid = getNodeFocusId(target)
      if (fid) setFocusedId(fid)
    }
    if (target.props.onPress) target.props.onPress(event)
    else if (target.props.onClick) target.props.onClick(event)
    target = target.parent
  }
}

// ── Post-click focus sync ────────────────────────────────────────────────

function syncFocusStateAfterClick(
  bag: InteractiveStatesBag,
  previousFocusId: string | null | undefined,
): boolean {
  const newFocusId = focusedId()
  if (newFocusId === previousFocusId) return false
  let changed = false
  for (const node of bag.rectNodes) {
    if (!node.props.focusable) continue
    const nodeFocusId = getNodeFocusId(node)
    const isFocused = nodeFocusId !== undefined && nodeFocusId === newFocusId
    if (node._focused !== isFocused) {
      node._focused = isFocused
      node._vpDirty = true
      if (node.props.focusStyle) {
        bag.onNodeVisualChanged?.(node)
        changed = true
      }
    }
  }
  return changed
}

// ── Main orchestrator ────────────────────────────────────────────────────

/**
 * Track nodes with interactive styles for hit-testing + focus bridging.
 * Also dispatches per-node mouse callbacks (onMouseDown/Up/Move/Over/Out).
 *
 * Mutates `bag` fields: pendingPress, pendingRelease, pressOriginSet,
 * prevActiveNode, capturedNodeId, pointerDirty.
 *
 * Returns true if a click was dispatched (focus/onPress fired).
 */
export function updateInteractiveStates(bag: InteractiveStatesBag): boolean {
  let changed = false
  const currentFocusId = focusedId()

  // 1. Consume queued press/release edges
  const justPressed = bag.pendingPress
  const justReleased = bag.pendingRelease
  bag.pendingPress = false
  bag.pendingRelease = false

  const captureNode = bag.capturedNodeId !== 0 ? (bag.rectNodeById.get(bag.capturedNodeId) ?? null) : null

  // 2. Walk all interactive nodes — hit-test, update hover/active, dispatch mouse events
  const paintOrderedRectNodes = sortNodesByStackingPaintOrder(bag.rectNodes)
  let newActiveNode: TGENode | null = null
  let pressedThisFrame: TGENode | null = null
  let hoveredPressTarget: TGENode | null = null

  for (const node of paintOrderedRectNodes) {
    if (!isInteractiveNode(node.props)) continue

    // Skip off-screen nodes inside scroll containers
    const offscreen = clearOffscreenInteractiveState(node, bag)
    if (offscreen.changed) changed = true
    if (offscreen.skip) continue

    const isCaptured = captureNode === node
    const isOver = hitTestNode(node, bag.pointerX, bag.pointerY, isCaptured, bag.scrollOffsets)
    const isDown = isOver && bag.pointerDown
    if (isOver && (node.props.onPress || node.props.onClick || node.props.focusable)) hoveredPressTarget = node

    // Dispatch mouse enter/leave
    if (node._hovered !== isOver) {
      if (isOver && node.props.onMouseOver) node.props.onMouseOver(buildNodeMouseEvent(node, bag.pointerX, bag.pointerY))
      if (!isOver && node.props.onMouseOut) node.props.onMouseOut(buildNodeMouseEvent(node, bag.pointerX, bag.pointerY))
      node._hovered = isOver
      node._vpDirty = true
      if (node.props.hoverStyle) { bag.onNodeVisualChanged?.(node); changed = true }
    }

    // Dispatch mousedown/mouseup on edges
    if (isOver && justPressed) {
      pressedThisFrame = node
      bag.pressOriginSet = true
      if (node.props.onMouseDown) node.props.onMouseDown(buildNodeMouseEvent(node, bag.pointerX, bag.pointerY))
    }
    if (isOver && justReleased && node.props.onMouseUp) node.props.onMouseUp(buildNodeMouseEvent(node, bag.pointerX, bag.pointerY))

    // Dispatch mousemove while hovered
    if (isOver && bag.pointerDirty && node.props.onMouseMove) node.props.onMouseMove(buildNodeMouseEvent(node, bag.pointerX, bag.pointerY))

    // Update active state
    if (node._active !== isDown) {
      node._active = isDown
      node._vpDirty = true
      if (node.props.activeStyle) { bag.onNodeVisualChanged?.(node); changed = true }
    }
    if (isDown) newActiveNode = node

    // Bridge focus system
    if (node.props.focusable) {
      const nodeFocusId = getNodeFocusId(node)
      const isFocused = nodeFocusId !== undefined && nodeFocusId === currentFocusId
      if (node._focused !== isFocused) {
        node._focused = isFocused
        node._vpDirty = true
        if (node.props.focusStyle) { bag.onNodeVisualChanged?.(node); changed = true }
      }
    }
  }

  // 3. Resolve click target and dispatch
  const clickTarget = resolveClickTarget(bag, justPressed, justReleased, pressedThisFrame, hoveredPressTarget)
  if (justReleased) bag.pressOriginSet = false

  if (clickTarget) {
    dispatchPress(clickTarget)
    if (syncFocusStateAfterClick(bag, currentFocusId)) changed = true
  }

  // 4. Cleanup
  bag.prevActiveNode = newActiveNode
  if (justReleased && bag.capturedNodeId !== 0) bag.capturedNodeId = 0
  bag.pointerDirty = false
  if (changed) bag.onChanged()

  return !!clickTarget
}
