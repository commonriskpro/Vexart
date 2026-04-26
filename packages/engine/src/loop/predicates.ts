import type { TGEProps } from "../ffi/node"

/** Check if a node has any backdrop filter effect. */
export function hasBackdropEffect(props: TGEProps): boolean {
  return props.backdropBlur !== undefined ||
    props.backdropBrightness !== undefined ||
    props.backdropContrast !== undefined ||
    props.backdropSaturate !== undefined ||
    props.backdropGrayscale !== undefined ||
    props.backdropInvert !== undefined ||
    props.backdropSepia !== undefined ||
    props.backdropHueRotate !== undefined
}

/** Check if a node has interactive behavior (focus, hover, press, mouse). */
export function isInteractiveNode(props: TGEProps): boolean {
  return !!(props.focusable || props.hoverStyle || props.activeStyle ||
    props.focusStyle || props.onPress ||
    props.onMouseDown || props.onMouseUp || props.onMouseMove ||
    props.onMouseOver || props.onMouseOut)
}
