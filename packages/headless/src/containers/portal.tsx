/**
 * Portal — render children outside the normal component tree.
 *
 * Renders children in a root-attached overlay plane.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { OverlayRoot } from "./overlay-root"

/** @public */
export type PortalProps = {
  children?: JSX.Element
}

/** @public */
export function Portal(props: PortalProps) {
  return (
    <OverlayRoot>
      {props.children}
    </OverlayRoot>
  )
}
