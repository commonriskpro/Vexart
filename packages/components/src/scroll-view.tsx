/**
 * ScrollView — scrollable container for TGE.
 *
 * Wraps content in a fixed-size box with scroll clipping.
 * Content that overflows the container is clipped and can
 * be scrolled via mouse wheel or programmatically via ScrollHandle.
 *
 * Uses Clay's built-in scroll tracking + TGE's layer system:
 *   - The ScrollView is its own compositing layer (`layer` prop)
 *   - Clay handles scroll offset tracking internally
 *   - SCISSOR_START/END commands clip the paint
 *   - Zig bounds-checking clips pixels outside the buffer
 *
 * Usage:
 *   import { ScrollHandle } from "@tge/renderer"
 *
 *   let scrollRef: ScrollHandle
 *
 *   <ScrollView ref={(h) => scrollRef = h} width={300} height={200} scrollY>
 *     {longContent}
 *   </ScrollView>
 *
 *   // Programmatic scroll:
 *   scrollRef.scrollTo(0)             // scroll to top
 *   scrollRef.scrollBy(-100)          // scroll up 100px
 *   scrollRef.scrollY                 // current scroll offset
 *   scrollRef.scrollHeight            // total content height (alias for contentHeight)
 *   scrollRef.viewportHeight          // visible viewport height
 */

import type { JSX } from "solid-js"
import { createScrollHandle, type ScrollHandle } from "@tge/renderer/scroll"

let scrollViewCounter = 0

export type ScrollViewProps = {
  /** Ref callback — receives a ScrollHandle for programmatic control. */
  ref?: (handle: ScrollHandle) => void

  // Sizing — at least one dimension should be fixed for scroll to work
  width?: number | string
  height?: number | string

  // Scroll axes
  scrollX?: boolean
  scrollY?: boolean

  // Lines per scroll tick. Omit for natural (momentum) scrolling.
  // Set to 1 for precise 1-line-per-tick scrolling.
  scrollSpeed?: number

  // Visual
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number

  // Layout of children inside the scroll container
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"

  // Children
  children?: JSX.Element
}

export function ScrollView(props: ScrollViewProps) {
  // Each ScrollView instance gets a stable Clay ID.
  // This ID is used by the render loop's walkTree to register with Clay,
  // and by ScrollHandle to read/write scroll state.
  const clayId = `tge-scrollview-${scrollViewCounter++}`

  // If ref callback provided, create and pass a ScrollHandle
  if (props.ref) {
    props.ref(createScrollHandle(clayId))
  }

  return (
    <box
      layer
      width={props.width}
      height={props.height}
      backgroundColor={props.backgroundColor}
      cornerRadius={props.cornerRadius}
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      scrollX={props.scrollX}
      scrollY={props.scrollY}
      scrollSpeed={props.scrollSpeed}
      scrollId={clayId}
      direction={props.direction ?? "column"}
      padding={props.padding}
      paddingX={props.paddingX}
      paddingY={props.paddingY}
      gap={props.gap}
      alignX={props.alignX}
      alignY={props.alignY}
    >
      {props.children}
    </box>
  )
}
