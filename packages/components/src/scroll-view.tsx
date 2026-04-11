/**
 * ScrollView — scrollable container for TGE.
 *
 * Wraps content in a fixed-size box with scroll clipping.
 * Content that overflows the container is clipped and can
 * be scrolled via mouse wheel.
 *
 * Uses Clay's built-in scroll tracking + TGE's layer system:
 *   - The ScrollView is its own compositing layer (`layer` prop)
 *   - Clay handles scroll offset tracking internally
 *   - SCISSOR_START/END commands clip the paint
 *   - Zig bounds-checking clips pixels outside the buffer
 *
 * Usage:
 *   <ScrollView width={300} height={200} scrollY>
 *     {longContent}
 *   </ScrollView>
 */

import type { JSX } from "solid-js"

export type ScrollViewProps = {
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
