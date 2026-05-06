/**
 * VoidScrollView — styled scroll container using Void design tokens.
 *
 * Wraps the headless ScrollView with Void theme colors for background,
 * border, and corner radius.
 *
 * @public
 */

import { ScrollView } from "@vexart/headless"
import type { ScrollHandle } from "@vexart/headless"
import type { JSX } from "solid-js"
import { radius } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidScrollViewProps = {
  ref?: (handle: ScrollHandle) => void
  width?: number | string
  height?: number | string
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  showScrollbar?: boolean
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"
  children?: JSX.Element
}

/** @public */
export function VoidScrollView(props: VoidScrollViewProps) {
  return (
    <ScrollView
      ref={props.ref}
      width={props.width}
      height={props.height}
      scrollX={props.scrollX}
      scrollY={props.scrollY ?? true}
      scrollSpeed={props.scrollSpeed}
      showScrollbar={props.showScrollbar}
      backgroundColor={themeColors.secondary}
      cornerRadius={radius.md}
      borderColor={themeColors.input}
      borderWidth={1}
      direction={props.direction}
      padding={props.padding}
      paddingX={props.paddingX}
      paddingY={props.paddingY}
      gap={props.gap}
      alignX={props.alignX}
      alignY={props.alignY}
    >
      {props.children}
    </ScrollView>
  )
}
