/**
 * Dialog — styled modal dialog using Void design tokens.
 *
 * Built on top of the headless dialog primitive.
 *
 * @public
 */

import { Dialog } from "@vexart/headless"
import { radius, space, font, weight } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

// ── Types ──

/** @public */
export type VoidDialogProps = {
  /** Called when the dialog should close (Escape, overlay click). */
  onClose?: () => void
  /** Width of the dialog panel. Default: 320. */
  width?: number
  /** Max width constraint. Default: 480. */
  maxWidth?: number
  children?: any
}

/** @public */
export type VoidDialogTitleProps = {
  children?: any
}

/** @public */
export type VoidDialogDescriptionProps = {
  children?: any
}

/** @public */
export type VoidDialogFooterProps = {
  children?: any
}

// ── Styled Dialog ──

function VoidDialogRoot(props: VoidDialogProps) {
  return (
    <Dialog onClose={props.onClose}>
      <Dialog.Overlay
        backgroundColor="#000000aa"
        backdropBlur={8}
        onClick={props.onClose}
      />
      <Dialog.Content
        width={props.width ?? 320}
        maxWidth={props.maxWidth ?? 480}
        padding={space[6]}
        cornerRadius={radius.lg}
        backgroundColor={themeColors.card}
      >
        <box direction="column" gap={space[4]}>
          {props.children}
        </box>
      </Dialog.Content>
    </Dialog>
  )
}

// ── Sub-components ──

/** @public */
export function VoidDialogTitle(props: VoidDialogTitleProps) {
  return (
    <text
      color={themeColors.cardForeground}
      fontSize={font.lg}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function VoidDialogDescription(props: VoidDialogDescriptionProps) {
  return (
    <text
      color={themeColors.mutedForeground}
      fontSize={font.sm}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function VoidDialogFooter(props: VoidDialogFooterProps) {
  return (
    <box
      direction="row"
      alignX="right"
      gap={space[2]}
      paddingTop={space[2]}
    >
      {props.children}
    </box>
  )
}

// ── Attach sub-components ──

/** @public */
export const VoidDialog = Object.assign(VoidDialogRoot, {
  Title: VoidDialogTitle,
  Description: VoidDialogDescription,
  Footer: VoidDialogFooter,
})
