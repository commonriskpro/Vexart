/**
 * ScrollView — scrollable container for TGE.
 *
 * Wraps content in a fixed-size box with scroll clipping.
 * Content that overflows the container is clipped and can
 * be scrolled via mouse wheel or programmatically via ScrollHandle.
 *
 * Features:
 *   - Visual scrollbar track + thumb (auto-hides when content fits)
 *   - Compositing layer for efficient repainting
 *   - Clay-based scroll tracking + pixel-level clipping
 *   - Programmatic scrollTo/scrollBy/scrollIntoView
 *
 * Usage:
 *   import { ScrollHandle } from "@vexart/engine"
 *
 *   let scrollRef: ScrollHandle
 *
 *   <ScrollView ref={(h) => scrollRef = h} width={300} height={200} scrollY>
 *     {longContent}
 *   </ScrollView>
 *
 *   scrollRef.scrollTo(0)
 *   scrollRef.scrollBy(-100)
 *   scrollRef.scrollY
 *   scrollRef.contentHeight
 *   scrollRef.viewportHeight
 */

import type { JSX } from "solid-js"
import { createScrollHandle, type ScrollHandle } from "@vexart/engine"

let scrollViewCounter = 0

// ── Scrollbar styling ──

const SCROLLBAR = {
  width: 6,
  minThumbHeight: 16,
  trackColor: 0x1a1a2eff,
  thumbColor: 0x555577cc,
  thumbRadius: 3,
  padding: 2,
} as const

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

  // Scrollbar
  /** Show scrollbar. Default: true (auto-hides when content fits). */
  showScrollbar?: boolean

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

/**
 * Scrollbar — renders a vertical scrollbar track + thumb.
 * Reads scroll state from the ScrollHandle every frame.
 */
function Scrollbar(props: { handle: ScrollHandle; height: number | string }) {
  // Read scroll state (reactive — reads Clay data each access)
  const ratio = () => {
    const ch = props.handle.contentHeight
    const vh = props.handle.viewportHeight
    if (ch <= vh || ch === 0) return 1
    return vh / ch
  }

  const thumbHeight = () =>
    Math.max(SCROLLBAR.minThumbHeight, Math.floor(ratio() * (typeof props.height === "number" ? props.height : 200)))

  const thumbOffset = () => {
    const ch = props.handle.contentHeight
    const vh = props.handle.viewportHeight
    if (ch <= vh) return 0
    const scrollable = ch - vh
    const scrollPos = -props.handle.scrollY // scrollY is negative
    const trackHeight = (typeof props.height === "number" ? props.height : 200) - thumbHeight()
    return Math.floor((scrollPos / scrollable) * trackHeight)
  }

  const shouldShow = () => ratio() < 1

  if (!shouldShow()) return null

  return (
    <box
      width={SCROLLBAR.width + SCROLLBAR.padding * 2}
      height={props.height}
      direction="column"
      paddingX={SCROLLBAR.padding}
    >
      {/* Track */}
      <box width={SCROLLBAR.width} height="100%" backgroundColor={SCROLLBAR.trackColor} cornerRadius={SCROLLBAR.thumbRadius}>
        {/* Spacer above thumb */}
        <box height={thumbOffset()} width={SCROLLBAR.width} />
        {/* Thumb */}
        <box
          width={SCROLLBAR.width}
          height={thumbHeight()}
          backgroundColor={SCROLLBAR.thumbColor}
          cornerRadius={SCROLLBAR.thumbRadius}
        />
      </box>
    </box>
  )
}

export function ScrollView(props: ScrollViewProps) {
  const clayId = `tge-scrollview-${scrollViewCounter++}`
  const showScrollbar = props.showScrollbar ?? true

  // Create scroll handle
  const handle = createScrollHandle(clayId)

  // If ref callback provided, pass the ScrollHandle
  if (props.ref) {
    props.ref(handle)
  }

  return (
    <box width={props.width} height={props.height} direction="row">
      {/* Scrollable content area */}
      <box
        layer
        width="grow"
        height="100%"
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

      {/* Vertical scrollbar */}
      {showScrollbar && props.scrollY ? (
        <Scrollbar handle={handle} height={props.height ?? 200} />
      ) : null}
    </box>
  )
}
