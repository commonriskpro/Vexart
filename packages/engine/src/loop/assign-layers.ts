/**
 * assign-layers.ts — Layer boundary discovery + spatial command assignment.
 *
 * Extracted from loop.ts as part of Phase 3 Slice 2.1.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §assign-layers
 *
 * Exports:
 *   - findLayerBoundaries() — recursively discovers layer nodes in the tree
 *   - assignLayersSpatial() — assigns commands to layer slots by spatial overlap
 */

import { CMD } from "../ffi/render-graph"
import type { RenderCommand } from "../ffi/render-graph"
import type { TGENode } from "../ffi/node"
import { shouldPromoteInteractionLayer } from "../reconciler/interaction"
import type { LayerBoundary, LayerSlot, LayerPlan } from "./types"

const VALID_WILL_CHANGE_VALUES = new Set(["transform", "opacity", "filter", "scroll"])
const AUTO_LAYER_BUDGET = 8
const AUTO_LAYER_MIN_AREA = 64 * 64

let autoLayerCount = 0

export function hasBackdropEffect(node: TGENode) {
  return !!(
    node.props.backdropBlur ||
    node.props.backdropBrightness !== undefined ||
    node.props.backdropContrast !== undefined ||
    node.props.backdropSaturate !== undefined ||
    node.props.backdropGrayscale !== undefined ||
    node.props.backdropInvert !== undefined ||
    node.props.backdropSepia !== undefined ||
    node.props.backdropHueRotate !== undefined
  )
}

function hasPromotableArea(node: TGENode) {
  return node.layout.width * node.layout.height >= AUTO_LAYER_MIN_AREA
}

function pushBoundary(
  node: TGENode,
  path: string,
  result: LayerBoundary[],
  nextZ: { value: number },
  isScroll: boolean,
  insideScroll: boolean,
  hasSubtreeTransform: boolean,
) {
  result.push({
    path,
    nodeId: node.id,
    z: nextZ.value++,
    isScroll,
    hasBg: node.props.backgroundColor !== undefined,
    insideScroll,
    hasSubtreeTransform,
  })
}

// ── Layer boundary discovery ──────────────────────────────────────────────

/**
 * Find layer boundaries in the TGENode tree and record their paths.
 * Also tracks whether each boundary is a scroll container, which is
 * critical for correct layer→command assignment when layers and scroll
 * containers interact.
 *
 * @param node        - Current TGENode to visit
 * @param path        - Dot-separated path string (e.g. "r.0.1")
 * @param result      - Accumulator for discovered boundaries
 * @param nextZ       - Mutable counter for z-order assignment
 * @param insideScroll - Whether an ancestor is a scroll container
 */
export function findLayerBoundaries(
  node: TGENode,
  path: string,
  result: LayerBoundary[],
  nextZ: { value: number },
  insideScroll = false,
) {
  if (path === "r") autoLayerCount = 0
  if (node.kind === "text") return
  const isScroll = !!(node.props.scrollX || node.props.scrollY)
  const isInteractionLayer = shouldPromoteInteractionLayer(node)
  const hasSubtreeTransform = !!(node.props.transform && node.children.length > 0)
  const hasBackdrop = hasBackdropEffect(node)
  // willChange pre-promotes the node to its own layer (REQ-2B-501).
  const willChange = node.props.willChange
  const willChangeValues = willChange ? (Array.isArray(willChange) ? willChange : [willChange]) : []
  const hasValidWillChange = willChangeValues.some(v => VALID_WILL_CHANGE_VALUES.has(v))
  if (hasValidWillChange && !willChangeValues.every(v => VALID_WILL_CHANGE_VALUES.has(v))) {
    if (process.env.TGE_DEBUG) {
      console.warn(`[vexart] willChange contains unrecognized value(s): ${willChangeValues.filter(v => !VALID_WILL_CHANGE_VALUES.has(v)).join(", ")}`)
    }
  }
  if (node.props.layer === true) {
    node._autoLayer = false
    pushBoundary(node, path, result, nextZ, isScroll, insideScroll, hasSubtreeTransform)
  } else if (isInteractionLayer || hasSubtreeTransform || hasValidWillChange) {
    node._autoLayer = false
    pushBoundary(node, path, result, nextZ, isScroll, insideScroll, hasSubtreeTransform)
  } else if (hasBackdrop && autoLayerCount < AUTO_LAYER_BUDGET) {
    node._autoLayer = true
    autoLayerCount++
    pushBoundary(node, path, result, nextZ, isScroll, insideScroll, hasSubtreeTransform)
  } else if (node._autoLayer === true && node._unstableFrameCount >= 3) {
    node._autoLayer = false
    node._stableFrameCount = 0
    node._unstableFrameCount = 0
  } else if (node._stableFrameCount >= 3 && hasPromotableArea(node) && autoLayerCount < AUTO_LAYER_BUDGET) {
    node._autoLayer = true
    autoLayerCount++
    pushBoundary(node, path, result, nextZ, isScroll, insideScroll, hasSubtreeTransform)
  }
  const childInsideScroll = insideScroll || isScroll
  for (let i = 0; i < node.children.length; i++) {
    findLayerBoundaries(node.children[i], `${path}.${i}`, result, nextZ, childInsideScroll)
  }
}

// ── Layer spatial assignment ──────────────────────────────────────────────

/** Resolve a TGENode by its tree path (e.g. "r.0.1.2"). */
export function resolveNodeByPath(fromRoot: TGENode, path: string): TGENode | null {
  const parts = path.split(".")
  let node = fromRoot
  for (let i = 1; i < parts.length; i++) {
    const idx = parseInt(parts[i])
    if (isNaN(idx) || idx >= node.children.length) return null
    node = node.children[idx]
  }
  return node
}

/** Collect all text strings from a node's subtree. */
function collectAllTexts(node: TGENode, collectText: (n: TGENode) => string): string[] {
  const result: string[] = []
  const walk = (current: TGENode) => {
    if (current.kind === "text") {
      const text = current.text || collectText(current)
      if (text) result.push(text)
      return
    }
    for (const child of current.children) walk(child)
  }
  walk(node)
  return result
}

type ScissorPair = {
  startIdx: number
  endIdx: number
  x: number
  y: number
  w: number
  h: number
}

type LayerBounds = {
  slot: LayerSlot
  x: number
  y: number
  right: number
  bottom: number
  scissor: ScissorPair | null
  boundary: LayerBoundary
}

type ColorCommand = { index: number; cmd: RenderCommand }

function packedColor(cmd: RenderCommand) {
  return (((cmd.color[0] & 0xff) << 24) | ((cmd.color[1] & 0xff) << 16) | ((cmd.color[2] & 0xff) << 8) | (cmd.color[3] & 0xff)) >>> 0
}

function boundsKey(cmd: RenderCommand) {
  return `${Math.round(cmd.x)}:${Math.round(cmd.y)}:${Math.round(cmd.x + cmd.width)}:${Math.round(cmd.y + cmd.height)}`
}


/**
 * State bag for assignLayersSpatial.
 * Provides external references the function cannot own directly.
 */
export type AssignLayersState = {
  /** The root TGENode — used to resolve paths and find scroll nodes. */
  root: TGENode
  /** Text collector — resolves text content from a node (mirrors collectText in walkTree). */
  collectText: (node: TGENode) => string
  /** O(1) node lookup populated during walkTree. */
  nodeRefById?: Map<number, TGENode>
  /** Scroll containers collected in walkTree order. */
  scrollContainers?: TGENode[]
}

let nodeIdToLayerIdx = new Int32Array(8192)

function ensureLayerMapSize(maxNodeId: number) {
  if (maxNodeId < nodeIdToLayerIdx.length) return
  let size = nodeIdToLayerIdx.length
  while (size <= maxNodeId) size *= 2
  nodeIdToLayerIdx = new Int32Array(size)
}

function nodeForBoundary(state: AssignLayersState, boundary: LayerBoundary) {
  return state.nodeRefById?.get(boundary.nodeId) ?? (boundary.path ? resolveNodeByPath(state.root, boundary.path) : null)
}

function setSubtreeLayerKey(node: TGENode, key: string) {
  node._layerKey = key
  for (const child of node.children) setSubtreeLayerKey(child, key)
}

function assignNodeLayerKeys(root: TGENode, bounds: LayerBounds[], state: AssignLayersState) {
  setSubtreeLayerKey(root, "bg")
  const ordered = [...bounds].sort((a, b) => a.slot.z - b.slot.z)
  for (const lb of ordered) {
    const node = nodeForBoundary(state, lb.boundary)
    if (node) setSubtreeLayerKey(node, lb.slot.key)
  }
}

/**
 * Assign commands to layers.
 *
 * Uses a HYBRID strategy:
 *   1. Scroll-container layers → matched by SCISSOR commands (order-based)
 *   2. Static layers with bg → matched by RECT color (existing approach)
 *   3. Static layers without bg → matched by child TEXT content
 *
 * @returns LayerPlan with bgSlot, contentSlots, slotBoundaryByKey, and boundaries.
 */
export function assignLayersSpatial(
  commands: RenderCommand[],
  boundaries: LayerBoundary[],
  state: AssignLayersState,
): LayerPlan {
  const { root } = state
  const bgSlot: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }

  if (boundaries.length === 0) {
    setSubtreeLayerKey(root, "bg")
    for (let i = 0; i < commands.length; i++) {
      bgSlot.cmdIndices.push(i)
    }
    return { bgSlot, contentSlots: [], slotBoundaryByKey: new Map(), boundaries }
  }

  // ── Phase 1: Collect SCISSOR commands ──
  const scissorStarts: number[] = []
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type === CMD.SCISSOR_START) {
      scissorStarts.push(i)
    }
  }

  const scissorPairs: ScissorPair[] = []
  for (const startIdx of scissorStarts) {
    let depth = 0
    let endIdx = -1
    for (let i = startIdx; i < commands.length; i++) {
      if (commands[i].type === CMD.SCISSOR_START) depth++
      else if (commands[i].type === CMD.SCISSOR_END) {
        depth--
        if (depth === 0) { endIdx = i; break }
      }
    }
    if (endIdx >= 0) {
      const startCmd = commands[startIdx]
      scissorPairs.push({
        startIdx,
        endIdx,
        x: Math.round(startCmd.x),
        y: Math.round(startCmd.y),
        w: Math.round(startCmd.width),
        h: Math.round(startCmd.height),
      })
    }
  }

  // ── Build layer slots with bounds ──
  const layerBounds: LayerBounds[] = []
  const rectCommandsByColor = new Map<number, ColorCommand[]>()
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (cmd.type !== CMD.RECTANGLE) continue
    const color = packedColor(cmd)
    let entries = rectCommandsByColor.get(color)
    if (!entries) {
      entries = []
      rectCommandsByColor.set(color, entries)
    }
    entries.push({ index: i, cmd })
  }
  const claimedBounds = new Set<string>()

  // Collect ALL scroll container nodes in walkTree order (to map scissors to layers)
  const scrollNodes = state.scrollContainers ?? []

  // Map: scroll node id → scissor pair index
  const scrollNodeToScissor = new Map<number, number>()
  for (let si = 0; si < scrollNodes.length && si < scissorPairs.length; si++) {
    scrollNodeToScissor.set(scrollNodes[si].id, si)
  }

  for (const b of boundaries) {
    const node = nodeForBoundary(state, b)
    if (!node) continue

    const slot: LayerSlot = { key: `layer:${b.nodeId}`, z: b.z, cmdIndices: [] }
    let scissor: ScissorPair | null = null

    if (b.isScroll) {
      const si = scrollNodeToScissor.get(b.nodeId)
      if (si !== undefined && si < scissorPairs.length) {
        scissor = scissorPairs[si]
      }
    }

    const layoutX = Math.round(node.layout.x)
    const layoutY = Math.round(node.layout.y)
    const layoutW = Math.round(node.layout.width)
    const layoutH = Math.round(node.layout.height)
    const hasUsableLayout = layoutW > 0 && layoutH > 0
    const shouldPreferLayoutBounds = !scissor && hasUsableLayout && (node.props.floating || node.props.layer === true || node.props.interactionMode === "drag" || b.hasSubtreeTransform)

    if (scissor) {
      layerBounds.push({
        slot,
        x: scissor.x,
        y: scissor.y,
        right: scissor.x + scissor.w,
        bottom: scissor.y + scissor.h,
        scissor,
        boundary: b,
      })
    } else if (shouldPreferLayoutBounds) {
      layerBounds.push({
        slot,
        x: layoutX,
        y: layoutY,
        right: layoutX + layoutW,
        bottom: layoutY + layoutH,
        scissor: null,
        boundary: b,
      })
    } else if (b.hasBg) {
      const targetColor = (node.props.backgroundColor as number) || 0

      let found = false
      const candidates = rectCommandsByColor.get(targetColor >>> 0) ?? []
      for (const candidate of candidates) {
        const cmd = candidate.cmd
        const key = boundsKey(cmd)
        if (!claimedBounds.has(key)) {
            claimedBounds.add(key)
            layerBounds.push({
              slot,
              x: Math.round(cmd.x),
              y: Math.round(cmd.y),
              right: Math.round(cmd.x + cmd.width),
              bottom: Math.round(cmd.y + cmd.height),
              scissor: null,
              boundary: b,
            })
            found = true
            break
        }
      }
      if (!found) {
        layerBounds.push({ slot, x: 0, y: 0, right: 0, bottom: 0, scissor: null, boundary: b })
      }
    } else {
      const lx = Math.round(node.layout.x)
      const ly = Math.round(node.layout.y)
      const lw = Math.round(node.layout.width)
      const lh = Math.round(node.layout.height)
      if (lw > 0 && lh > 0) {
        layerBounds.push({ slot, x: lx, y: ly, right: lx + lw, bottom: ly + lh, scissor: null, boundary: b })
      } else {
        layerBounds.push({ slot, x: 0, y: 0, right: 0, bottom: 0, scissor: null, boundary: b })
      }
    }
  }

  // ── Phase 3: Assign commands to layers ──
  const contentSlots: LayerSlot[] = layerBounds.map(lb => lb.slot)
  const slotBoundaryByKey = new Map(layerBounds.map((lb) => [lb.slot.key, lb.boundary]))
  assignNodeLayerKeys(root, layerBounds, state)

  const claimedByScissor = new Set<number>()
  const scissorLayers = layerBounds.filter(lb => lb.scissor).sort((a, b) => b.slot.z - a.slot.z)
  for (const lb of scissorLayers) {
    if (!lb.scissor) continue
    for (let i = lb.scissor.startIdx; i <= lb.scissor.endIdx; i++) {
      if (claimedByScissor.has(i)) continue
      claimedByScissor.add(i)
      lb.slot.cmdIndices.push(i)
    }
    if (lb.boundary.hasBg) {
      const node = nodeForBoundary(state, lb.boundary)
      if (node) {
        const targetColor = (node.props.backgroundColor as number) || 0
        const [tr, tg, tb, ta] = [(targetColor >>> 24) & 0xff, (targetColor >>> 16) & 0xff, (targetColor >>> 8) & 0xff, targetColor & 0xff]
        for (let i = lb.scissor.startIdx - 1; i >= 0; i--) {
          const cmd = commands[i]
          if (cmd.type === CMD.RECTANGLE &&
              cmd.color[0] === tr && cmd.color[1] === tg && cmd.color[2] === tb && cmd.color[3] === ta) {
            if (!claimedByScissor.has(i)) {
              claimedByScissor.add(i)
              lb.slot.cmdIndices.push(i)
            }
            break
          }
          if (cmd.type === CMD.SCISSOR_END) break
        }
        for (let i = lb.scissor.endIdx + 1; i < commands.length; i++) {
          const cmd = commands[i]
          if (cmd.type === CMD.BORDER) {
            const bx = Math.round(cmd.x)
            const by = Math.round(cmd.y)
            if (bx >= lb.x && by >= lb.y && bx + Math.round(cmd.width) <= lb.right + 1 && by + Math.round(cmd.height) <= lb.bottom + 1) {
              if (!claimedByScissor.has(i)) {
                claimedByScissor.add(i)
                lb.slot.cmdIndices.push(i)
              }
            }
            break
          }
          if (cmd.type === CMD.RECTANGLE || cmd.type === CMD.SCISSOR_START) break
        }
      }
    }
  }

  // ── Phase 3: Assign commands to layers using nodeId ancestry ──
  //
  // Each command has cmd.nodeId (set by endLayout). Each layer boundary has
  // boundary.nodeId. A command belongs to a layer if its nodeId IS the layer
  // node or is a DESCENDANT of the layer node in the TGENode tree.
  //
  // This replaces the old spatial-overlap approach which was fragile — a
  // focused element with larger border could produce commands that spatially
  // overlapped other layers, stealing their commands.

  // Sort layers by z descending so inner layers claim commands first
  const sortedBounds = [...layerBounds]
    .filter(lb => !lb.scissor)
    .sort((a, b) => b.slot.z - a.slot.z)

  let maxNodeId = root.id
  for (const cmd of commands) {
    if (cmd.nodeId !== undefined && cmd.nodeId > maxNodeId) maxNodeId = cmd.nodeId
  }
  for (const lb of sortedBounds) {
    if (lb.boundary.nodeId > maxNodeId) maxNodeId = lb.boundary.nodeId
  }
  ensureLayerMapSize(maxNodeId)
  nodeIdToLayerIdx.fill(-1, 0, maxNodeId + 1)

  for (let layerIdx = 0; layerIdx < sortedBounds.length; layerIdx++) {
    const node = nodeForBoundary(state, sortedBounds[layerIdx].boundary)
    if (!node) continue
    const mark = (current: TGENode) => {
      if (current.id >= nodeIdToLayerIdx.length) ensureLayerMapSize(current.id)
      if (nodeIdToLayerIdx[current.id] === -1) nodeIdToLayerIdx[current.id] = layerIdx
      for (const child of current.children) mark(child)
    }
    mark(node)
  }

  for (let i = 0; i < commands.length; i++) {
    if (claimedByScissor.has(i)) continue

    const cmd = commands[i]

    if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) {
      bgSlot.cmdIndices.push(i)
      continue
    }

    let assigned = false
    if (cmd.nodeId !== undefined) {
      const layerIdx = cmd.nodeId < nodeIdToLayerIdx.length ? nodeIdToLayerIdx[cmd.nodeId] : -1
      if (layerIdx >= 0) {
        sortedBounds[layerIdx].slot.cmdIndices.push(i)
        assigned = true
      }
    }

    if (!assigned) {
      bgSlot.cmdIndices.push(i)
    }
  }

  return { bgSlot, contentSlots, slotBoundaryByKey, boundaries }
}
