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
  if (node.kind === "text") return
  const isScroll = !!(node.props.scrollX || node.props.scrollY)
  const isInteractionLayer = shouldPromoteInteractionLayer(node)
  const hasSubtreeTransform = !!(node.props.transform && node.children.length > 0)
  // willChange pre-promotes the node to its own layer (REQ-2B-501).
  const willChange = node.props.willChange
  const validWillChangeValues = new Set(["transform", "opacity", "filter", "scroll"])
  const willChangeValues = willChange ? (Array.isArray(willChange) ? willChange : [willChange]) : []
  const hasValidWillChange = willChangeValues.some(v => validWillChangeValues.has(v))
  if (hasValidWillChange && !willChangeValues.every(v => validWillChangeValues.has(v))) {
    if (process.env.TGE_DEBUG) {
      console.warn(`[TGE] willChange contains unrecognized value(s): ${willChangeValues.filter(v => !validWillChangeValues.has(v)).join(", ")}`)
    }
  }
  if (node.props.layer === true || isInteractionLayer || hasSubtreeTransform || hasValidWillChange) {
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


/**
 * State bag for assignLayersSpatial.
 * Provides external references the function cannot own directly.
 */
export type AssignLayersState = {
  /** The root TGENode — used to resolve paths and find scroll nodes. */
  root: TGENode
  /** Text collector — resolves text content from a node (mirrors collectText in walkTree). */
  collectText: (node: TGENode) => string
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
  const { root, collectText } = state
  const bgSlot: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }

  if (boundaries.length === 0) {
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

  // Collect ALL scroll container nodes in walkTree order (to map scissors to layers)
  const scrollNodes: { path: string; isLayer: boolean }[] = []
  function findScrollNodes(node: TGENode, path: string) {
    if (node.kind === "text") return
    if (node.props.scrollX || node.props.scrollY) {
      scrollNodes.push({ path, isLayer: node.props.layer === true })
    }
    for (let i = 0; i < node.children.length; i++) {
      findScrollNodes(node.children[i], `${path}.${i}`)
    }
  }
  findScrollNodes(root, "r")

  // Map: scroll node path → scissor pair index
  const scrollPathToScissor = new Map<string, number>()
  for (let si = 0; si < scrollNodes.length && si < scissorPairs.length; si++) {
    scrollPathToScissor.set(scrollNodes[si].path, si)
  }

  for (const b of boundaries) {
    const node = resolveNodeByPath(root, b.path)
    if (!node) continue

    const slot: LayerSlot = { key: `layer:${b.nodeId}`, z: b.z, cmdIndices: [] }
    let scissor: ScissorPair | null = null

    if (b.isScroll) {
      const si = scrollPathToScissor.get(b.path)
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
      const [tr, tg, tb, ta] = [(targetColor >>> 24) & 0xff, (targetColor >>> 16) & 0xff, (targetColor >>> 8) & 0xff, targetColor & 0xff]

      let found = false
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i]
        if (cmd.type !== CMD.RECTANGLE) continue
        if (cmd.color[0] === tr && cmd.color[1] === tg && cmd.color[2] === tb && cmd.color[3] === ta) {
          const alreadyClaimed = layerBounds.some(lb =>
            lb.x === Math.round(cmd.x) && lb.y === Math.round(cmd.y) &&
            lb.right === Math.round(cmd.x + cmd.width) && lb.bottom === Math.round(cmd.y + cmd.height)
          )
          if (!alreadyClaimed) {
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
      const node = resolveNodeByPath(root, lb.boundary.path)
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

  // Build nodeId → layer mapping. Inner layers (higher z) take priority.
  // Pre-collect descendant sets for each layer boundary node.
  const layerDescendants = new Map<number, Set<number>>()
  for (const lb of layerBounds) {
    if (lb.scissor) continue // scissor layers handled above
    const node = resolveNodeByPath(root, lb.boundary.path)
    if (!node) continue
    const ids = new Set<number>()
    ids.add(node.id)
    function collectIds(n: TGENode) {
      for (const child of n.children) {
        ids.add(child.id)
        collectIds(child)
      }
    }
    collectIds(node)
    layerDescendants.set(lb.boundary.nodeId, ids)
  }

  // Sort layers by z descending so inner layers claim commands first
  const sortedBounds = [...layerBounds]
    .filter(lb => !lb.scissor)
    .sort((a, b) => b.slot.z - a.slot.z)

  for (let i = 0; i < commands.length; i++) {
    if (claimedByScissor.has(i)) continue

    const cmd = commands[i]

    if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) {
      bgSlot.cmdIndices.push(i)
      continue
    }

    let assigned = false
    if (cmd.nodeId !== undefined) {
      // Match by nodeId ancestry — find the innermost layer that contains this node.
      // ALL commands now carry nodeId (set by layout-adapter.endLayout()).
      // Commands that don't match any layer fall through to bgSlot.
      for (const lb of sortedBounds) {
        const descendants = layerDescendants.get(lb.boundary.nodeId)
        if (descendants && descendants.has(cmd.nodeId)) {
          lb.slot.cmdIndices.push(i)
          assigned = true
          break
        }
      }
    }

    if (!assigned) {
      bgSlot.cmdIndices.push(i)
    }
  }

  return { bgSlot, contentSlots, slotBoundaryByKey, boundaries }
}
