/**
 * Button — truly headless interactive button.
 *
 * Focus-aware component with Enter/Space and mouse click activation.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard activation (Enter/Space)
 *   - Mouse click activation (via buttonProps spread)
 *   - Pressed state tracking (100ms visual feedback)
 *
 * ALL visual styling is the consumer's responsibility via renderButton.
 * Use @tge/void Button for a styled version.
 *
 * Usage:
 *   <Button
 *     onPress={() => save()}
 *     renderButton={(ctx) => (
 *       <box {...ctx.buttonProps} backgroundColor={ctx.pressed ? "#333" : "#222"} padding={8} cornerRadius={6}>
 *         <text color="#fff">Save</text>
 *       </box>
 *     )}
 *   />
 */

import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"

// ── Types ──

export type ButtonRenderContext = {
  focused: boolean
  pressed: boolean
  disabled: boolean
  /** Spread on the root element for click + keyboard + focus handling. */
  buttonProps: {
    focusable: true
    onPress: () => void
  }
}

export type ButtonProps = {
  /** Press handler — fires on Enter or Space when focused. */
  onPress?: () => void
  /** Disabled state — not focusable, dimmed visual. */
  disabled?: boolean
  /** Focus ID — override auto-generated focus ID. */
  focusId?: string
  /** Render function — receives state, returns visual. */
  renderButton: (ctx: ButtonRenderContext) => JSX.Element
}

export function Button(props: ButtonProps) {
  const [pressed, setPressed] = createSignal(false)
  const disabled = () => props.disabled ?? false

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === "enter" || e.key === " ") {
        setPressed(true)
        props.onPress?.()
        setTimeout(() => setPressed(false), 100)
      }
    },
  })

  function handlePress() {
    if (disabled()) return
    setPressed(true)
    props.onPress?.()
    setTimeout(() => setPressed(false), 100)
  }

  return (
    <>
      {() => props.renderButton({
        focused: focused(),
        pressed: pressed(),
        disabled: disabled(),
        buttonProps: {
          focusable: true,
          onPress: handlePress,
        },
      })}
    </>
  )
}
