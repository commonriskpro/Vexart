/**
 * Dialog — headless modal dialog primitive.
 *
 * Provides focus scoping, overlay/content composition, and close behavior.
 *
 * @public
 */

import { onCleanup } from "solid-js"
import { pushFocusScope, useFocus } from "@vexart/engine"
import { Portal } from "../containers/portal"

// ── Types ──

/** @public */
export type DialogProps = {
  /** Dialog content. Should contain Dialog.Overlay and/or Dialog.Content. */
  children?: any
  /** Called when the dialog should close (Escape key or overlay click). */
  onClose?: () => void
}

/** @public */
export type DialogOverlayProps = {
  /** Background color of the overlay. Default: none (headless). */
  backgroundColor?: string | number
  /** Backdrop blur radius. */
  backdropBlur?: number
  /** Called when the overlay is clicked. Default: calls Dialog's onClose. */
  onClick?: () => void
  children?: any
}

/** @public */
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

/** @public */
export type DialogCloseProps = {
  /** Element that closes the dialog when activated. */
  children?: any
}

// ── Dialog Root ──

function DialogRoot(props: DialogProps) {
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

/** @public */
export function DialogOverlay(props: DialogOverlayProps) {
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

/** @public The dialog panel that contains the content. */
export function DialogContent(props: DialogContentProps) {
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

/** @public Wrapper for a child element that closes the dialog when activated. */
export function DialogClose(props: DialogCloseProps) {
  return <>{props.children}</>
}

// ── Attach sub-components ──

/** @public */
export const Dialog = Object.assign(DialogRoot, {
  Overlay: DialogOverlay,
  Content: DialogContent,
  Close: DialogClose,
})
