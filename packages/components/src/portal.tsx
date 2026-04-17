/**
 * Portal — render children outside the normal component tree.
 *
 * Portals mount their children directly under the TGE root node
 * in a separate compositing layer. This makes them render on top
 * of everything else, useful for:
 *   - Modal dialogs
 *   - Permission prompts
 *   - Tooltips
 *   - Context menus
 *
 * NOTE: SolidJS universal renderer does NOT include Portal.
 * This is a TGE-specific implementation using the node tree directly.
 *
 * Usage:
 *   <Portal>
 *     <Box backgroundColor="#000000cc" width="100%" height="100%">
 *       <Box backgroundColor="#1a1a2e" cornerRadius={12} padding={20}>
 *         <Text color="#ffffff">Are you sure?</Text>
 *       </Box>
 *     </Box>
 *   </Portal>
 *
 * The Portal contents will render above all other layers.
 */

import type { JSX } from "solid-js"
import { OverlayRoot } from "./overlay-root"

export type PortalProps = {
  children?: JSX.Element
}

/**
 * Portal component.
 *
 * Wraps children in a root-attached overlay plane.
 * This keeps the logical parent in the component tree while the visual parent
 * is the renderer root — the transitional primitive required by the refactor.
 */
export function Portal(props: PortalProps) {
  return (
    <OverlayRoot>
      {props.children}
    </OverlayRoot>
  )
}
