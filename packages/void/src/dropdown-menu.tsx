/**
 * VoidDropdownMenu — shadcn DropdownMenu-compatible component for TGE.
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

import { createContext, useContext } from "solid-js"
import type { JSX } from "solid-js"
import { Show } from "@tge/renderer"
import { Popover } from "@tge/components"
import { radius, space, font, shadows } from "./tokens"
import { themeColors } from "./theme"

// ── Context ──

type DropdownCtx = {
  open: () => boolean
  close: () => void
}

const DropdownContext = createContext<DropdownCtx>({
  open: () => false,
  close: () => {},
})

// ── Root ──

export type VoidDropdownMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children?: any
}

export function VoidDropdownMenu(props: VoidDropdownMenuProps) {
  const ctx: DropdownCtx = {
    open: () => props.open,
    close: () => props.onOpenChange(false),
  }

  return (
    <DropdownContext.Provider value={ctx}>
      <box direction="column">
        {props.children}
      </box>
    </DropdownContext.Provider>
  )
}

// ── Trigger ──

export type VoidDropdownMenuTriggerProps = {
  children?: JSX.Element
}

function VoidDropdownMenuTrigger(props: VoidDropdownMenuTriggerProps) {
  // Trigger is just a passthrough — the consumer wraps it in <box onPress> or similar
  return <>{props.children}</>
}

// ── Content ──

export type VoidDropdownMenuContentProps = {
  children?: any
  width?: number | string
  minWidth?: number
  maxHeight?: number
  sideOffset?: number
}

function VoidDropdownMenuContent(props: VoidDropdownMenuContentProps) {
  const ctx = useContext(DropdownContext)

  return (
    <Show when={ctx.open()}>
      <box
        floating="parent"
        zIndex={9999}
        floatOffset={{ x: 0, y: props.sideOffset ?? 4 }}
        direction="column"
        width={props.width}
        minWidth={props.minWidth ?? 128}
        maxHeight={props.maxHeight ?? 320}
        backgroundColor={themeColors.popover}
        cornerRadius={radius.md}
        borderColor={themeColors.border}
        borderWidth={1}
        padding={space[0.5]}
        shadow={shadows.md}
        scrollY={!!props.maxHeight}
      >
        {props.children}
      </box>
    </Show>
  )
}

// ── Item ──

export type VoidDropdownMenuItemProps = {
  onSelect?: () => void
  variant?: "default" | "destructive"
  disabled?: boolean
  inset?: boolean
  children?: any
}

function VoidDropdownMenuItem(props: VoidDropdownMenuItemProps) {
  const ctx = useContext(DropdownContext)

  const fg = () => props.variant === "destructive"
    ? themeColors.destructive
    : themeColors.foreground

  const hoverBg = () => props.variant === "destructive"
    ? "#dc262618"
    : themeColors.accent

  return (
    <box
      focusable
      direction="row"
      alignY="center"
      gap={space[2]}
      paddingTop={space[1.5]}
      paddingBottom={space[1.5]}
      paddingLeft={props.inset ? space[8] : space[2]}
      paddingRight={space[2]}
      cornerRadius={radius.sm}
      opacity={props.disabled ? 0.5 : 1}
      hoverStyle={{ backgroundColor: hoverBg() }}
      focusStyle={{ backgroundColor: hoverBg() }}
      onPress={() => {
        if (props.disabled) return
        props.onSelect?.()
        ctx.close()
      }}
    >
      <text color={fg()} fontSize={font.sm}>
        {props.children}
      </text>
    </box>
  )
}

// ── Separator ──

function VoidDropdownMenuSeparator() {
  return (
    <box
      width="grow"
      height={1}
      backgroundColor={themeColors.border}
      paddingTop={space[0.5]}
      paddingBottom={space[0.5]}
    />
  )
}

// ── Label ──

export type VoidDropdownMenuLabelProps = {
  children?: any
  inset?: boolean
}

function VoidDropdownMenuLabel(props: VoidDropdownMenuLabelProps) {
  return (
    <box
      paddingTop={space[1.5]}
      paddingBottom={space[1.5]}
      paddingLeft={props.inset ? space[8] : space[2]}
      paddingRight={space[2]}
    >
      <text color={themeColors.mutedForeground} fontSize={font.xs} fontWeight={500}>
        {props.children}
      </text>
    </box>
  )
}

// ── Attach sub-components ──

VoidDropdownMenu.Trigger = VoidDropdownMenuTrigger
VoidDropdownMenu.Content = VoidDropdownMenuContent
VoidDropdownMenu.Item = VoidDropdownMenuItem
VoidDropdownMenu.Separator = VoidDropdownMenuSeparator
VoidDropdownMenu.Label = VoidDropdownMenuLabel
