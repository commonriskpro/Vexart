/**
 * Dialog — styled modal dialog using Void design tokens.
 *
 * Built on top of the headless @tge/components Dialog primitive.
 * Adds Void styling: dark card background, rounded corners, shadows,
 * backdrop overlay with blur, and proper spacing.
 *
 * Usage:
 *   import { Show } from "@tge/renderer"
 *   import { VoidDialog } from "tge/void"
 *
 *   <Show when={isOpen()}>
 *     <VoidDialog onClose={() => setOpen(false)}>
 *       <VoidDialog.Title>Confirm</VoidDialog.Title>
 *       <VoidDialog.Description>Are you sure?</VoidDialog.Description>
 *       <VoidDialog.Footer>
 *         <Button variant="ghost" onPress={() => setOpen(false)}>Cancel</Button>
 *         <Button onPress={() => { confirm(); setOpen(false) }}>OK</Button>
 *       </VoidDialog.Footer>
 *     </VoidDialog>
 *   </Show>
 */

import { Dialog } from "@tge/components"
import { radius, space, font, weight, shadows } from "./tokens"
import { themeColors } from "./theme"

// ── Types ──

export type VoidDialogProps = {
  /** Called when the dialog should close (Escape, overlay click). */
  onClose?: () => void
  /** Width of the dialog panel. Default: 320. */
  width?: number
  /** Max width constraint. Default: 480. */
  maxWidth?: number
  children?: any
}

export type VoidDialogTitleProps = {
  children?: any
}

export type VoidDialogDescriptionProps = {
  children?: any
}

export type VoidDialogFooterProps = {
  children?: any
}

// ── Styled Dialog ──

export function VoidDialog(props: VoidDialogProps) {
  return (
    <Dialog>
      <Dialog.Overlay
        backgroundColor="#000000aa"
        backdropBlur={8}
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

function VoidDialogTitle(props: VoidDialogTitleProps) {
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

function VoidDialogDescription(props: VoidDialogDescriptionProps) {
  return (
    <text
      color={themeColors.mutedForeground}
      fontSize={font.sm}
    >
      {props.children}
    </text>
  )
}

function VoidDialogFooter(props: VoidDialogFooterProps) {
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

VoidDialog.Title = VoidDialogTitle
VoidDialog.Description = VoidDialogDescription
VoidDialog.Footer = VoidDialogFooter
