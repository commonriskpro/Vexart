/**
 * Temporary bridge package for scene primitives.
 */

export {
  createNode,
  createTextNode,
  insertChild,
  removeChild,
  createPressEvent,
  resolveProps,
  parseColor,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
} from "../../renderer/src/node"

export type {
  InteractionMode,
  InteractiveStyleProps,
  LayoutRect,
  NodeMouseEvent,
  PressEvent,
  SizingInfo,
  TGENode,
  TGENodeKind,
  TGEProps,
} from "../../renderer/src/node"

export type RenderObjectId = number

export function toRenderObjectId(value: number): RenderObjectId {
  return value
}
