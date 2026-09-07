/**
 * Dialog — headless modal dialog primitive.
 *
 * Provides focus scoping, overlay/content composition, and close behavior.
 *
 * @public
 */

import { createContext, onCleanup, useContext, type JSX } from "solid-js"
import { focusedId, onInput, pushFocusScope, setFocusedId } from "@vexart/engine"
import { Portal } from "../containers/portal"

// ── Types ──

/** @public */
export type DialogProps = {
  /** Dialog content. Should contain Dialog.Overlay and/or Dialog.Content. */
  children?: JSX.Element
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
  children?: JSX.Element
}

/** @public */
export type DialogContentProps = {
  /** Content of the dialog panel. */
  children?: JSX.Element
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
  children?: JSX.Element
}

// ── Dialog Root ──

const DialogCloseContext = createContext<(() => void) | undefined>()
const openDialogs: Array<() => void> = []

function DialogRoot(props: DialogProps) {
  const savedFocusId = focusedId()
  // Push a focus scope — Tab will only cycle within the dialog
  const popScope = pushFocusScope()

  // Escape is a scope-level action. A focused child owns the active focus
  // entry, so registering it on one hidden entry would miss Escape after Tab.
  const close = () => props.onClose?.()
  openDialogs.push(close)
  const unsubscribe = onInput((event) => {
    if (event.type === "key" && event.key === "escape" && openDialogs[openDialogs.length - 1] === close) {
      close()
    }
  })

  // Cleanup: pop the scope when dialog unmounts, restoring previous focus
  onCleanup(() => {
    unsubscribe()
    const index = openDialogs.indexOf(close)
    if (index >= 0) openDialogs.splice(index, 1)
    popScope()
    if (savedFocusId) setFocusedId(savedFocusId)
  })

  return (
    <DialogCloseContext.Provider value={props.onClose}>
      <Portal>
        <box width="100%" height="100%" alignX="center" alignY="center">
          {props.children}
        </box>
      </Portal>
    </DialogCloseContext.Provider>
  )
}

// ── Dialog Overlay ──

/** @public */
export function DialogOverlay(props: DialogOverlayProps) {
  const onClose = useContext(DialogCloseContext)
  return (
    <box
      // Keep the backdrop out of the dialog's flex flow.  It still covers
      // the portal plane, but must not push Content below the viewport.
      floating="parent"
      width="100%"
      height="100%"
      backgroundColor={props.backgroundColor}
      backdropBlur={props.backdropBlur}
      onPress={() => props.onClick ? props.onClick() : onClose?.()}
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
      onPress={(e) => e?.stopPropagation()}
    >
      {props.children}
    </box>
  )
}

// ── Dialog Close ──

/** @public Wrapper for a child element that closes the dialog when activated. */
export function DialogClose(props: DialogCloseProps) {
  const onClose = useContext(DialogCloseContext)
  return (
    <box onPress={() => onClose?.()}>
      {props.children}
    </box>
  )
}

// ── Attach sub-components ──

/** @public */
export const Dialog = Object.assign(DialogRoot, {
  Overlay: DialogOverlay,
  Content: DialogContent,
  Close: DialogClose,
})
