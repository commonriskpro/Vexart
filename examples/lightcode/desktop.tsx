import { For, type JSX } from "solid-js"
import { type LightcodeWindowManager, type LightcodeWindowSnapshot } from "./window-manager"
import { LightcodeWindowFrame } from "./window-frame"
import { LIGHTCODE_WINDOW_VARIANT, lightcodeWindowTokens, type LightcodeWindowVariant } from "./tokens"

export interface LightcodeDesktopProps {
  manager: LightcodeWindowManager
  width: number
  height: number
  variant?: LightcodeWindowVariant
  renderWindow: (window: LightcodeWindowSnapshot) => JSX.Element
}

function ChromeText(props: { width: number; label: string; color: string; weight?: number }) {
  return (
    <box width={props.width} height={20} alignY="center">
      <text color={props.color} fontSize={11} fontWeight={props.weight} lineHeight={13}>{props.label}</text>
    </box>
  )
}

function LightcodeTopbar(props: { width: number }) {
  const tokens = lightcodeWindowTokens
  return (
    <box
      floating="parent"
      floatOffset={{ x: tokens.size.dockInset, y: 12 }}
      zIndex={9_500}
      width={props.width - tokens.size.dockInset * 2}
      height={32}
      direction="row"
      alignY="center"
      alignX="space-between"
      paddingLeft={10}
      paddingRight={10}
      backgroundColor={tokens.colors.desktopChrome}
      gradient={tokens.gradients.dock}
      borderColor={tokens.colors.desktopChromeBorder}
      borderWidth={1}
      cornerRadius={5}
    >
      <box direction="row" alignY="center" gap={16} width={650}>
        <ChromeText width={80} label="menu" color={tokens.colors.foreground} weight={600} />
        <box
          direction="row"
          alignY="center"
          gap={14}
          width={440}
          height={22}
          paddingLeft={12}
          paddingRight={12}
          backgroundColor={tokens.colors.titlebarPill}
          borderColor={tokens.colors.titlebarPillBorder}
          borderWidth={1}
          cornerRadius={5}
        >
          <ChromeText width={190} label="Compute Shaders" color={tokens.colors.foreground} weight={600} />
          <ChromeText width={22} label=">" color={tokens.colors.muted} />
          <ChromeText width={150} label="v_engine.zig" color={tokens.colors.foreground} />
        </box>
      </box>
      <box direction="row" gap={12} alignY="center" width={96}>
        <ChromeText width={18} label="o" color={tokens.colors.faint} />
        <ChromeText width={28} label="[]" color={tokens.colors.faint} />
        <ChromeText width={18} label="x" color={tokens.colors.faint} />
      </box>
    </box>
  )
}

function LightcodeDock(props: { manager: LightcodeWindowManager; width: number; height: number }) {
  const tokens = lightcodeWindowTokens
  const dockWidth = props.width - tokens.size.dockInset * 2
  const dockY = props.height - tokens.size.dockHeight - tokens.size.dockInset
  return (
    <box
      floating="parent"
      floatOffset={{ x: tokens.size.dockInset, y: dockY }}
      zIndex={10_000}
      layer
      width={dockWidth}
      height={tokens.size.dockHeight}
      direction="row"
      alignY="center"
      alignX="space-between"
      paddingLeft={10}
      paddingRight={10}
      backgroundColor={tokens.colors.dock}
      gradient={tokens.gradients.dock}
      borderColor={tokens.colors.dockBorder}
      borderWidth={1}
      cornerRadius={6}
      shadow={[{ x: 0, y: 8, blur: 20, color: 0x00000080 }]}
    >
      <box direction="row" gap={10} alignY="center" width={420}>
        <box width={150} direction="row" gap={10} alignY="center">
          <ChromeText width={18} label="*" color={tokens.colors.accent} />
          <ChromeText width={100} label="Lightcode" color={tokens.colors.muted} />
        </box>
        <ChromeText width={12} label="|" color={tokens.colors.divider} />
        <For each={props.manager.minimizedWindows()} fallback={<text color={tokens.colors.muted} fontSize={12}>no minimized windows</text>}>
          {(window) => (
            <box
              focusable
              direction="row"
              alignY="center"
              gap={6}
              width={190}
              paddingX={9}
              paddingY={5}
              backgroundColor={tokens.colors.dockItem}
              borderColor={tokens.colors.dockBorder}
              borderWidth={1}
              cornerRadius={4}
              hoverStyle={{ backgroundColor: tokens.colors.accentSoft, borderColor: tokens.colors.borderFocused }}
              activeStyle={{ backgroundColor: tokens.colors.accentSoft }}
              focusStyle={{ borderColor: tokens.colors.borderFocused, borderWidth: 1 }}
              onPress={() => props.manager.focus(window.id)}
            >
              <ChromeText width={26} label="[]" color={tokens.colors.accent} />
              <ChromeText width={130} label={window.title} color={tokens.colors.foreground} />
            </box>
          )}
        </For>
      </box>
      <box width={140} alignX="right">
        <ChromeText width={130} label="Lightcode v2.0" color={tokens.colors.muted} />
      </box>
    </box>
  )
}

export function LightcodeDesktop(props: LightcodeDesktopProps) {
  const variant = props.variant ?? LIGHTCODE_WINDOW_VARIANT.GLASS
  return (
    <box
      width={props.width}
      height={props.height}
      backgroundColor="#07080bf8"
      gradient={{ type: "linear", from: 0x10131aff, to: 0x020305ff, angle: 90 }}
      borderWidth={1}
      borderColor="#ffffff14"
    >
      <LightcodeTopbar width={props.width} />
      <For each={props.manager.visibleWindows()}>
        {(window) => (
          <LightcodeWindowFrame manager={props.manager} window={window} variant={variant}>
            {props.renderWindow(window)}
          </LightcodeWindowFrame>
        )}
      </For>
      <LightcodeDock manager={props.manager} width={props.width} height={props.height} />
    </box>
  )
}
