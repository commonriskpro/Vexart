/**
 * VoidDropdownMenu — shadcn DropdownMenu-compatible component for Vexart.
 *
 * Composable parts:
 *   VoidDropdownMenu          — root (controls open state)
 *   VoidDropdownMenu.Trigger  — clickable trigger element
 *   VoidDropdownMenu.Content  — floating panel container
 *   VoidDropdownMenu.Item     — clickable menu item (default | destructive)
 *   VoidDropdownMenu.Separator — visual divider
 *   VoidDropdownMenu.Label    — non-interactive section label
 *   VoidDropdownMenu.Sub      — future: submenu support
 *
 * Usage:
 *   const [open, setOpen] = createSignal(false)
 *
 *   <VoidDropdownMenu open={open()} onOpenChange={setOpen}>
 *     <VoidDropdownMenu.Trigger>
 *       <Button variant="outline">Options</Button>
 *     </VoidDropdownMenu.Trigger>
 *     <VoidDropdownMenu.Content>
 *       <VoidDropdownMenu.Label>My Account</VoidDropdownMenu.Label>
 *       <VoidDropdownMenu.Separator />
 *       <VoidDropdownMenu.Item onSelect={() => openProfile()}>Profile</VoidDropdownMenu.Item>
 *       <VoidDropdownMenu.Item onSelect={() => openSettings()}>Settings</VoidDropdownMenu.Item>
 *       <VoidDropdownMenu.Separator />
 *       <VoidDropdownMenu.Item variant="destructive" onSelect={() => logout()}>Log out</VoidDropdownMenu.Item>
 *     </VoidDropdownMenu.Content>
 *   </VoidDropdownMenu>
 */

import { DropdownMenu } from "@vexart/headless"
import type { JSX } from "solid-js"
import type { SizingUnit } from "@vexart/engine"
import { radius, space, font, shadows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

// ── Root ──

/** @public */
export type VoidDropdownMenuProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: JSX.Element
}

function VoidDropdownMenuRoot(props: VoidDropdownMenuProps) {
  return (
    <DropdownMenu
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={props.onOpenChange}
    >
      {props.children}
    </DropdownMenu>
  )
}

// ── Trigger ──

/** @public */
export type VoidDropdownMenuTriggerProps = {
  children?: JSX.Element
}

/** @public */
export function VoidDropdownMenuTrigger(props: VoidDropdownMenuTriggerProps) {
  return <DropdownMenu.Trigger>{props.children}</DropdownMenu.Trigger>
}

// ── Content ──

/** @public */
export type VoidDropdownMenuContentProps = {
  children?: JSX.Element
  width?: SizingUnit
  minWidth?: number
  maxHeight?: number
  sideOffset?: number
}

/** @public */
export function VoidDropdownMenuContent(props: VoidDropdownMenuContentProps) {
  return (
    <DropdownMenu.Content
      width={props.width}
      minWidth={props.minWidth ?? 128}
      maxHeight={props.maxHeight ?? 320}
      sideOffset={props.sideOffset ?? 4}
      backgroundColor={themeColors.popover}
      cornerRadius={radius.md}
      borderColor={themeColors.border}
      borderWidth={1}
      padding={space[0.5]}
      shadow={shadows.md}
    >
      {props.children}
    </DropdownMenu.Content>
  )
}

// ── Item ──

/** @public */
export type VoidDropdownMenuItemProps = {
  onSelect?: () => void
  variant?: "default" | "destructive"
  disabled?: boolean
  inset?: boolean
  children?: JSX.Element
}

/** @public */
export function VoidDropdownMenuItem(props: VoidDropdownMenuItemProps) {
  const fg = () => props.variant === "destructive"
    ? themeColors.destructive
    : themeColors.foreground

  const hoverBg = () => props.variant === "destructive"
    // TODO: add semantic destructive subtle background token.
    ? "#dc262618"
    : themeColors.accent

  return (
    <DropdownMenu.Item
      onSelect={props.onSelect}
      disabled={props.disabled}
      destructive={props.variant === "destructive"}
      gap={space[2]}
      paddingTop={space[1.5]}
      paddingBottom={space[1.5]}
      paddingLeft={props.inset ? space[8] : space[2]}
      paddingRight={space[2]}
      cornerRadius={radius.sm}
      hoverStyle={{ backgroundColor: hoverBg() }}
      focusStyle={{ backgroundColor: hoverBg() }}
    >
      <text color={fg()} fontSize={font.sm}>
        {props.children}
      </text>
    </DropdownMenu.Item>
  )
}

// ── Separator ──

/** @public */
export function VoidDropdownMenuSeparator() {
  return (
    <DropdownMenu.Separator
      backgroundColor={themeColors.border}
      paddingTop={space[0.5]}
      paddingBottom={space[0.5]}
    />
  )
}

// ── Label ──

/** @public */
export type VoidDropdownMenuLabelProps = {
  children?: JSX.Element
  inset?: boolean
}

/** @public */
export function VoidDropdownMenuLabel(props: VoidDropdownMenuLabelProps) {
  return (
    <DropdownMenu.Label
      paddingTop={space[1.5]}
      paddingBottom={space[1.5]}
      paddingLeft={props.inset ? space[8] : space[2]}
      paddingRight={space[2]}
    >
      <text color={themeColors.mutedForeground} fontSize={font.xs} fontWeight={500}>
        {props.children}
      </text>
    </DropdownMenu.Label>
  )
}

// ── Attach sub-components ──

/** @public */
export const VoidDropdownMenu = Object.assign(VoidDropdownMenuRoot, {
  Trigger: VoidDropdownMenuTrigger,
  Content: VoidDropdownMenuContent,
  Item: VoidDropdownMenuItem,
  Separator: VoidDropdownMenuSeparator,
  Label: VoidDropdownMenuLabel,
})
