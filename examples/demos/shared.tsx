
import {
  Input,
  measureTextWidth,
  useFocus,
  type KeyEvent,
  For,
  Show,
  type JSX,
} from "vexart"

export const ui = {
  background: "#101111", surface: "#191a1a", selected: "#262727",
  border: "#343535", text: "#f1f1f1", muted: "#a5a6a8", faint: "#777b7e",
  amber: "#efbc65", mint: "#7cdda4", sans: "Helvetica Neue", mono: "Menlo",
} as const

export type DemoSize = { width: number; height: number }
export type Hint = { keys: string; label: string }

export function useDemo() {
  return { s: (value: number) => value }
}

export function Pane(props: { x: number; y: number; width: number; height: number; fill?: string; border?: string; radius?: number; children?: JSX.Element; zIndex?: number }) {
  const { s } = useDemo()
  return <box floating="parent" floatOffset={{ x: s(props.x), y: s(props.y) }} width={s(props.width)} height={s(props.height)}
    backgroundColor={props.fill} borderColor={props.border} borderWidth={props.border ? s(1) : 0}
    cornerRadius={s(props.radius ?? 0)} zIndex={props.zIndex}>{props.children}</box>
}

export function Label(props: { x: number; y: number; width?: number; height?: number; size?: number; weight?: number; color?: string; mono?: boolean; align?: "left" | "center" | "right"; children: JSX.Element }) {
  const { s } = useDemo()
  const size = () => Math.round(s(props.size ?? 17))
  return <box floating="parent" floatOffset={{ x: s(props.x), y: s(props.y) }} width={props.width === undefined ? "fit" : s(props.width)}
    height={s(props.height ?? (props.size ?? 17) * 1.45)} alignX={props.align ?? "left"} pointerPassthrough>
    <text fontFamily={props.mono ? ui.mono : ui.sans} fontSize={size()} fontWeight={props.weight ?? 400}
      color={props.color ?? ui.text} lineHeight={Math.ceil(size() * 1.3)} whiteSpace="pre-wrap" pointerPassthrough>{props.children}</text>
  </box>
}

export const icons = ["images", "image", "buildings", "triangle", "squares-four", "list", "magnifying-glass", "copy", "pause", "play", "arrow-counter-clockwise", "caret-down", "arrows-out", "arrow-left", "arrow-right", "arrow-up", "arrow-down", "arrow-bend-down-left", "x"] as const
export type IconName = typeof icons[number]
export function Icon(props: { name: IconName; x?: number; y?: number; size?: number; tone?: "white" | "muted" | "amber" | "ink" }) {
  const { s } = useDemo()
  return <image src={new URL(`./assets/icons/${props.name}-${props.tone ?? "white"}.png`, import.meta.url).pathname}
    width={s(props.size ?? 22)} height={s(props.size ?? 22)} objectFit="contain" pointerPassthrough
    floating={props.x !== undefined || props.y !== undefined ? "parent" : undefined}
    floatOffset={props.x !== undefined || props.y !== undefined ? { x: s(props.x ?? 0), y: s(props.y ?? 0) } : undefined} />
}

export function Button(props: { x: number; y: number; width: number; height: number; id: string; label?: string; icon?: IconName; onPress: () => void; onKeyDown?: (event: KeyEvent) => void; active?: boolean; primary?: boolean; border?: boolean; align?: "left" | "center"; children?: JSX.Element; disabled?: boolean; size?: number }) {
  const { s } = useDemo()
  const activate = () => { if (!props.disabled) { focus.focus(); props.onPress() } }
  const focus = useFocus({ id: props.id, onKeyDown: event => {
    if (props.disabled) return
    if (event.key === "enter" || event.key === " ") activate()
    props.onKeyDown?.(event)
  } })
  return <box floating="parent" floatOffset={{ x: s(props.x), y: s(props.y) }} width={s(props.width)} height={s(props.height)}
    direction="row" alignX={props.align ?? "center"} alignY="center" gap={s(9)} paddingX={s(12)} onPress={activate}
    backgroundColor={props.primary ? "#eeeeee" : props.active ? ui.selected : props.border === false ? "#00000000" : "#1f2020"}
    borderWidth={focus.focused() || props.border !== false ? s(1) : 0} borderColor={focus.focused() ? "#b8bec1" : "#3e4040"}
    cornerRadius={s(6)} hoverStyle={{ backgroundColor: props.primary ? "#ffffff" : "#303232" }} opacity={props.disabled ? 0.4 : 1}>
    <Show when={props.icon}>{name => <Icon name={name()} size={21} tone={props.primary ? "ink" : "white"} />}</Show>
    <Show when={props.label}><text fontFamily={ui.sans} fontSize={Math.round(s(props.size ?? 16))} color={props.primary ? "#141515" : ui.text} pointerPassthrough>{props.label}</text></Show>
    {props.children}
  </box>
}

export function SearchField(props: { x?: number; y?: number; width: number; height: number; id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const { s } = useDemo()
  const content = <Input value={props.value} onChange={props.onChange} placeholder={props.placeholder} focusId={props.id}
      renderInput={ctx => {
        const cursor = () => measureTextWidth(ctx.value.slice(0, ctx.cursor), { fontSize: Math.round(s(16)), fontFamily: ui.sans })
        return <box {...ctx.inputProps} width={s(props.width)} height={s(props.height)} direction="row" gap={s(12)} paddingX={s(13)}
          alignY="center" borderWidth={s(1)} borderColor={ctx.focused ? "#8f999e" : "#404141"} cornerRadius={s(7)} backgroundColor="#1a1b1b">
          <Icon name="magnifying-glass" size={20} tone="muted" />
          <box width="grow" height={s(24)} contain="paint">
            <text fontFamily={ui.sans} fontSize={Math.round(s(16))} color={ctx.showPlaceholder ? "#85888a" : ui.text} pointerPassthrough>{ctx.displayText}</text>
            <Show when={ctx.focused && ctx.blink}>
              <box floating="parent" floatOffset={{ x: cursor(), y: s(1) }} width={s(1.5)} height={s(19)} backgroundColor={ui.text} pointerPassthrough />
            </Show>
          </box>
        </box>
      }} />
  if (props.x !== undefined && props.y !== undefined) {
    return <Pane x={props.x} y={props.y} width={props.width} height={props.height}>{content}</Pane>
  }
  return <box width={s(props.width)} height={s(props.height)}>{content}</box>
}

export function DemoFooter(props: { hints: readonly Hint[] }) {
  return (
    <box width="100%" height={44} direction="row" alignY="center" alignX="space-between" paddingX={24} backgroundColor="#141515" borderTop={1} borderColor={ui.border}>
      <box direction="row" alignY="center" gap={20}>
        <For each={props.hints}>{hint => <box direction="row" width="fit" flexShrink={0} alignY="center" gap={10}>
          <box height={26} minWidth={26} width="fit" flexShrink={0} paddingX={7} alignX="center" alignY="center"
            borderWidth={1} borderColor="#404141" backgroundColor="#242626" cornerRadius={4}>
            <text flexShrink={0} fontFamily={ui.mono} color={ui.text} fontSize={13}>{hint.keys}</text>
          </box>
          <text flexShrink={0} fontFamily={ui.sans} color={ui.muted} fontSize={13}>{hint.label}</text>
        </box>}</For>
      </box>
      <text fontFamily={ui.mono} fontSize={11} color={ui.faint}>VEXART DEMO</text>
    </box>
  )
}
