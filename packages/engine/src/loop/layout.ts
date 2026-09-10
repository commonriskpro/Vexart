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
import { getGridLayoutError, resolveProps, createPressEvent } from "../ffi/node"
import type { DamageRect } from "../ffi/damage"
import { unionRect } from "../ffi/damage"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import type { PositionedCommand } from "./layout-adapter"
import {
  fromConfig,
  identity,
  invert,
  multiply,
  translate,
  isIdentity,
} from "../ffi/matrix"
import { focusedId, setFocusedId, getNodeFocusId } from "../reconciler/focus"
import { buildNodeMouseEvent, getEffectivePosition, isFullyOutsideScrollViewport, isPointInsideScrollViewports } from "../reconciler/hit-test"
import { isInteractiveNode } from "./predicates"

// ── Layout writeback ──────────────────────────────────────────────────────

/**
 * State bag for writeLayoutBack.
 * All mutable state that the function reads or writes.
 */
export type WriteLayoutBackState = {
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  pendingNodeDamageRects?: Array<{ nodeId: number; rect: DamageRect }>
  scrollOffsets?: Map<number, { x: number; y: number }>
}

function isNonEmptyLayoutRect(rect: { width: number; height: number }) {
  return rect.width > 0 && rect.height > 0
}

function isFiniteLayoutPosition(pos: PositionedCommand | undefined): pos is PositionedCommand {
  return !!pos
    && Number.isFinite(pos.x)
    && Number.isFinite(pos.y)
    && Number.isFinite(pos.width)
    && Number.isFinite(pos.height)
}

export function damageRectForLayoutTransition(
  prev: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number },
): DamageRect | null {
  const prevRect = isNonEmptyLayoutRect(prev)
    ? { x: prev.x, y: prev.y, width: prev.width, height: prev.height }
    : null
  const nextRect = isNonEmptyLayoutRect(next)
    ? { x: next.x, y: next.y, width: next.width, height: next.height }
    : null
  if (!prevRect && !nextRect) return null
  if (!prevRect) return nextRect
  if (!nextRect) return prevRect
  // No damage if layout is unchanged
  if (prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) return null
  return unionRect(prevRect, nextRect)
}

/**
 * After layout compute, write geometry back to TGENodes.
 *
 * Uses the layout map from the TypeScript layout adapter to write
 * exact position+size into every box and text node's .layout field.
 *
 * @param layoutMap  Vexart per-node positioned layout (from layout-adapter.getLastLayoutMap())
 * @param state      Mutable node lists (mutated in-place)
 */
export function writeLayoutBack(
  layoutMap: Map<number, PositionedCommand> | null,
  state: WriteLayoutBackState,
): boolean {
  const { rectNodes, textNodes, boxNodes, pendingNodeDamageRects } = state

  // A missing map is not a layout pass. More importantly, Flexily keeps the
  // prior Grid rects when calculation returns an error; the adapter may still
  // expose those computed accessors for this frame. Do not publish a partial
  // frame (or clear transforms/damage) until the complete map is validated.
  if (!layoutMap || layoutMap.size === 0) return false
  for (const node of boxNodes) {
    if (!isFiniteLayoutPosition(layoutMap.get(node.id)) || getGridLayoutError(node)) return false
  }
  for (const node of textNodes) {
    if (!isFiniteLayoutPosition(layoutMap.get(node.id)) || getGridLayoutError(node)) return false
  }

  // Use the layout map directly for all box and text nodes. Validation above
  // deliberately happens before the first write, making writeback atomic for
  // Grid errors and malformed/partial maps alike.
  for (const node of boxNodes) {
    const pos = layoutMap.get(node.id)!
    const prev = { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
    node.layout.x = pos.x
    node.layout.y = pos.y
    node.layout.width = pos.width
    node.layout.height = pos.height
    const damage = damageRectForLayoutTransition(prev, node.layout)
    if (damage && pendingNodeDamageRects) pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
  }
  for (const node of textNodes) {
    const pos = layoutMap.get(node.id)!
    const prev = { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
    node.layout.x = pos.x
    node.layout.y = pos.y
    node.layout.width = pos.width
    node.layout.height = pos.height
    const damage = damageRectForLayoutTransition(prev, node.layout)
    if (damage && pendingNodeDamageRects) pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
  }

  // ── Transform hierarchy ──
  // Pass 1: Compute LOCAL transform matrices on boxNodes.
  // This runs AFTER layout so we know w/h for transformOrigin.
  for (const node of boxNodes) {
    const vp = resolveProps(node)
    if (vp.transform) {
      const l = node.layout
      const originProp = vp.transformOrigin
      let ox = l.width / 2, oy = l.height / 2 // default: center
      if (originProp === "top-left") { ox = 0; oy = 0 }
      else if (originProp === "top-right") { ox = l.width; oy = 0 }
      else if (originProp === "bottom-left") { ox = 0; oy = l.height }
      else if (originProp === "bottom-right") { ox = l.width; oy = l.height }
      else if (originProp && typeof originProp === "object") { ox = originProp.x * l.width; oy = originProp.y * l.height }

      const matrix = fromConfig(vp.transform, ox, oy)
      if (!isIdentity(matrix)) {
        node._transform = matrix
        node._transformInverse = invert(matrix)
      } else {
        node._transform = null
        node._transformInverse = null
      }
    } else {
      node._transform = null
      node._transformInverse = null
    }
  }
  for (const node of textNodes) {
    node._transform = null
    node._transformInverse = null
  }

  // Pass 2: Propagate transform hierarchy for hit-testing.
  //
  // Rendering uses SUBTREE TEMP BUFFER approach (post-pass in reverse depth
  // order). Hit-testing needs the COMPOSED inverse of ALL transforms in the
  // ancestor chain so that screen-space pointer coords map correctly to a
  // node's local coordinate space.
  //
  // For a node N inside Parent(M2) inside Root(M1), the post-pass applies:
  //   1. M2 centered on Parent (inner)
  //   2. M1 centered on Root (outer)
  //
  // To invert for hit-testing, we compose the FORWARD matrices rebased to
  // N's coord space (outer first), then invert once:
  //   forward = rebase(M1, root→N) × rebase(M2, parent→N) [× rebase(M_own, 0,0)]
  //   hit_inverse = forward^(-1)
  //
  // rebase(M, offset) = T(-offset) × M × T(offset)
  // This shifts M's origin from its own center to N's local space.

  // TODO(perf): Cache _anyAncestorHasTransform flag during walkTree to skip
  // this O(depth) ancestor walk when no transforms exist in the subtree.
  function computeAccTransform(node: TGENode): void {
    const vp = resolveProps(node)
    if (!vp.transform) {
      node._transform = null
      node._transformInverse = null
    }

    // Collect all ancestors with transforms, from outermost to innermost
    const chain: TGENode[] = []
    let pa = node.parent
    while (pa) {
      if (pa._transform) chain.push(pa)
      pa = pa.parent
    }
    // chain is innermost-first; reverse to get outermost-first
    chain.reverse()

    const hasOwnTransform = !!node._transform
    const hasAncestorTransform = chain.length > 0

    if (!hasOwnTransform && !hasAncestorTransform) {
      node._accTransform = null
      node._accTransformInverse = null
      return
    }

    // For nodes with ONLY their own transform (no ancestors), keep the
    // simple path: accumulated = local. This preserves the original
    // behavior that's proven to work for leaf transforms.
    if (hasOwnTransform && !hasAncestorTransform) {
      node._accTransform = node._transform
      node._accTransformInverse = node._transformInverse
      return
    }

    const nl = getEffectivePosition(node, state.scrollOffsets)

    // Compose forward matrix in ABSOLUTE coordinates.
    // Each _transform operates in its own local space (origin baked in via
    // fromConfig). Lift each to absolute: T(anc) × M × T(-anc).
    let absForward = identity()
    for (const anc of chain) {
      const al = getEffectivePosition(anc, state.scrollOffsets)
      absForward = multiply(absForward, multiply(multiply(translate(al.x, al.y), anc._transform!), translate(-al.x, -al.y)))
    }
    if (hasOwnTransform) {
      absForward = multiply(absForward, multiply(multiply(translate(nl.x, nl.y), node._transform!), translate(-nl.x, -nl.y)))
    }

    // Rebase to node-local for the hit-test code which passes (pointer - layout):
    //   forwardLocal = T(-nl) × absForward × T(nl)
    // maps node-local → (screen - layout), so inv maps (pointer - layout) → node-local.
    const forwardLocal = multiply(multiply(translate(-nl.x, -nl.y), absForward), translate(nl.x, nl.y))
    node._accTransform = forwardLocal
    node._accTransformInverse = invert(forwardLocal)
  }

  for (const node of boxNodes) computeAccTransform(node)
  for (const node of textNodes) computeAccTransform(node)
  return true
}

export function updateCommandsToLayoutMap(
  commands: RenderCommand[],
  layoutMap: Map<number, PositionedCommand> | null,
) {
  if (!layoutMap || layoutMap.size === 0) return

  for (const command of commands) {
    if (command.type === CMD.SCISSOR_END || command.nodeId === undefined) continue
    const pos = layoutMap.get(command.nodeId)
    if (!pos) continue
    command.x = pos.x
    command.y = pos.y
    command.width = pos.width
    command.height = pos.height
  }
}

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
  /** Terminal cell dimensions for minimum hit-area expansion. */
  cellWidth: number
  cellHeight: number
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
  cellW: number,
  cellH: number,
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
    const hitW = Math.max(l.width, cellW)
    const hitH = Math.max(l.height, cellH)
    const hitX = -(hitW - l.width) / 2
    const hitY = -(hitH - l.height) / 2
    return localX >= hitX && localX < hitX + hitW && localY >= hitY && localY < hitY + hitH
  }

  // Standard axis-aligned hit-test
  const hitW = Math.max(l.width, cellW)
  const hitH = Math.max(l.height, cellH)
  const hitX = effectiveX - (hitW - l.width) / 2
  const hitY = effectiveY - (hitH - l.height) / 2
  return pointerX >= hitX && pointerX < hitX + hitW && pointerY >= hitY && pointerY < hitY + hitH
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
    const isOver = hitTestNode(node, bag.pointerX, bag.pointerY, bag.cellWidth, bag.cellHeight, isCaptured, bag.scrollOffsets)
    const isDown = isOver && bag.pointerDown
    if (isOver && (node.props.onPress || node.props.focusable)) hoveredPressTarget = node

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
