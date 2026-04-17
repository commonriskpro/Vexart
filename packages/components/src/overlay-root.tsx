import type { JSX } from "solid-js"

export type OverlayRootProps = {
  children?: JSX.Element
  zIndex?: number
}

/**
 * OverlayRoot — attach visual content to the root overlay plane.
 *
 * This is a transitional primitive that separates the logical parent
 * from the visual parent by anchoring overlays to the renderer root.
 */
export function OverlayRoot(props: OverlayRootProps) {
  return (
    <box
      layer
      floating="root"
      width="100%"
      height="100%"
      zIndex={props.zIndex ?? 1000}
    >
      {props.children}
    </box>
  )
}
