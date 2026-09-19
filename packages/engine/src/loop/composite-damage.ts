/**
 * composite-damage.ts — Layer dirty tracking, damage propagation, and interactive damage dispatch.
 *
 * Extracted from composite.ts as part of loop decomposition.
 * Handles:
 *   - Scoped layer dirty store (bind/unbind/mark)
 *   - Damage rect accumulation for layers
 *   - Interactive state damage queueing and layer dirty marking
 */

import { unionRect, type DamageRect } from "../ffi/damage"
import type { Layer } from "../ffi/layers"
import { resolveProps, type TGENode } from "../ffi/node"
import { isLayoutProp } from "../ffi/flex-sync"
import { DIRTY_KIND, markLayoutDirty } from "../reconciler/dirty"
import { setActiveScrollOffsets } from "../reconciler/hit-test"
import {
  updateInteractiveStates as _updateInteractiveStates,
  type InteractiveStatesBag,
} from "./layout"
import type { CompositeFrameState } from "./composite"

let layerDirtyStore: Map<string, Layer> | null = null

export function bindLayerDirtyStore(store: Map<string, Layer> | null): void {
  layerDirtyStore = store
}

export function unbindLayerDirtyStore(store?: Map<string, Layer> | null): void {
  if (!store || layerDirtyStore === store) {
    layerDirtyStore = null
  }
}

export function markLayerDirtyByKey(key: string): void {
  const layer = layerDirtyStore?.get(key)
  if (!layer) return
  layer.dirty = true
  if (layer.width > 0 && layer.height > 0) {
    layer.damageRect = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
  }
}

export function markLayerDamageByKey(key: string, rect: DamageRect): void {
  const layer = layerDirtyStore?.get(key)
  if (!layer) return
  layer.dirty = true
  layer.damageRect = layer.damageRect ? unionRect(layer.damageRect, rect) : rect
}

export const isReservedBorderProp = (k: string) =>
  k === "borderWidth" || k === "borderLeft" || k === "borderRight" || k === "borderTop" || k === "borderBottom"

export function updateInteractiveStates(s: CompositeFrameState): { hadClick: boolean; changed: boolean; layoutChanged: boolean } {
  let changed = false
  let layoutChanged = false
  const visualNodeIds = new Set<number>()
  const queueNodeVisualDamage = (node: TGENode) => {
    visualNodeIds.add(node.id)
    if (node.props.hoverStyle && Object.keys(node.props.hoverStyle).some((k) => isLayoutProp(k) && k !== "hoverStyle" && !isReservedBorderProp(k))) {
      layoutChanged = true
    }
    if (node.props.activeStyle && Object.keys(node.props.activeStyle).some((k) => isLayoutProp(k) && k !== "activeStyle" && !isReservedBorderProp(k))) {
      layoutChanged = true
    }
    if (node.props.focusStyle && Object.keys(node.props.focusStyle).some((k) => isLayoutProp(k) && k !== "focusStyle" && !isReservedBorderProp(k))) {
      layoutChanged = true
    }
    if (node.layout.width <= 0 || node.layout.height <= 0) return
    const padding = 32
    s.pendingNodeDamageRects.push({
      nodeId: node.id,
      rect: {
        x: node.layout.x - padding,
        y: node.layout.y - padding,
        width: node.layout.width + padding * 2,
        height: node.layout.height + padding * 2,
      },
    })
  }
  // HP-6: Set active scroll offsets for hit-testing helpers (buildNodeMouseEvent, isFullyOutsideScrollViewport)
  setActiveScrollOffsets(s.scrollOffsets)
  const bag: InteractiveStatesBag = {
    rectNodes: s.rectNodes,
    rectNodeById: s.rectNodeById,
    pointerX: s.pointer.x,
    pointerY: s.pointer.y,
    pointerDown: s.pointer.down,
    pointerDirty: s.pointer.dirty,
    pendingPress: s.pointer.pendingPress,
    pendingRelease: s.pointer.pendingRelease,
    capturedNodeId: s.pointer.capturedNodeId,
    pressOriginSet: s.pointer.pressOriginSet,
    prevActiveNode: s.pointer.prevActiveNode,
    scrollOffsets: s.scrollOffsets,
    onChanged: () => {
      if (visualNodeIds.size === 0) {
        return
      }
      changed = true
      // Mark only the layers that CONTAIN the changed nodes dirty (with
      // full-bounds damage to avoid the "disappearing siblings" bug within
      // each layer). Layers without changed nodes stay clean and are reused.
      const markedKeys = new Set<string>()
      for (const nodeId of visualNodeIds) {
        const node = s.nodeRefById.get(nodeId)
        const key = node?._layerKey ?? "bg"
        if (!markedKeys.has(key)) {
          markedKeys.add(key)
          markLayerDirtyByKey(key)
        }
        s.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId })
      }
    },
    onNodeVisualChanged: queueNodeVisualDamage,
  }
  const captureBefore = s.pointer.capturedNodeId
  const hadClick = _updateInteractiveStates(bag)
  if (layoutChanged) {
    if (typeof (s.dirty as any).markLayoutDirty === "function") {
      (s.dirty as any).markLayoutDirty()
    }
    markLayoutDirty()
  }
  // Write back mutable fields
  s.pointer.pendingPress = bag.pendingPress
  s.pointer.pendingRelease = bag.pendingRelease
  s.pointer.pressOriginSet = bag.pressOriginSet
  s.pointer.prevActiveNode = bag.prevActiveNode
  // Pointer callbacks may call setPointerCapture()/releasePointerCapture(),
  // which mutate s.pointer directly through the active loop boundary. Do not
  // overwrite that external mutation with the stale bag value captured before
  // callbacks ran.
  if (s.pointer.capturedNodeId === captureBefore) s.pointer.capturedNodeId = bag.capturedNodeId
  s.pointer.dirty = bag.pointerDirty
  return { hadClick, changed, layoutChanged }
}
