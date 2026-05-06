import type { TGEProps } from "../ffi/node"
import { BACKDROP_FIELDS, type BackdropFieldName } from "../ffi/render-graph"

type BackdropEffectProps = Pick<TGEProps, BackdropFieldName>

/** Check if a node has any backdrop filter effect. */
export function hasBackdropEffect(props: BackdropEffectProps): boolean {
  for (const field of BACKDROP_FIELDS) {
    if (props[field] !== undefined) return true
  }
  return false
}

/** Check if a node has interactive behavior (focus, hover, press, mouse). */
export function isInteractiveNode(props: TGEProps): boolean {
  return !!(props.focusable || props.hoverStyle || props.activeStyle ||
    props.focusStyle || props.onPress ||
    props.onMouseDown || props.onMouseUp || props.onMouseMove ||
    props.onMouseOver || props.onMouseOut)
}
