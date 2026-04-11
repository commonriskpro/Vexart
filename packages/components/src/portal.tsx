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

export type PortalProps = {
  children?: JSX.Element
}

/**
 * Portal component.
 *
 * Wraps children in a full-screen overlay layer.
 * The layer prop ensures it composites independently with high z-index.
 * Width/height "100%" fills the entire terminal viewport.
 */
export function Portal(props: PortalProps) {
  return (
    <box
      layer
      width="100%"
      height="100%"
    >
      {props.children}
    </box>
  )
}
