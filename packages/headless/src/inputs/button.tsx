/**
 * Button — truly headless interactive button.
 *
 * Handles focus plus keyboard/mouse activation while leaving visuals to `renderButton`.
 *
 * @public
 */

import { createSignal, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

// ── Types ──

/** @public */
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

/** @public */
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

/** @public */
export function Button(props: ButtonProps) {
  const [pressed, setPressed] = createSignal(false)
  const disabled = () => props.disabled ?? false
  let pressTimer: ReturnType<typeof setTimeout> | null = null

  function clearPressTimer() {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = null
  }

  function schedulePressReset() {
    clearPressTimer()
    pressTimer = setTimeout(() => {
      setPressed(false)
      pressTimer = null
    }, 100)
  }

  onCleanup(() => clearPressTimer())

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === "enter" || e.key === " ") {
        setPressed(true)
        props.onPress?.()
        schedulePressReset()
      }
    },
  })

  function handlePress() {
    if (disabled()) return
    setPressed(true)
    props.onPress?.()
    schedulePressReset()
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
