import {
  createWindowResizeHandleLayouts,
  type WindowResizeEdge,
  type WindowResizeHandleProps,
} from "./use-window-resize"
import type { WindowBounds } from "./types"

export interface WindowResizeHandlesProps {
  bounds: WindowBounds
  thickness?: number
  cornerSize?: number
  color?: string | number
  getHandleProps: (edge: WindowResizeEdge) => WindowResizeHandleProps
}

export function WindowResizeHandles(props: WindowResizeHandlesProps) {
  const layouts = createWindowResizeHandleLayouts(
    props.bounds,
    props.thickness ?? 6,
    props.cornerSize ?? 12,
  )

  return layouts.map((layout) => (
    <box
      {...props.getHandleProps(layout.edge)}
      floating="parent"
      floatOffset={{ x: layout.x, y: layout.y }}
      width={layout.width}
      height={layout.height}
      zIndex={5}
      backgroundColor={props.color ?? 0x00000001}
    />
  ))
}
