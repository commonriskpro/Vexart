/**
 * layout-writeback.ts — Phase 2 native path
 *
 * Parses the Taffy PositionedCommand flat buffer produced by vexart_layout_compute.
 * Per design §10 (Translation 2), §11.
 *
 * Output buffer format from native/libvexart/src/layout/writeback.rs::write_layout():
 *   GraphHeader (16 bytes: magic + version + cmd_count + payload_bytes)
 *   Per-node record (40 bytes each):
 *     u64 node_id       (8 bytes, little-endian)
 *     f32 x             (4 bytes)
 *     f32 y             (4 bytes)
 *     f32 width         (4 bytes)
 *     f32 height        (4 bytes)
 *     f32 content_x     (4 bytes)
 *     f32 content_y     (4 bytes)
 *     f32 content_w     (4 bytes)
 *     f32 content_h     (4 bytes)
 *                       = 40 bytes total
 *
 * Legacy Clay functions (writeLayoutFromElementIds, writeSequentialCommandLayout)
 * are kept for backward compat — they are no-ops in Phase 2 and will be deleted
 * in Slice 11 along with clay.ts.
 */

import type { TGENode } from "./node"
import { GRAPH_MAGIC, GRAPH_VERSION } from "./vexart-buffer"

/** Computed layout for one node from vexart_layout_compute output. */
export type PositionedCommand = {
  nodeId: bigint
  x: number
  y: number
  width: number
  height: number
  contentX: number
  contentY: number
  contentW: number
  contentH: number
}

/** Size in bytes of one PositionedCommand record in the vexart output buffer. */
export const POSITIONED_CMD_STRIDE = 40

/**
 * Parse the PositionedCommand flat buffer written by vexart_layout_compute.
 * Returns a Map indexed by node_id (bigint) for O(1) lookup.
 *
 * @param outBuf  ArrayBuffer filled by vexart_layout_compute (includes §8 header)
 * @param usedBytes  Number of bytes written (from out_used pointer)
 */
export function parseLayoutOutput(
  outBuf: ArrayBuffer,
  usedBytes: number,
): Map<bigint, PositionedCommand> {
  const result = new Map<bigint, PositionedCommand>()
  if (usedBytes < 16) return result

  const view = new DataView(outBuf, 0, usedBytes)
  const magic = view.getUint32(0, true)
  const version = view.getUint32(4, true)
  if (magic !== GRAPH_MAGIC || version !== GRAPH_VERSION) return result

  const cmdCount = view.getUint32(8, true)
  let offset = 16
  for (let i = 0; i < cmdCount && offset + POSITIONED_CMD_STRIDE <= usedBytes; i++) {
    const nodeId = view.getBigUint64(offset, true)
    const x = view.getFloat32(offset + 8, true)
    const y = view.getFloat32(offset + 12, true)
    const width = view.getFloat32(offset + 16, true)
    const height = view.getFloat32(offset + 20, true)
    const contentX = view.getFloat32(offset + 24, true)
    const contentY = view.getFloat32(offset + 28, true)
    const contentW = view.getFloat32(offset + 32, true)
    const contentH = view.getFloat32(offset + 36, true)
    result.set(nodeId, { nodeId, x, y, width, height, contentX, contentY, contentW, contentH })
    offset += POSITIONED_CMD_STRIDE
  }
  return result
}

/**
 * Write layout from a PositionedCommand map to TGENode trees.
 * Maps node.id (number) to bigint key for the layout map.
 *
 * @param nodes   TGENode array to update layout on
 * @param layoutMap  Output from parseLayoutOutput
 */
export function writeLayoutFromPositionedCommands(
  nodes: TGENode[],
  layoutMap: Map<bigint, PositionedCommand>,
): void {
  for (const node of nodes) {
    const cmd = layoutMap.get(BigInt(node.id))
    if (!cmd) continue
    node.layout.x = cmd.x
    node.layout.y = cmd.y
    node.layout.width = cmd.width
    node.layout.height = cmd.height
  }
}

// ── Legacy Clay compatibility shims ─────────────────────────────────────────
// The following functions existed in the Clay layout path. They are kept as
// no-ops so that callers in loop.ts compile without modification until
// Slice 11 deletes the Clay path entirely.

/** @deprecated Phase 2 no-op — use writeLayoutFromPositionedCommands instead. */
export function applyCommandLayout(node: TGENode, cmd: { x: number; y: number; width: number; height: number }) {
  node.layout.x = cmd.x
  node.layout.y = cmd.y
  node.layout.width = cmd.width
  node.layout.height = cmd.height
}

/** @deprecated Phase 2 no-op — Clay element ID lookup removed. */
export function writeLayoutFromElementIds(_boxNodes: TGENode[]): void {
  // No-op: Clay getElementData() is gone. Layout is written via
  // writeLayoutFromPositionedCommands after vexart_layout_compute.
}

/** @deprecated Phase 2 no-op — CMD.RECTANGLE/CMD.TEXT patterns removed. */
export function writeSequentialCommandLayout(
  _commands: unknown[],
  _rectNodes: TGENode[],
  _textNodes: TGENode[],
): void {
  // No-op: Clay render commands are gone. Layout is written via
  // writeLayoutFromPositionedCommands after vexart_layout_compute.
}
