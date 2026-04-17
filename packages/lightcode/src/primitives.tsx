import { createSignal, type JSX } from "solid-js"
import { markDirty, useDrag, useInteractionLayer, type NodeMouseEvent } from "../../runtime/src/index"
import type { CanvasContext } from "../../core/src/index"
import { colors, radius, space } from "./tokens"

type Gradient =
  | { type: "linear"; from: number; to: number; angle?: number }
  | { type: "radial"; from: number; to: number }

type Shadow =
  | { x: number; y: number; blur: number; color: number }
  | Array<{ x: number; y: number; blur: number; color: number }>

export function Rule() {
  return <box width="grow" height={1} backgroundColor={colors.line} />
}

export function Chip(props: { label: string; active?: boolean }) {
  return (
    <box paddingX={space[2]} paddingY={4} backgroundColor={props.active ? 0xf3bf6b14 : colors.chip} borderColor={props.active ? colors.panelBorderWarm : colors.panelBorder} borderWidth={1} cornerRadius={radius.sm}>
      <text color={props.active ? colors.white : colors.textSoft} fontSize={9}>{props.label}</text>
    </box>
  )
}

export function ToolIcon(props: { label: string; active?: boolean }) {
  return (
    <box width={18} height={18} alignX="center" alignY="center" backgroundColor={props.active ? 0xf3bf6b16 : 0xffffff03} borderColor={props.active ? colors.panelBorderWarm : colors.panelBorder} borderWidth={1} cornerRadius={radius.sm}>
      <text color={props.active ? colors.warm : colors.textDim} fontSize={8}>{props.label}</text>
    </box>
  )
}

export function Button(props: { label: string }) {
  return (
    <box paddingX={space[2]} paddingY={4} backgroundColor={0xf3bf6b18} borderColor={colors.panelBorderWarm} borderWidth={1} cornerRadius={radius.sm}>
      <text color={colors.warm} fontSize={10}>{props.label}</text>
    </box>
  )
}

export function SurfaceCard(props: {
  children: JSX.Element
  warm?: boolean
  padded?: boolean
  width?: number | string
  justify?: boolean
}) {
  return (
    <box
      width={props.width}
      direction="row"
      gap={space[2]}
      alignY="center"
      padding={props.padded ? space[2] : undefined}
      backgroundColor={props.warm ? 0xf3bf6b10 : colors.chip}
      borderColor={props.warm ? colors.panelBorderWarm : colors.panelBorder}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      {props.children}
      {props.justify ? <box width="grow" /> : null}
    </box>
  )
}

export function Metric(props: { label: string; value: string; warm?: boolean }) {
  return (
    <box direction="column" gap={2} paddingX={space[2]} paddingY={space[1]} backgroundColor={props.warm ? 0xf3bf6b10 : colors.chip} borderColor={props.warm ? colors.panelBorderWarm : colors.panelBorder} borderWidth={1} cornerRadius={radius.sm}>
      <text color={colors.textMute} fontSize={8}>{props.label}</text>
      <text color={props.warm ? colors.warm : colors.text} fontSize={10}>{props.value}</text>
    </box>
  )
}

export function PanelSection(props: {
  children: JSX.Element
  padded?: boolean
  inset?: boolean
  gap?: number
}) {
  return (
    <box
      width="grow"
      direction="column"
      gap={props.gap ?? space[2]}
      padding={props.padded ? space[2] : undefined}
      backgroundColor={props.inset ? 0xffffff02 : undefined}
      borderColor={props.inset ? colors.panelBorder : undefined}
      borderWidth={props.inset ? 1 : 0}
      cornerRadius={props.inset ? radius.md : undefined}
    >
      {props.children}
    </box>
  )
}

export function InlineActions(props: { children: JSX.Element }) {
  return <box direction="row" gap={space[1]}>{props.children}</box>
}

export function Toolbar(props: { children: JSX.Element; justify?: boolean }) {
  return (
    <box width="grow" direction="row" gap={space[2]} alignY="center">
      {props.children}
      {props.justify ? <box width="grow" /> : null}
    </box>
  )
}

const INSPECTOR_ROW_TONE = {
  DEFAULT: "default",
  WARM: "warm",
  COOL: "cool",
  MUTED: "muted",
} as const

export type InspectorRowTone = (typeof INSPECTOR_ROW_TONE)[keyof typeof INSPECTOR_ROW_TONE]

const GRAPH_LEGEND_TONE = {
  DEFAULT: "default",
  WARM: "warm",
  COOL: "cool",
  MUTED: "muted",
} as const

export type GraphLegendTone = (typeof GRAPH_LEGEND_TONE)[keyof typeof GRAPH_LEGEND_TONE]

export interface GraphLegendItemData {
  glyph: string
  label: string
  detail?: string
  swatchColor?: number
  tone?: GraphLegendTone
}

function getInspectorValueColor(tone?: InspectorRowTone) {
  if (tone === INSPECTOR_ROW_TONE.WARM) return colors.warm
  if (tone === INSPECTOR_ROW_TONE.COOL) return colors.blueSoft
  if (tone === INSPECTOR_ROW_TONE.MUTED) return colors.textDim
  return colors.textSoft
}

function getLegendToneColor(tone?: GraphLegendTone) {
  if (tone === GRAPH_LEGEND_TONE.WARM) return colors.warm
  if (tone === GRAPH_LEGEND_TONE.COOL) return colors.blueSoft
  if (tone === GRAPH_LEGEND_TONE.MUTED) return colors.textDim
  return colors.textSoft
}

export function InspectorRow(props: {
  label: string
  value: string
  tone?: InspectorRowTone
  leading?: JSX.Element
  trailing?: JSX.Element
}) {
  return (
    <box direction="row" gap={space[2]} alignY="center" width="grow">
      {props.leading}
      <text color={colors.textDim} fontSize={9}>{props.label}</text>
      <box width="grow" />
      <text color={getInspectorValueColor(props.tone)} fontSize={10}>{props.value}</text>
      {props.trailing}
    </box>
  )
}

export function AppBar(props: {
  children: JSX.Element
  x: number
  y: number
  width?: number
  height?: number
  zIndex?: number
  debugName?: string
  gap?: number
  paddingX?: number
}) {
  return (
    <box
      layer
      debugName={props.debugName}
      floating="root"
      floatOffset={{ x: props.x, y: props.y }}
      zIndex={props.zIndex ?? 20}
      direction="row"
      gap={props.gap ?? space[2]}
      alignY="center"
      paddingX={props.paddingX}
      height={props.height}
      width={props.width}
      backgroundColor={colors.panel}
      borderColor={colors.panelBorder}
      borderWidth={1}
      cornerRadius={radius.sm}
    >
      {props.children}
    </box>
  )
}

export function StatusRow(props: { label: string; value: string }) {
  return <InspectorRow label={props.label} value={props.value} />
}

export function KeyValueList(props: { rows: Array<[string, string]>; inset?: boolean }) {
  return (
    <PanelSection inset={props.inset} padded gap={space[2]}>
      {props.rows.map((row) => <InspectorRow label={row[0]} value={row[1]} />)}
    </PanelSection>
  )
}

export function PanelFooter(props: {
  children: JSX.Element
  separated?: boolean
  inset?: boolean
  justify?: boolean
}) {
  return (
    <box width="grow" direction="column" gap={space[2]}>
      {props.separated === false ? null : <Rule />}
      <box
        width="grow"
        direction="row"
        gap={space[2]}
        alignY="center"
        padding={props.inset ? space[2] : undefined}
        backgroundColor={props.inset ? 0xffffff02 : undefined}
        borderColor={props.inset ? colors.panelBorder : undefined}
        borderWidth={props.inset ? 1 : 0}
        cornerRadius={props.inset ? radius.md : undefined}
      >
        {props.children}
        {props.justify ? <box width="grow" /> : null}
      </box>
    </box>
  )
}

export function GraphLegend(props: {
  title?: string
  items: GraphLegendItemData[]
}) {
  return (
    <PanelSection inset padded gap={space[2]}>
      {props.title ? <text color={colors.textDim} fontSize={9}>{props.title}</text> : null}
      {props.items.map((item) => (
        <box direction="row" gap={space[2]} alignY="center" width="grow">
          <box direction="row" gap={space[1]} alignY="center" width="grow">
            <box width={18} height={18} alignX="center" alignY="center" backgroundColor={0xffffff03} borderColor={item.swatchColor ?? colors.panelBorder} borderWidth={1} cornerRadius={radius.sm}>
              <text color={item.swatchColor ?? getLegendToneColor(item.tone)} fontSize={8}>{item.glyph}</text>
            </box>
            <text color={getLegendToneColor(item.tone)} fontSize={10}>{item.label}</text>
          </box>
          {item.detail ? <text color={colors.textDim} fontSize={9}>{item.detail}</text> : null}
        </box>
      ))}
    </PanelSection>
  )
}

export type CodeLine = {
  n: string
  head?: string
  tail: string
  active?: boolean
}

export function CodeBlock(props: { lines: CodeLine[] }) {
  return (
    <PanelSection inset padded gap={space[1]}>
      {props.lines.map((line) => (
        <box direction="row" gap={space[2]} alignY="center" paddingX={line.active ? space[1] : 0} paddingY={1} backgroundColor={line.active ? colors.activeLine : 0x00000000} borderColor={line.active ? colors.activeBorder : 0x00000000} borderWidth={line.active ? 1 : 0} cornerRadius={radius.sm}>
          <box width={20} alignX="right"><text color={colors.textDim} fontSize={9}>{line.n}</text></box>
          {line.head ? <text color={colors.warm} fontSize={10}>{line.head}</text> : null}
          <text color={colors.text} fontSize={10}>{line.tail}</text>
        </box>
      ))}
    </PanelSection>
  )
}

export function CodeFrame(props: { title: string; chips?: string[]; activeChip?: string; lines: CodeLine[]; rightMeta?: string; footer?: JSX.Element; tools?: JSX.Element }) {
  return (
    <PanelSection gap={space[3]}>
      <Toolbar>
        <Toolbar justify>
          <InlineActions>
            {(props.chips ?? []).map((chip) => <Chip label={chip} active={chip === props.activeChip} />)}
          </InlineActions>
        </Toolbar>
        {props.tools}
      </Toolbar>
      <Rule />
      <Toolbar>
        <text color={colors.warm} fontSize={14}>▣</text>
        <text color={colors.text} fontSize={14}>{props.title}</text>
        <box width="grow" />
        {props.rightMeta ? <text color={colors.textDim} fontSize={9}>{props.rightMeta}</text> : null}
      </Toolbar>
      <Rule />
      <CodeBlock lines={props.lines} />
      {props.footer ? <><Rule />{props.footer}</> : null}
    </PanelSection>
  )
}

export function drawOverlayCard(
  ctx: CanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  value: string,
) {
  ctx.rect(x + 4, y + 4, width, height, { fill: 0x00000044, radius: 9 })
  ctx.rect(x, y, width, height, { fill: 0x2a2118ea, radius: 9, stroke: 0xf3bf6b30, strokeWidth: 1 })
  ctx.text(x + 16, y + 10, title, colors.white)
  ctx.text(x + 16, y + 28, value, colors.warm)
}

export function ShellFrame(props: {
  x: number
  y: number
  width: number
  height: number
  zIndex?: number
  debugName?: string
  children?: JSX.Element
  backgroundColor?: number
  gradient?: Gradient
  borderColor?: number
  shadow?: Shadow
  topRuleTo?: number
  bottomRuleTo?: number
  bottomRuleOpacity?: number
  pointerPassthrough?: boolean
}) {
  return (
    <box
      layer
      debugName={props.debugName ?? "shell-frame"}
      floating="root"
      floatOffset={{ x: props.x, y: props.y }}
      zIndex={props.zIndex ?? 1}
      width={props.width}
      height={props.height}
      backgroundColor={props.backgroundColor ?? colors.panel}
      gradient={props.gradient}
      borderColor={props.borderColor ?? colors.panelBorder}
      borderWidth={1}
      cornerRadius={12}
      shadow={props.shadow}
      pointerPassthrough={props.pointerPassthrough}
    >
      <box width="grow" height={1} gradient={{ type: "linear", from: 0xffffff08, to: props.topRuleTo ?? colors.warmLine, angle: 0 }} />
      <box width="grow" height="grow" direction="column">
        {props.children ?? <box width="grow" height="grow" />}
      </box>
      <box width="grow" height={1} gradient={{ type: "linear", from: 0x00000000, to: props.bottomRuleTo ?? 0xffffff08, angle: 0 }} opacity={props.bottomRuleOpacity ?? 0.8} />
    </box>
  )
}

export function PanelHeader(props: { title: string; subtitle?: string; accent?: number; dragProps?: Record<string, unknown>; actions?: JSX.Element }) {
  return (
    <box {...(props.dragProps ?? {})} direction="column" gap={space[2]} width="grow">
      <box direction="row" alignY="center" width="grow">
        <text color={colors.textSoft} fontSize={12}>{props.title}</text>
        <box width="grow" />
        {props.actions ?? (
          <box direction="row" gap={space[1]}>
            <ToolIcon label="◻" />
            <ToolIcon label="✕" />
          </box>
        )}
      </box>
      <box width="grow" height={1} gradient={{ type: "linear", from: 0xffffff06, to: props.accent ?? colors.warmLine, angle: 0 }} />
      {props.subtitle ? <text color={colors.textDim} fontSize={9}>{props.subtitle}</text> : null}
    </box>
  )
}

export type PanelDragPosition = { x: number; y: number }

export type PanelProps = {
  title: string
  subtitle?: string
  accent?: number
  x: number
  y: number
  width: number
  zIndex?: number
  debugName?: string
  children: JSX.Element
  gradient?: Gradient
  shadow?: Shadow
  borderColor?: number
  headerActions?: JSX.Element
  onDragStart?: (event: NodeMouseEvent, position: PanelDragPosition) => void
  onDragMove?: (event: NodeMouseEvent, position: PanelDragPosition) => void
  onDragEnd?: (event: NodeMouseEvent, position: PanelDragPosition) => void
}

export function Panel(props: PanelProps) {
  const interaction = useInteractionLayer()
  const [offsetX, setOffsetX] = createSignal(props.x)
  const [offsetY, setOffsetY] = createSignal(props.y)
  let anchorX = 0
  let anchorY = 0

  const { dragProps } = useDrag({
    interaction,
    onDragStart: (event) => {
      anchorX = event.nodeX
      anchorY = event.nodeY
      props.onDragStart?.(event, { x: offsetX(), y: offsetY() })
    },
    onDrag: (event) => {
      const nextX = Math.round(event.x - anchorX)
      const nextY = Math.round(event.y - anchorY)
      setOffsetX(nextX)
      setOffsetY(nextY)
      markDirty()
      props.onDragMove?.(event, { x: nextX, y: nextY })
    },
    onDragEnd: (event) => {
      props.onDragEnd?.(event, { x: offsetX(), y: offsetY() })
    },
  })

  return (
    <box
      ref={interaction.ref}
      layer
      debugName={props.debugName ?? `panel:${props.title}`}
      interactionMode={interaction.mode() === "none" ? undefined : interaction.mode()}
      floating="root"
      floatOffset={{ x: offsetX(), y: offsetY() }}
      zIndex={props.zIndex ?? 10}
      width={props.width}
      backgroundColor={colors.panel}
      gradient={props.gradient}
      borderColor={props.borderColor ?? (props.accent === colors.blueSoft ? colors.panelBorderCool : colors.panelBorder)}
      borderWidth={1}
      cornerRadius={12}
      shadow={props.shadow}
      padding={space[3]}
      direction="column"
      gap={space[3]}
    >
      <PanelHeader title={props.title} subtitle={props.subtitle} accent={props.accent} dragProps={dragProps as unknown as Record<string, unknown>} actions={props.headerActions} />
      <Rule />
      <box width="grow" direction="column" gap={space[3]} padding={space[1]}>
        {props.children}
      </box>
    </box>
  )
}
