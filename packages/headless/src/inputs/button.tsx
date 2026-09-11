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
    focusable?: boolean
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

  const { focused, focus } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === "enter" || e.key === " ") {
        activate()
      }
    },
  })

  function activate() {
    if (disabled()) return
    focus()
    setPressed(true)
    props.onPress?.()
    schedulePressReset()
  }

  const context: ButtonRenderContext = {
    get focused() { return focused() },
    get pressed() { return pressed() },
    get disabled() { return disabled() },
    buttonProps: {
      onPress: activate,
    },
  }
  // Invoke the render prop once. Its JSX property expressions track the
  // context getters and update the existing visual tree in place; rebuilding
  // this subtree on focus/pressed changes can recursively remount focusable
  // children while focus dispatch is still in progress.
  return <box width="fit" height="fit">{props.renderButton(context)}</box>
}
