import { Box, Text } from "@vexart/app"
import { useFocus } from "@vexart/engine"
import type { TGEProps } from "@vexart/engine"
import { Show, children, type JSX } from "solid-js"
import { piColors } from "./theme"

/** Local presentation only: rich rows must not be nested inside a text node. */
export function PiButton(props: {
  children?: JSX.Element; outlined?: boolean; onPress?: () => void; focusId?: string; disabled?: boolean
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "xs" | "sm" | "icon" | "icon-sm"; width?: TGEProps["width"]; height?: number
}) {
  const content = children(() => props.children)
  const activate = () => { if (!props.disabled) { focus.focus(); props.onPress?.() } }
  const focus = useFocus({ id: props.focusId, onKeyDown: (event) => {
    if (event.key === "enter" || event.key === " ") activate()
  } })
  const accent = () => props.variant === "default" || props.variant === "secondary"
  const icon = () => props.size === "icon" || props.size === "icon-sm"
  return <Box onPress={activate} width={props.width ?? (icon() ? 40 : "fit")} height={props.height ?? (icon() ? 40 : undefined)} minHeight={props.size === "xs" ? 28 : 36}
    direction="row" alignX={icon() ? "center" : "left"} alignY="center" paddingX={icon() ? 0 : 12} paddingY={icon() ? 0 : 8}
    backgroundColor={props.variant === "default" ? piColors.mint : accent() ? piColors.mintSoft : "#00000000"} cornerRadius={icon() && props.variant === "default" ? 20 : 8}
    borderWidth={focus.focused() || props.outlined || props.variant === "outline" ? 1 : 0} borderColor={focus.focused() || props.outlined ? piColors.mint : piColors.borderStrong}
    hoverStyle={{ backgroundColor: accent() ? piColors.mintSoft : piColors.raised }} opacity={props.disabled ? 0.4 : 1}>
    <Show when={typeof content() === "string" || typeof content() === "number"} fallback={content()}>
      <Text color={props.variant === "destructive" ? piColors.red : props.variant === "default" ? piColors.background : accent() ? piColors.mint : piColors.text} fontSize={14}>{content()}</Text>
    </Show>
  </Box>
}

export type PiIconName = "chat" | "sessions" | "tree" | "settings" | "send" | "chevron" | "down" | "terminal" | "check" | "search" | "plus"
export function PiIcon(props: { name: PiIconName; active?: boolean; size?: number; ink?: boolean }) {
  return <image width={props.size ?? 24} height={props.size ?? 24} src={new URL(`./assets/${props.name}${props.ink ? "-ink" : props.active ? "-mint" : ""}.png`, import.meta.url).pathname} />
}

export function PiToggle(props: { checked: boolean; onChange: (checked: boolean) => void; focusId: string }) {
  return <PiButton size="icon" width={52} focusId={props.focusId} onPress={() => props.onChange(!props.checked)}>
    <Box width={46} height={26} cornerRadius={13} backgroundColor={props.checked ? piColors.mint : "#303837"} padding={3} direction="row" alignX={props.checked ? "right" : "left"}>
      <Box width={20} height={20} cornerRadius={10} backgroundColor={props.checked ? "#f4fffaff" : "#a4aeab"} />
    </Box>
  </PiButton>
}
