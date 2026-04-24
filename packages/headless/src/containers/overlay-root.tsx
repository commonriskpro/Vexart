import type { JSX } from "solid-js"

/** @public */
export type OverlayRootProps = {
  children?: JSX.Element
  zIndex?: number
}

/**
 * OverlayRoot — attach visual content to the root overlay plane.
 *
 * @public
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
