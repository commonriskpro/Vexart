/**
 * DropdownMenu — truly headless compound dropdown menu primitive.
 *
 * Handles open/close state (controlled and uncontrolled), outside clicks,
 * Escape key dismissing, and item selection while visuals are provided by consumers.
 *
 * @public
 */

import { createContext, createSignal, onCleanup, useContext, Show } from "solid-js"
import type { JSX } from "solid-js"
import { onInput, type SizingUnit, type TGEProps } from "@vexart/engine"

// Floating attach points use the engine's stable 3x3 grid (left/top = 0,
// left/bottom = 2). Keep the content's top-left attached to the trigger's
// bottom-left so sideOffset is measured from the trigger edge.
const ATTACH_POINT = {
  LEFT_TOP: 0,
  LEFT_BOTTOM: 2,
} as const

// ── Context ──

/** @public */
export type DropdownMenuContextValue = {
  open: () => boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  close: () => void
}

const DropdownMenuContext = createContext<DropdownMenuContextValue>()

/** @public */
export function useDropdownMenuContext(): DropdownMenuContextValue {
  const ctx = useContext(DropdownMenuContext)
  if (!ctx) {
    throw new Error("DropdownMenu compound components must be used within <DropdownMenu>")
  }
  return ctx
}

// ── Root ──

/** @public */
export type DropdownMenuProps = {
  /** Controlled open state. */
  open?: boolean
  /** Initial open state when uncontrolled. Default: false. */
  defaultOpen?: boolean
  /** Called when open state changes. */
  onOpenChange?: (open: boolean) => void
  children?: JSX.Element
}

function DropdownMenuRoot(props: DropdownMenuProps) {
  const isControlled = () => props.open !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = createSignal(props.defaultOpen ?? false)
  const open = () => (isControlled() ? !!props.open : uncontrolledOpen())

  const setOpen = (next: boolean) => {
    if (!isControlled()) {
      setUncontrolledOpen(next)
    }
    props.onOpenChange?.(next)
  }

  const toggle = () => setOpen(!open())
  const close = () => setOpen(false)

  const ctx: DropdownMenuContextValue = {
    open,
    setOpen,
    toggle,
    close,
  }

  const unsubscribe = onInput((event) => {
    if (open() && event.type === "key" && event.key === "escape") {
      close()
    }
  })
  onCleanup(unsubscribe)

  return (
    <DropdownMenuContext.Provider value={ctx}>
      <box direction="column" width="fit" height="fit">
        {props.children}
      </box>
    </DropdownMenuContext.Provider>
  )
}

// ── Trigger ──

/** @public */
export type DropdownMenuTriggerProps = {
  children?: JSX.Element
}

/** @public */
export function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  const ctx = useDropdownMenuContext()
  return (
    <box width="fit" height="fit" onPress={() => ctx.toggle()}>
      {props.children}
    </box>
  )
}

// ── Content ──

/** @public */
export type DropdownMenuContentProps = {
  children?: JSX.Element
  width?: SizingUnit
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  sideOffset?: number
  zIndex?: number
  backgroundColor?: string | number
  borderColor?: string | number
  borderWidth?: number
  cornerRadius?: number
  padding?: number
  shadow?: TGEProps["shadow"]
  scrollY?: boolean
}

/** @public */
export function DropdownMenuContent(props: DropdownMenuContentProps) {
  const ctx = useDropdownMenuContext()

  return (
    <Show when={ctx.open()}>
      <box
        floating="root"
        width="100%"
        height="100%"
        zIndex={9997}
        onPress={() => ctx.close()}
      />
      <box
        floating="parent"
        zIndex={props.zIndex ?? 9999}
        floatAttach={{ element: ATTACH_POINT.LEFT_TOP, parent: ATTACH_POINT.LEFT_BOTTOM }}
        floatOffset={{ x: 0, y: props.sideOffset ?? 4 }}
        direction="column"
        width={props.width}
        minWidth={props.minWidth ?? 128}
        maxWidth={props.maxWidth}
        maxHeight={props.maxHeight ?? 320}
        backgroundColor={props.backgroundColor}
        cornerRadius={props.cornerRadius}
        borderColor={props.borderColor}
        borderWidth={props.borderWidth}
        padding={props.padding}
        shadow={props.shadow}
        scrollY={props.scrollY ?? (props.maxHeight !== undefined)}
      >
        {props.children}
      </box>
    </Show>
  )
}

// ── Item ──

/** @public */
export type DropdownMenuItemProps = {
  onSelect?: () => void
  disabled?: boolean
  destructive?: boolean
  variant?: "default" | "destructive"
  inset?: boolean
  children?: JSX.Element
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  cornerRadius?: number
  opacity?: number
  hoverStyle?: TGEProps["hoverStyle"]
  focusStyle?: TGEProps["focusStyle"]
}

/** @public */
export function DropdownMenuItem(props: DropdownMenuItemProps) {
  const ctx = useDropdownMenuContext()

  return (
    <box
      focusable
      direction="row"
      alignY="center"
      gap={props.gap}
      paddingTop={props.paddingTop}
      paddingBottom={props.paddingBottom}
      paddingLeft={props.paddingLeft}
      paddingRight={props.paddingRight}
      cornerRadius={props.cornerRadius}
      opacity={props.disabled ? 0.5 : (props.opacity ?? 1)}
      hoverStyle={props.hoverStyle}
      focusStyle={props.focusStyle}
      onPress={() => {
        if (props.disabled) return
        props.onSelect?.()
        ctx.close()
      }}
    >
      {typeof props.children === "string" ? <text>{props.children}</text> : props.children}
    </box>
  )
}

// ── Separator ──

/** @public */
export type DropdownMenuSeparatorProps = {
  backgroundColor?: string | number
  paddingTop?: number
  paddingBottom?: number
}

/** @public */
export function DropdownMenuSeparator(props?: DropdownMenuSeparatorProps) {
  return (
    <box
      width="grow"
      height={1}
      backgroundColor={props?.backgroundColor}
      paddingTop={props?.paddingTop}
      paddingBottom={props?.paddingBottom}
    />
  )
}

// ── Label ──

/** @public */
export type DropdownMenuLabelProps = {
  children?: JSX.Element
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  inset?: boolean
}

/** @public */
export function DropdownMenuLabel(props: DropdownMenuLabelProps) {
  return (
    <box
      paddingTop={props.paddingTop}
      paddingBottom={props.paddingBottom}
      paddingLeft={props.paddingLeft}
      paddingRight={props.paddingRight}
    >
      {typeof props.children === "string" ? <text>{props.children}</text> : props.children}
    </box>
  )
}

// ── Attach sub-components ──

/** @public */
export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
})
