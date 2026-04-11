/**
 * Button — interactive push button for TGE.
 *
 * Focus-aware component with Enter/Space activation.
 * Supports three variants: solid, outline, ghost.
 *
 * Uses useFocus() for Tab navigation and keyboard handling.
 * Visual feedback via reactive focus/pressed state.
 *
 * Usage:
 *   <Button onPress={() => console.log("clicked!")}>Save</Button>
 *   <Button variant="outline" color={accent.signal}>Cancel</Button>
 *   <Button disabled>Locked</Button>
 */

import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
  alpha,
} from "@tge/tokens"

export type ButtonVariant = "solid" | "outline" | "ghost"

export type ButtonProps = {
  /** Press handler — fires on Enter or Space when focused. */
  onPress?: () => void

  /** Visual variant. Default: "solid". */
  variant?: ButtonVariant

  /** Accent color (u32 RGBA). Default: accent.thread. */
  color?: number

  /** Disabled state — not focusable, dimmed visual. */
  disabled?: boolean

  /** Focus ID — override auto-generated focus ID. */
  focusId?: string

  /** Content — typically text label. */
  children?: JSX.Element
}

export function Button(props: ButtonProps) {
  const [pressed, setPressed] = createSignal(false)
  const variant = () => props.variant ?? "solid"
  const color = () => props.color ?? accent.thread
  const disabled = () => props.disabled ?? false

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === "enter" || e.key === " ") {
        setPressed(true)
        props.onPress?.()
        // Visual feedback — release after a short delay
        setTimeout(() => setPressed(false), 100)
      }
    },
  })

  // ── Style resolution based on variant + state ──

  const backgroundColor = () => {
    if (disabled()) return surface.context
    if (variant() === "solid") {
      return pressed() ? alpha(color(), 0xcc) : color()
    }
    if (variant() === "outline") {
      return pressed() ? alpha(color(), 0x33) : surface.card
    }
    // ghost
    return pressed() ? alpha(color(), 0x22) : 0x00000000
  }

  const borderColor = () => {
    if (disabled()) return border.subtle
    if (focused()) return color()
    if (variant() === "outline") return alpha(color(), 0x88)
    if (variant() === "solid") return focused() ? color() : border.subtle
    // ghost — no border unless focused
    return 0x00000000
  }

  const borderWidth = () => {
    if (variant() === "ghost" && !focused()) return 0
    return focused() ? 2 : 1
  }

  const textColor = () => {
    if (disabled()) return textTokens.muted
    if (variant() === "solid") return textTokens.primary
    return color()
  }

  return (
    <box
      backgroundColor={backgroundColor()}
      cornerRadius={radius.lg}
      borderColor={borderColor()}
      borderWidth={borderWidth()}
      padding={spacing.md}
      paddingX={spacing.lg}
      alignX="center"
      alignY="center"
    >
      <text color={textColor()} fontSize={14}>
        {props.children}
      </text>
    </box>
  )
}
