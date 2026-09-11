import type { TGEProps } from "../ffi/node"

/**
 * Canonical list of backdrop filter field names.
 * Single source of truth — used by predicates, walk-tree, and render-graph
 * to avoid manually enumerating these 8 fields in 4+ locations.
 */
export const BACKDROP_FIELDS = [
  "backdropBlur", "backdropBrightness", "backdropContrast", "backdropSaturate",
  "backdropGrayscale", "backdropInvert", "backdropSepia", "backdropHueRotate",
] as const

/** @public */
export type BackdropFieldName = (typeof BACKDROP_FIELDS)[number]

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
    props.focusStyle || props.onPress || props.onClick ||
    props.onMouseDown || props.onMouseUp || props.onMouseMove ||
    props.onMouseOver || props.onMouseOut)
}
