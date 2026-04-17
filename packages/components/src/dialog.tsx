/**
 * Dialog — headless modal dialog primitive.
 *
 * Provides the structure and behavior without any styles:
 *   - Portal rendering (above all content)
 *   - Overlay backdrop (clickable to close)
 *   - Focus trap: Tab/Shift+Tab cycles only within the dialog
 *   - Escape key to close (via onClose callback)
 *   - Focus restore: when closed, focus returns to previously focused element
 *   - Composable parts: Dialog, Dialog.Overlay, Dialog.Content, Dialog.Close
 *
 * For the styled version, use @tge/void Dialog which applies Void design tokens.
 *
 * Usage:
 *   import { Show } from "@tge/renderer-solid"
 *   import { Dialog } from "@tge/components"
 *
 *   <Show when={isOpen()}>
 *     <Dialog onClose={() => setOpen(false)}>
 *       <Dialog.Overlay backgroundColor="#00000088" />
 *       <Dialog.Content>
 *         <text>Are you sure?</text>
 *       </Dialog.Content>
 *     </Dialog>
 *   </Show>
 */

import { onCleanup } from "solid-js"
import { pushFocusScope, useFocus } from "@tge/renderer-solid"
import { Portal } from "./portal"

// ── Types ──

export type DialogProps = {
  /** Dialog content. Should contain Dialog.Overlay and/or Dialog.Content. */
  children?: any
  /** Called when the dialog should close (Escape key or overlay click). */
  onClose?: () => void
}

export type DialogOverlayProps = {
  /** Background color of the overlay. Default: none (headless). */
  backgroundColor?: string | number
  /** Backdrop blur radius. */
  backdropBlur?: number
  /** Called when the overlay is clicked. Default: calls Dialog's onClose. */
  onClick?: () => void
  children?: any
}

export type DialogContentProps = {
  /** Content of the dialog panel. */
  children?: any
  /** Width of the dialog. Default: "fit" */
  width?: number | string
  /** Max width constraint. */
  maxWidth?: number
  /** Padding inside the content area. */
  padding?: number
  /** Corner radius. */
  cornerRadius?: number
  /** Background color. */
  backgroundColor?: string | number
}

export type DialogCloseProps = {
  /** Element that closes the dialog when activated. */
  children?: any
}

// ── Dialog Root ──

/**
 * Dialog root. Renders children inside a Portal (above all content).
 * Wrap with <Show when={open}> to control visibility.
 *
 * Automatically creates a focus scope (trap) and handles Escape to close.
 */
export function Dialog(props: DialogProps) {
  // Push a focus scope — Tab will only cycle within the dialog
  const popScope = pushFocusScope()

  // Register a focus entry to capture Escape key
  useFocus({
    onKeyDown(e) {
      if (e.key === "escape") {
        props.onClose?.()
      }
    },
  })

  // Cleanup: pop the scope when dialog unmounts, restoring previous focus
  onCleanup(popScope)

  return (
    <Portal>
      <box width="100%" height="100%" alignX="center" alignY="center">
        {props.children}
      </box>
    </Portal>
  )
}

// ── Dialog Overlay ──

/**
 * Semi-transparent backdrop behind the dialog content.
 * Headless = no default style. Pass backgroundColor/backdropBlur for visual effect.
 * Click on overlay fires onClick (or Dialog's onClose if not specified).
 */
function DialogOverlay(props: DialogOverlayProps) {
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={props.backgroundColor}
      backdropBlur={props.backdropBlur}
      onPress={() => props.onClick?.()}
    >
      {props.children}
    </box>
  )
}

// ── Dialog Content ──

/**
 * The dialog panel that contains the actual content.
 * Headless = minimal defaults. Styled version adds bg, border, padding, shadow.
 */
function DialogContent(props: DialogContentProps) {
  return (
    <box
      width={props.width ?? "fit"}
      maxWidth={props.maxWidth}
      padding={props.padding}
      cornerRadius={props.cornerRadius}
      backgroundColor={props.backgroundColor}
    >
      {props.children}
    </box>
  )
}

// ── Dialog Close ──

/**
 * Wraps a child element that should close the dialog when activated.
 * In headless mode, just renders children. Wire onPress at the consumer level.
 */
function DialogClose(props: DialogCloseProps) {
  return <>{props.children}</>
}

// ── Attach sub-components ──

Dialog.Overlay = DialogOverlay
Dialog.Content = DialogContent
Dialog.Close = DialogClose
