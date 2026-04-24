/**
 * layout-writeback.ts — Taffy layout output parsing.
 *
 * Parses the PositionedCommand flat buffer produced by vexart_layout_compute.
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
 */

import type { TGENode } from "./node"
import { GRAPH_MAGIC, GRAPH_VERSION } from "./vexart-buffer"

/** @public Computed layout for one node from vexart layout output. */
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

/** @public Size in bytes of one positioned-command record in the layout output buffer. */
export const POSITIONED_CMD_STRIDE = 40

/**
 * Parse the PositionedCommand flat buffer written by vexart_layout_compute.
 * Returns a Map indexed by node_id (bigint) for O(1) lookup.
 *
 * @param outBuf - ArrayBuffer filled by vexart_layout_compute.
 * @param usedBytes - Number of bytes written into the buffer.
 */
/** @public */
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
 * @param nodes - TGENode array to update.
 * @param layoutMap - Output from parseLayoutOutput.
 */
/** @public */
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

/** @public @deprecated Use writeLayoutFromPositionedCommands or the layout map directly. */
export function applyCommandLayout(node: TGENode, cmd: { x: number; y: number; width: number; height: number }) {
  node.layout.x = cmd.x
  node.layout.y = cmd.y
  node.layout.width = cmd.width
  node.layout.height = cmd.height
}
