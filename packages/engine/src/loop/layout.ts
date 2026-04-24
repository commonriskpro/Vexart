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

import type { TGENode, NodeMouseEvent } from "../ffi/node"
import { resolveProps, createPressEvent } from "../ffi/node"
import type { DamageRect } from "../ffi/damage"
import { unionRect } from "../ffi/damage"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import type { NativeInteractionFrameInput, NativePointerEventRecord } from "../ffi/native-scene-events"
import { NATIVE_EVENT_FLAG, NATIVE_EVENT_KIND, nativeInteractionFrame, nativePressChain } from "../ffi/native-scene-events"
import type { PositionedCommand } from "../ffi/layout-writeback"
import {
  fromConfig,
  identity,
  invert,
  multiply,
  translate,
  isIdentity,
} from "../ffi/matrix"
import { nativeSceneSetLayout, nativeSceneSetProp } from "../ffi/native-scene"
import { focusedId, setFocusedId, getNodeFocusId } from "../reconciler/focus"
import { buildNodeMouseEvent, isFullyOutsideScrollViewport } from "../reconciler/hit-test"

function syncNativeInteractiveState(node: TGENode) {
  nativeSceneSetProp(node._nativeId, "__hovered", node._hovered)
  nativeSceneSetProp(node._nativeId, "__active", node._active)
  nativeSceneSetProp(node._nativeId, "__focused", node._focused)
}

function syncNativeFocusState(node: TGENode) {
  nativeSceneSetProp(node._nativeId, "__focused", node._focused)
}

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
  syncNativeLayout?: boolean
}

function isNonEmptyLayoutRect(rect: { width: number; height: number }) {
  return rect.width > 0 && rect.height > 0
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
  return unionRect(prevRect, nextRect)
}

/**
 * After layout compute, write geometry back to TGENodes.
 *
 * Uses the vexart layout map (from vexart_layout_compute / Taffy) to write
 * exact position+size into every box and text node's .layout field.
 *
 * @param layoutMap  Vexart per-node positioned layout (from layout-adapter.getLastLayoutMap())
 * @param state      Mutable node lists (mutated in-place)
 */
export function writeLayoutBack(
  layoutMap: Map<bigint, PositionedCommand> | null,
  state: WriteLayoutBackState,
) {
  const { rectNodes, textNodes, boxNodes, pendingNodeDamageRects } = state
  const syncNativeLayout = state.syncNativeLayout ?? true

  // Use vexart layout map directly for all box and text nodes.
  // The map is always populated by vexart_layout_compute (Taffy).
  if (layoutMap && layoutMap.size > 0) {
    for (const node of boxNodes) {
      const pos = layoutMap.get(BigInt(node.id))
      if (pos) {
        const prev = { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
        node.layout.x = pos.x
        node.layout.y = pos.y
        node.layout.width = pos.width
        node.layout.height = pos.height
        const damage = damageRectForLayoutTransition(prev, node.layout)
        if (damage && pendingNodeDamageRects) pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
        if (syncNativeLayout) nativeSceneSetLayout(node._nativeId, pos.x, pos.y, pos.width, pos.height)
      }
    }
    for (const node of textNodes) {
      const pos = layoutMap.get(BigInt(node.id))
      if (pos) {
        const prev = { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
        node.layout.x = pos.x
        node.layout.y = pos.y
        node.layout.width = pos.width
        node.layout.height = pos.height
        const damage = damageRectForLayoutTransition(prev, node.layout)
        if (damage && pendingNodeDamageRects) pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
        if (syncNativeLayout) nativeSceneSetLayout(node._nativeId, pos.x, pos.y, pos.width, pos.height)
      }
    }
  }

  // For box nodes that had backgroundColor, layout was already written via RECT.
  // For box nodes WITHOUT backgroundColor, attempt to inherit from their first
  // child's command position. This is an approximation — full accuracy would
  // require Clay to expose per-element layout (which it doesn't via commands).
  // NOTE: This is a best-effort. Nodes with no background and no children
  // will have layout { 0, 0, 0, 0 } until a more precise approach is added.

  // ── Transform hierarchy ──
  // Pass 1: Compute LOCAL transform matrices on rectNodes (nodes with RECT commands).
  // This runs AFTER layout so we know w/h for transformOrigin.
  for (const node of rectNodes) {
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

  function computeAccTransform(node: TGENode): void {
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

    const nl = node.layout

    // Compose forward matrix in ABSOLUTE coordinates.
    // Each _transform operates in its own local space (origin baked in via
    // fromConfig). Lift each to absolute: T(anc) × M × T(-anc).
    let absForward = identity()
    for (const anc of chain) {
      const al = anc.layout
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
}

export function updateCommandsToLayoutMap(
  commands: RenderCommand[],
  layoutMap: Map<bigint, PositionedCommand> | null,
) {
  if (!layoutMap || layoutMap.size === 0) return

  for (const command of commands) {
    if (command.type === CMD.SCISSOR_END || command.nodeId === undefined) continue
    const pos = layoutMap.get(BigInt(command.nodeId))
    if (!pos) continue
    command.x = pos.x
    command.y = pos.y
    command.width = pos.width
    command.height = pos.height
  }
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
  /** Called when any interaction state changes (triggers repaint). */
  onChanged: () => void
  /** Dispatch click callbacks from the native retained scene chain. */
  useNativePressDispatch?: boolean
  /** Dispatch hover/active/mouse callbacks from native retained scene records. */
  useNativeInteractionDispatch?: boolean
}

export type NativePressChainReader = (x: number, y: number) => NativePointerEventRecord[]

export function dispatchNativePressChain(
  nodes: TGENode[],
  x: number,
  y: number,
  readChain: NativePressChainReader = nativePressChain,
) {
  const chain = readChain(x, y)
  if (chain.length === 0) return false

  const nodeByNativeId = new Map<bigint, TGENode>()
  for (const node of nodes) {
    if (node._nativeId) nodeByNativeId.set(node._nativeId, node)
  }

  const event = createPressEvent()
  let dispatched = false

  for (const record of chain) {
    if (event.propagationStopped) break
    const node = nodeByNativeId.get(record.nodeId)
    if (!node) continue

    if ((record.flags & NATIVE_EVENT_FLAG.FOCUSABLE) === NATIVE_EVENT_FLAG.FOCUSABLE && node.props.focusable) {
      const fid = getNodeFocusId(node)
      if (fid) setFocusedId(fid)
      dispatched = true
    }

    if ((record.flags & NATIVE_EVENT_FLAG.ON_PRESS) === NATIVE_EVENT_FLAG.ON_PRESS && node.props.onPress) {
      node.props.onPress(event)
      dispatched = true
    }
  }

  return dispatched
}

export type NativeInteractionFrameReader = (input: NativeInteractionFrameInput) => NativePointerEventRecord[]

function eventFromNativeRecord(record: NativePointerEventRecord): NodeMouseEvent {
  return {
    x: record.x,
    y: record.y,
    nodeX: record.nodeX,
    nodeY: record.nodeY,
    width: record.width,
    height: record.height,
  }
}

export function dispatchNativeInteractionFrame(
  bag: InteractiveStatesBag,
  readFrame: NativeInteractionFrameReader = nativeInteractionFrame,
) {
  // JS-CALLBACK-SHELL: Rust owns retained hit-testing and interactive state;
  // this function only mirrors native records into JS node caches and invokes
  // user callbacks stored on TGENode props.
  const records = readFrame({
    x: bag.pointerX,
    y: bag.pointerY,
    pointerDown: bag.pointerDown,
    pointerDirty: bag.pointerDirty,
    pendingPress: bag.pendingPress,
    pendingRelease: bag.pendingRelease,
  })

  const justReleased = bag.pendingRelease
  bag.pendingPress = false
  bag.pendingRelease = false
  bag.pointerDirty = false
  if (justReleased) {
    bag.pressOriginSet = false
    bag.capturedNodeId = 0
  }

  const nodeByNativeId = new Map<bigint, TGENode>()
  for (const node of bag.rectNodes) {
    if (node._nativeId) nodeByNativeId.set(node._nativeId, node)
  }

  const currentFocusId = focusedId()
  const event = createPressEvent()
  let changed = false
  let hadClick = false

  for (const record of records) {
    const node = nodeByNativeId.get(record.nodeId)
    if (!node) continue
    const mouse = eventFromNativeRecord(record)

    if (record.eventKind === NATIVE_EVENT_KIND.MOUSE_OVER) {
      if (!node._hovered) { node._hovered = true; changed = true }
      if (node.props.onMouseOver) node.props.onMouseOver(mouse)
      continue
    }

    if (record.eventKind === NATIVE_EVENT_KIND.MOUSE_OUT) {
      if (node._hovered) { node._hovered = false; changed = true }
      if (node.props.onMouseOut) node.props.onMouseOut(mouse)
      continue
    }

    if (record.eventKind === NATIVE_EVENT_KIND.MOUSE_DOWN) {
      bag.pressOriginSet = true
      if (!node._active) { node._active = true; changed = true }
      bag.prevActiveNode = node
      if (node.props.onMouseDown) node.props.onMouseDown(mouse)
      continue
    }

    if (record.eventKind === NATIVE_EVENT_KIND.MOUSE_UP) {
      if (node._active) { node._active = false; changed = true }
      if (node.props.onMouseUp) node.props.onMouseUp(mouse)
      continue
    }

    if (record.eventKind === NATIVE_EVENT_KIND.ACTIVE_END) {
      if (node._active) { node._active = false; changed = true }
      continue
    }

    if (record.eventKind === NATIVE_EVENT_KIND.MOUSE_MOVE) {
      if (node.props.onMouseMove) node.props.onMouseMove(mouse)
      continue
    }

    if (record.eventKind === NATIVE_EVENT_KIND.PRESS_CANDIDATE) {
      if (event.propagationStopped) continue
      if ((record.flags & NATIVE_EVENT_FLAG.FOCUSABLE) === NATIVE_EVENT_FLAG.FOCUSABLE && node.props.focusable) {
        const fid = getNodeFocusId(node)
        if (fid) setFocusedId(fid)
        hadClick = true
        changed = true
      }
      if ((record.flags & NATIVE_EVENT_FLAG.ON_PRESS) === NATIVE_EVENT_FLAG.ON_PRESS && node.props.onPress) {
        node.props.onPress(event)
        hadClick = true
        changed = true
      }
    }
  }

  const newFocusId = focusedId()
  if (newFocusId !== currentFocusId) {
    for (const node of bag.rectNodes) {
      if (!node.props.focusable) continue
      const nodeFocusId = getNodeFocusId(node)
      const isFocused = nodeFocusId !== undefined && nodeFocusId === newFocusId
      if (node._focused !== isFocused) {
        node._focused = isFocused
        syncNativeFocusState(node)
        changed = true
      }
    }
  }

  if (changed) bag.onChanged()
  return { hadClick, changed }
}

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
  if (bag.useNativeInteractionDispatch) {
    return dispatchNativeInteractionFrame(bag).hadClick
  }

  // COMPAT-FALLBACK: Full TS hit-test/hover/active loop. Retained native
  // frames bypass this branch unless native interaction dispatch is disabled
  // by runtime flags or tests explicitly exercise the compatibility path.
  let changed = false
  const currentFocusId = focusedId()

  // Edge detection for button press/release — consume queued edges.
  // These are accumulated between frames by feedPointer() so that
  // press+release in the same onData chunk doesn't get lost.
  const justPressed = bag.pendingPress
  const justReleased = bag.pendingRelease
  bag.pendingPress = false
  bag.pendingRelease = false

  // Check if a node has pointer capture — if so, it receives all events
  const captureNode = bag.capturedNodeId !== 0 ? (bag.rectNodeById.get(bag.capturedNodeId) ?? null) : null

  function makeMouseEvent(node: TGENode): NodeMouseEvent {
    return buildNodeMouseEvent(node, bag.pointerX, bag.pointerY)
  }

  // Walk all rect nodes (they have layout) and check hover/active/focus
  let newActiveNode: TGENode | null = null
  let pressedThisFrame: TGENode | null = null  // Node hit during justPressed (for fast-click detection)
  let hoveredPressTarget: TGENode | null = null
  for (const node of bag.rectNodes) {
    const hasInteractiveStyle = node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle
    const isFocusable = node.props.focusable
    const hasOnPress = node.props.onPress
    const hasMouseCb = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut

    // Skip nodes that have no interactive behavior at all
    if (!hasInteractiveStyle && !isFocusable && !hasOnPress && !hasMouseCb) continue

    const l = node.layout

    // Skip nodes that are COMPLETELY outside their scroll container viewport.
    // Without this, off-screen items (clipped by scissor) have layout coords
    // that overlap other screen areas, causing false hover/click detection.
    // Only applies to children of scroll containers, NOT the scroll container itself.
    if (!(node.props.scrollX || node.props.scrollY)) {
      const fullyOutsideViewport = isFullyOutsideScrollViewport(node)
      let scrollParent = node.parent
      while (scrollParent) {
        if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
          if (fullyOutsideViewport) {
            let stateChanged = false
            if (node._hovered) { node._hovered = false; changed = true; stateChanged = true }
            if (node._active) { node._active = false; changed = true; stateChanged = true }
            if (stateChanged) syncNativeInteractiveState(node)
          }
          break
        }
        scrollParent = scrollParent.parent
      }
      // If fully outside, skip hit-testing for this node
      if (scrollParent && fullyOutsideViewport) continue
    }

    // If this node has pointer capture, it's "hovered" regardless of position.
    // Expand hit-area to at least one cell in each dimension — terminal mouse
    // resolution is per-cell, so elements smaller than a cell are hard to click.
    // This is like mobile "minimum touch target" (44px) but for terminal cells.
    const cw = bag.cellWidth
    const ch = bag.cellHeight
    const isCaptured = captureNode === node

    // Hit-test: if the node has a transform (own or inherited from parent),
    // use the ACCUMULATED inverse matrix to map pointer coords into the
    // node's local coordinate space. This handles the full transform hierarchy.
    const hitInverse = node._accTransformInverse ?? node._transformInverse
    let isOver = false
    if (isCaptured) {
      isOver = true
    } else if (hitInverse) {
      // Transform pointer from screen space to node-local space
      const inv = hitInverse
      // Pointer relative to node's layout origin
      const relX = bag.pointerX - l.x
      const relY = bag.pointerY - l.y
      // Apply inverse matrix
      const w = inv[6] * relX + inv[7] * relY + inv[8]
      if (Math.abs(w) > 1e-12) {
        const localX = (inv[0] * relX + inv[1] * relY + inv[2]) / w
        const localY = (inv[3] * relX + inv[4] * relY + inv[5]) / w
        // Hit-test against local bounding box with min cell-size expansion
        const hitW = Math.max(l.width, cw)
        const hitH = Math.max(l.height, ch)
        const hitX = -(hitW - l.width) / 2
        const hitY = -(hitH - l.height) / 2
        isOver = localX >= hitX && localX < hitX + hitW &&
                 localY >= hitY && localY < hitY + hitH
      }
    } else {
      // Standard axis-aligned hit-test (no transform)
      const hitW = Math.max(l.width, cw)
      const hitH = Math.max(l.height, ch)
      const hitX = l.x - (hitW - l.width) / 2
      const hitY = l.y - (hitH - l.height) / 2
      isOver = bag.pointerX >= hitX && bag.pointerX < hitX + hitW &&
               bag.pointerY >= hitY && bag.pointerY < hitY + hitH
    }
    const isDown = isOver && bag.pointerDown
    if (!hoveredPressTarget && isOver && (node.props.onPress || node.props.focusable)) {
      hoveredPressTarget = node
    }

    // Dispatch mouse enter/leave
    if (node._hovered !== isOver) {
      if (isOver && node.props.onMouseOver) node.props.onMouseOver(makeMouseEvent(node))
      if (!isOver && node.props.onMouseOut) node.props.onMouseOut(makeMouseEvent(node))
      node._hovered = isOver
      syncNativeInteractiveState(node)
      changed = true
    }

    // Dispatch mousedown/mouseup on edges
    if (isOver && justPressed) {
      pressedThisFrame = node
      bag.pressOriginSet = true
      if (node.props.onMouseDown) node.props.onMouseDown(makeMouseEvent(node))
    }
    if (isOver && justReleased && node.props.onMouseUp) node.props.onMouseUp(makeMouseEvent(node))

    // Dispatch mousemove while hovered (only if pointer actually moved)
    if (isOver && bag.pointerDirty && node.props.onMouseMove) node.props.onMouseMove(makeMouseEvent(node))

    if (node._active !== isDown) {
      node._active = isDown
      syncNativeInteractiveState(node)
      changed = true
    }
    if (isDown) newActiveNode = node

    // Bridge focus system → node._focused
    if (isFocusable) {
      const nodeFocusId = getNodeFocusId(node)
      const isFocused = nodeFocusId !== undefined && nodeFocusId === currentFocusId
      if (node._focused !== isFocused) {
        node._focused = isFocused
        syncNativeInteractiveState(node)
        changed = true
      }
    }
  }

  // onPress dispatch: detect click.
  // Scenarios:
  //   A) Normal: was active (prevActiveNode._active was true), now released while still hovered
  //   B) Fast click: press+release in same chunk — justPressed AND justReleased both true
  //   C) Node recycled: SolidJS recreated nodes between press/release frames.
  //      The pressed node is gone. Use pressOrigin position to find the currently
  //      hovered node at release time.
  let clickTarget: TGENode | null = null
  if (bag.prevActiveNode && !bag.prevActiveNode._active && bag.prevActiveNode._hovered) {
    clickTarget = bag.prevActiveNode // Scenario A: classic release
  } else if (justPressed && justReleased) {
    clickTarget = pressedThisFrame // Scenario B: fast click
  } else if (justReleased && bag.pressOriginSet) {
    // Scenario C: find hovered node at release position
    const hovered = hoveredPressTarget
    if (hovered) clickTarget = hovered
  }
  if (justReleased) bag.pressOriginSet = false

  if (clickTarget) {
    // Bubbles up the tree like DOM events. Each node with onPress/focusable
    // gets a chance to handle the event. Call event.stopPropagation() in an
    // onPress handler to prevent further bubbling.
    changed = true // Focus/press change — needs repaint
    if (bag.useNativePressDispatch) {
      dispatchNativePressChain(bag.rectNodes, bag.pointerX, bag.pointerY)
    } else {
      const event = createPressEvent()
      let target: TGENode | null = clickTarget

      while (target && !event.propagationStopped) {
        // Focus: first focusable ancestor wins (like browser)
        if (target.props.focusable && !event.propagationStopped) {
          const fid = getNodeFocusId(target)
          if (fid) setFocusedId(fid)
        }
        // Dispatch onPress if present
        if (target.props.onPress) {
          target.props.onPress(event)
        }
        target = target.parent
      }
    }
  }
  // After click dispatch, focus may have changed — update _focused on all
  // focusable nodes so the re-layout in the same frame sees the correct state.
  if (clickTarget) {
    const newFocusId = focusedId()
    if (newFocusId !== currentFocusId) {
      for (const node of bag.rectNodes) {
        if (!node.props.focusable) continue
        const nodeFocusId = getNodeFocusId(node)
        const isFocused = nodeFocusId !== undefined && nodeFocusId === newFocusId
        if (node._focused !== isFocused) {
          node._focused = isFocused
          syncNativeInteractiveState(node)
        }
      }
    }
  }

  bag.prevActiveNode = newActiveNode

  // Auto-release pointer capture on button release
  if (justReleased && bag.capturedNodeId !== 0) {
    bag.capturedNodeId = 0
  }

  bag.pointerDirty = false

  // If any state changed, notify coordinator to mark dirty + trigger repaint
  if (changed) {
    bag.onChanged()
  }
  return !!clickTarget
}
