import { createSignal, type JSX } from "solid-js"
import { useDrag, type NodeMouseEvent, type PressEvent } from "@vexart/engine"
import {
  LIGHTCODE_RESIZE_EDGE,
  LIGHTCODE_WINDOW_STATUS,
  type LightcodeResizeEdge,
  type LightcodeWindowManager,
  type LightcodeWindowRect,
  type LightcodeWindowSnapshot,
} from "./window-manager"
import { LIGHTCODE_WINDOW_VARIANT, lightcodeWindowRecipes, lightcodeWindowTokens, type LightcodeWindowVariant } from "./tokens"

interface DragOrigin {
  x: number
  y: number
  rect: LightcodeWindowRect
}

export interface LightcodeWindowFrameProps {
  manager: LightcodeWindowManager
  window: LightcodeWindowSnapshot
  variant?: LightcodeWindowVariant
  children?: JSX.Element
}

function stop(event?: PressEvent) {
  event?.stopPropagation()
}

function WindowControl(props: {
  label: string
  color?: string
  onPress: (event?: PressEvent) => void
}) {
  const tokens = lightcodeWindowTokens
  return (
    <box
      focusable
      width={tokens.size.controlSize}
      height={tokens.size.controlSize}
      cornerRadius={4}
      alignX="center"
      alignY="center"
      backgroundColor="#ffffff08"
      borderColor={tokens.colors.titlebarPillBorder}
      borderWidth={1}
      hoverStyle={{ backgroundColor: props.color ?? tokens.colors.controlHover }}
      activeStyle={{ backgroundColor: tokens.colors.accentSoft }}
      focusStyle={{ borderColor: tokens.colors.accent, borderWidth: 1 }}
      onPress={props.onPress}
    >
      <text color={tokens.colors.control} fontSize={11} lineHeight={12}>{props.label}</text>
    </box>
  )
}

function TitleText(props: { width: number; label: string; color: string; weight?: number }) {
  return (
    <box width={props.width} height={18} alignY="center">
      <text color={props.color} fontSize={11} fontWeight={props.weight} lineHeight={13}>{props.label}</text>
    </box>
  )
}

function ToolbarButton(props: { label: string; active?: boolean }) {
  const tokens = lightcodeWindowTokens
  return (
    <box
      width={tokens.size.toolbarButton}
      height={tokens.size.toolbarButton}
      alignX="center"
      alignY="center"
      cornerRadius={4}
      backgroundColor={props.active ? tokens.colors.accentWash : "#ffffff08"}
      borderColor={props.active ? tokens.colors.borderFocused : tokens.colors.titlebarPillBorder}
      borderWidth={1}
    >
      <text color={props.active ? tokens.colors.accent : tokens.colors.faint} fontSize={10} lineHeight={12}>{props.label}</text>
    </box>
  )
}

function ResizeHandle(props: {
  edge: LightcodeResizeEdge
  manager: LightcodeWindowManager
  window: LightcodeWindowSnapshot
}) {
  const tokens = lightcodeWindowTokens
  const [origin, setOrigin] = createSignal<DragOrigin | null>(null)
  const size = tokens.size.resizeHandle
  const right = props.edge === LIGHTCODE_RESIZE_EDGE.RIGHT
  const bottom = props.edge === LIGHTCODE_RESIZE_EDGE.BOTTOM
  const corner = props.edge === LIGHTCODE_RESIZE_EDGE.CORNER
  const drag = useDrag({
    disabled: () => props.window.status === LIGHTCODE_WINDOW_STATUS.MAXIMIZED,
    onDragStart: (event: NodeMouseEvent) => {
      props.manager.focus(props.window.id)
      setOrigin({ x: event.x, y: event.y, rect: props.window.rect })
    },
    onDrag: (event: NodeMouseEvent) => {
      const start = origin()
      if (!start) return
      const deltaX = event.x - start.x
      const deltaY = event.y - start.y
      props.manager.resize(props.window.id, {
        x: start.rect.x,
        y: start.rect.y,
        width: bottom ? start.rect.width : start.rect.width + deltaX,
        height: right ? start.rect.height : start.rect.height + deltaY,
      })
    },
    onDragEnd: () => setOrigin(null),
  })

  return (
    <box
      {...drag.dragProps}
      floating="parent"
      floatOffset={{
        x: right ? props.window.rect.width - Math.round(size / 2) : corner ? props.window.rect.width - size : 0,
        y: bottom ? props.window.rect.height - Math.round(size / 2) : corner ? props.window.rect.height - size : tokens.size.titlebarHeight,
      }}
      zIndex={props.window.zIndex + 2}
      width={right ? size : corner ? size : props.window.rect.width}
      height={bottom ? size : corner ? size : props.window.rect.height - tokens.size.titlebarHeight}
      backgroundColor={corner ? tokens.colors.resizeHandle : "#00000001"}
      cornerRadius={corner ? 4 : 0}
      hoverStyle={{ backgroundColor: tokens.colors.resizeHandleActive }}
      activeStyle={{ backgroundColor: tokens.colors.accentSoft }}
    >
      {corner ? <text color={tokens.colors.accent} fontSize={10}>+</text> : null}
    </box>
  )
}

export function LightcodeWindowFrame(props: LightcodeWindowFrameProps) {
  const tokens = lightcodeWindowTokens
  const variant = props.variant ?? LIGHTCODE_WINDOW_VARIANT.GLASS
  const [origin, setOrigin] = createSignal<DragOrigin | null>(null)
  const titlePillWidth = () => Math.max(220, props.window.rect.width - 360)
  const titleWidth = () => Math.max(120, titlePillWidth() - 130)
  const recipe = () => {
    const state = props.window.active ? "focused" : "inactive"
    return lightcodeWindowRecipes[variant][state]
  }
  const isMaximized = () => props.window.status === LIGHTCODE_WINDOW_STATUS.MAXIMIZED
  const drag = useDrag({
    disabled: isMaximized,
    onDragStart: (event: NodeMouseEvent) => {
      props.manager.focus(props.window.id)
      setOrigin({ x: event.x, y: event.y, rect: props.window.rect })
    },
    onDrag: (event: NodeMouseEvent) => {
      const start = origin()
      if (!start) return
      props.manager.move(props.window.id, {
        x: start.rect.x + event.x - start.x,
        y: start.rect.y + event.y - start.y,
        width: start.rect.width,
        height: start.rect.height,
      })
    },
    onDragEnd: () => setOrigin(null),
  })

  return (
    <box
      floating="root"
      floatOffset={{ x: props.window.rect.x, y: props.window.rect.y }}
      zIndex={props.window.zIndex}
      layer
      focusable
      width={props.window.rect.width}
      height={props.window.rect.height}
      direction="column"
      backgroundColor={recipe().backgroundColor}
      gradient={recipe().surfaceGradient}
      cornerRadius={tokens.size.radius}
      borderColor={recipe().borderColor}
      borderWidth={tokens.size.borderWidth}
      shadow={recipe().shadow}
      glow={recipe().glow}
      opacity={recipe().opacity}
      onPress={() => props.manager.focus(props.window.id)}
      focusStyle={{ borderColor: tokens.colors.borderFocused, borderWidth: 1 }}
    >
      <box
        floating="parent"
        floatOffset={{ x: 1, y: 1 }}
        zIndex={props.window.zIndex + 1}
        width={props.window.rect.width - 2}
        height={1}
        backgroundColor={tokens.colors.bevelLight}
      />
      <box
        floating="parent"
        floatOffset={{ x: 1, y: props.window.rect.height - 2 }}
        zIndex={props.window.zIndex + 1}
        width={props.window.rect.width - 2}
        height={1}
        backgroundColor={tokens.colors.bevelDark}
      />
      <box
        {...drag.dragProps}
        direction="row"
        alignY="center"
        alignX="space-between"
        height={tokens.size.titlebarHeight}
        paddingLeft={tokens.size.padding}
        paddingRight={tokens.size.padding}
        backgroundColor={recipe().titlebarColor}
        gradient={recipe().titlebarGradient}
        cornerRadii={{ tl: tokens.size.radius, tr: tokens.size.radius, br: 0, bl: 0 }}
        borderBottom={1}
        borderColor={tokens.colors.divider}
      >
        <box direction="row" alignY="center" gap={10} width={props.window.rect.width - 220}>
          <ToolbarButton label="=" />
          <box
            direction="row"
            alignY="center"
            gap={10}
            width={titlePillWidth()}
            height={tokens.size.titlePillHeight}
            paddingLeft={8}
            paddingRight={10}
            backgroundColor={tokens.colors.titlebarPill}
            borderColor={tokens.colors.titlebarPillBorder}
            borderWidth={1}
            cornerRadius={5}
          >
            <TitleText width={titleWidth()} label={props.window.title} color={tokens.colors.foreground} weight={600} />
            {props.window.subtitle ? (
              <TitleText width={100} label={"> " + props.window.subtitle} color={tokens.colors.muted} />
            ) : null}
          </box>
          <box
            width={18}
            height={18}
            cornerRadius={4}
            borderWidth={1}
            borderColor={props.window.active ? tokens.colors.accent : tokens.colors.border}
            backgroundColor={props.window.active ? tokens.colors.accentSoft : "#ffffff08"}
          >
            <text color={tokens.colors.accent} fontSize={9}>[]</text>
          </box>
        </box>
        <box direction="row" alignY="center" gap={tokens.size.controlGap}>
          <ToolbarButton label="*" />
          <ToolbarButton label="o" active={props.window.active} />
          <ToolbarButton label="..." />
          <WindowControl label="–" onPress={(event) => { stop(event); props.manager.minimize(props.window.id) }} />
          <WindowControl label={isMaximized() ? "<>" : "[]"} onPress={(event) => { stop(event); props.manager.toggleMaximize(props.window.id) }} />
          <WindowControl label="×" color={tokens.colors.closeHover} onPress={(event) => { stop(event); props.manager.close(props.window.id) }} />
        </box>
      </box>
      <box
        width="grow"
        height="grow"
        padding={tokens.size.contentPadding - 2}
        backgroundColor={tokens.colors.content}
        gradient={lightcodeWindowTokens.gradients.content}
        cornerRadii={{ tl: 0, tr: 0, br: tokens.size.radius, bl: tokens.size.radius }}
      >
        <box
          width="grow"
          height="grow"
          padding={2}
          backgroundColor={tokens.colors.contentInset}
          borderColor={tokens.colors.contentBorder}
          borderWidth={1}
          cornerRadius={5}
        >
          {props.children}
        </box>
      </box>
      <ResizeHandle edge={LIGHTCODE_RESIZE_EDGE.RIGHT} manager={props.manager} window={props.window} />
      <ResizeHandle edge={LIGHTCODE_RESIZE_EDGE.BOTTOM} manager={props.manager} window={props.window} />
      <ResizeHandle edge={LIGHTCODE_RESIZE_EDGE.CORNER} manager={props.manager} window={props.window} />
    </box>
  )
}
