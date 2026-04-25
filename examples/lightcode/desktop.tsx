import { For, Show, type JSX } from "solid-js"
import { appendFileSync } from "node:fs"
import { markDirty, setPointerCapture, releasePointerCapture, useDrag, type NodeMouseEvent } from "@vexart/engine"
import { useRouter } from "@vexart/app"
import {
  LIGHTCODE_OS_RESIZE_EDGE,
  LIGHTCODE_OS_WINDOW_STATE,
  type LightcodeOsResizeEdge,
  type LightcodeOsWindowManager,
  type LightcodeOsWindowSnapshot,
  type LightcodeOsRect,
} from "./window-manager"
import { lightcodeGraphEdges, lightcodeGraphNodes, lightcodeStars, lightcodeTheme } from "./theme"

type Point = { x: number; y: number }

const DRAG_LOG = "/tmp/lightcode-drag.log"
let activeWindowDrag: { windowId: string; origin: LightcodeOsRect; pointer: Point; nodeId: number } | null = null

function logDrag(message: string) {
  if (process.env.LIGHTCODE_DRAG_DEBUG !== "1") return
  appendFileSync(DRAG_LOG, `${Date.now()} ${message}\n`)
}

function px(value: number) {
  return Math.round(value)
}

function windowRoute(id: string) {
  return `/window/${encodeURIComponent(id)}`
}

function graphPoint(id: string, width: number, height: number): Point {
  const node = lightcodeGraphNodes.find((item) => item.id === id) ?? lightcodeGraphNodes[0]
  return { x: px((node.x / 100) * width), y: px((node.y / 100) * height) }
}

function Edge(props: { from: Point; to: Point; hot?: boolean }) {
  const dx = props.to.x - props.from.x
  const dy = props.to.y - props.from.y
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  return (
    <box
      floating="parent"
      floatOffset={{ x: props.from.x, y: props.from.y }}
      width={px(length)}
      height={props.hot ? 2 : 1}
      backgroundColor={props.hot ? 0xf6c76fbb : 0x8fb7e066}
      opacity={props.hot ? 1 : 0.72}
      transform={{ rotate: angle }}
      transformOrigin="top-left"
    />
  )
}

function Starfield(props: { width: number; height: number }) {
  return (
    <>
      <image src="examples/nebula.jpg" objectFit="cover" width={props.width} height={props.height} opacity={0.58} />
      <box floating="parent" floatOffset={{ x: 0, y: 0 }} width={props.width} height={props.height} gradient={{ type: "linear", from: 0x020409cc, to: 0x0b1018ee, angle: 150 }} />
      <box floating="parent" floatOffset={{ x: px(props.width * 0.07), y: px(props.height * 0.13) }} width={px(props.width * 0.48)} height={px(props.height * 0.40)} cornerRadius={999} gradient={{ type: "radial", from: 0x7cb7ff77, to: 0x00000000 }} opacity={0.9} />
      <box floating="parent" floatOffset={{ x: px(props.width * 0.34), y: px(props.height * 0.12) }} width={px(props.width * 0.42)} height={px(props.height * 0.36)} cornerRadius={999} gradient={{ type: "radial", from: 0xffb76570, to: 0x00000000 }} opacity={0.9} />
      <box floating="parent" floatOffset={{ x: px(props.width * 0.48), y: px(props.height * 0.38) }} width={px(props.width * 0.45)} height={px(props.height * 0.34)} cornerRadius={999} gradient={{ type: "radial", from: 0xaac8ff44, to: 0x00000000 }} opacity={0.85} />
      <For each={lightcodeStars}>
        {(star) => (
          <box
            floating="parent"
            floatOffset={{ x: px((star[0] / 100) * props.width), y: px((star[1] / 100) * props.height) }}
            width={star[2]}
            height={star[2]}
            cornerRadius={999}
            backgroundColor={star[3]}
          />
        )}
      </For>
    </>
  )
}

function GraphBackground(props: { width: number; height: number }) {
  return (
    <box floating="parent" floatOffset={{ x: 0, y: 0 }} width={props.width} height={props.height} backgroundColor={0x00000001}>
      <For each={lightcodeGraphEdges}>
        {(edge) => {
          const from = graphPoint(edge[0], props.width, props.height)
          const to = graphPoint(edge[1], props.width, props.height)
          return <Edge from={from} to={to} hot={edge[0] === "shader" || edge[1] === "shader"} />
        }}
      </For>
      <For each={lightcodeGraphNodes}>
        {(node) => {
          const hot = "hot" in node && node.hot === true
          const x = px((node.x / 100) * props.width)
          const y = px((node.y / 100) * props.height)
          const width = hot ? 150 : 112
          const height = hot ? 42 : 30
          return (
            <box
              floating="parent"
              floatOffset={{ x: x - width / 2, y: y - height / 2 }}
              width={width}
              height={height}
              alignX="center"
              alignY="center"
              cornerRadius={hot ? 12 : 9}
              backgroundColor={hot ? 0x7b4a18dd : 0x111a24d8}
              borderColor={hot ? 0xfff0b8cc : 0xbdd9f077}
              borderWidth={1}
              glow={hot ? lightcodeTheme.shadow.glow : lightcodeTheme.shadow.blueGlow}
            >
              <text color={hot ? lightcodeTheme.color.gold : lightcodeTheme.color.textSoft} fontSize={hot ? 12 : 10}>{node.label}</text>
            </box>
          )
        }}
      </For>
      <box floating="parent" floatOffset={{ x: px(props.width * 0.37), y: px(props.height * 0.48) }} width={220} height={44} cornerRadius={8} backgroundColor={0x4d321ccf} borderColor={0xffc96a88} borderWidth={1} padding={8} shadow={lightcodeTheme.shadow.soft}>
        <text color={lightcodeTheme.color.gold} fontSize={12}>Task: compute_shader_pipeline</text>
        <text color={lightcodeTheme.color.textSoft} fontSize={10}>type: compute / status: hot path</text>
      </box>
    </box>
  )
}

function ChromeButton(props: { label: string; color?: number; onPress: () => void }) {
  return (
    <box
      width={24}
      height={20}
      cornerRadius={6}
      alignX="center"
      alignY="center"
      backgroundColor={0xffffff0c}
      borderColor={0xffffff12}
      borderWidth={1}
      hoverStyle={{ backgroundColor: 0xffffff22, borderColor: 0xffffff30 }}
      activeStyle={{ backgroundColor: 0xffc96a33 }}
      onPress={(event) => { event?.stopPropagation(); props.onPress() }}
    >
      <text color={props.color ?? lightcodeTheme.color.textSoft} fontSize={11}>{props.label}</text>
    </box>
  )
}

function ResizeHandle(props: { window: LightcodeOsWindowSnapshot; manager: LightcodeOsWindowManager; edge: LightcodeOsResizeEdge; zIndex: number }) {
  let origin: LightcodeOsRect | null = null
  let pointer: Point | null = null
  const drag = useDrag({
    disabled: () => props.window.state !== LIGHTCODE_OS_WINDOW_STATE.NORMAL,
    onDragStart(event) {
      props.manager.focus(props.window.id)
      origin = { ...props.window.rect }
      pointer = { x: event.x, y: event.y }
    },
    onDrag(event) {
      if (!origin || !pointer) return
      const dx = event.x - pointer.x
      const dy = event.y - pointer.y
      const width = props.edge === LIGHTCODE_OS_RESIZE_EDGE.BOTTOM ? origin.width : origin.width + dx
      const height = props.edge === LIGHTCODE_OS_RESIZE_EDGE.RIGHT ? origin.height : origin.height + dy
      props.manager.resizeTo(props.window.id, { ...origin, width, height })
      markDirty()
    },
    onDragEnd() {
      origin = null
      pointer = null
    },
  })

  const right = props.edge === LIGHTCODE_OS_RESIZE_EDGE.RIGHT
  const bottom = props.edge === LIGHTCODE_OS_RESIZE_EDGE.BOTTOM
  const corner = props.edge === LIGHTCODE_OS_RESIZE_EDGE.BOTTOM_RIGHT
  return (
    <box
      {...drag.dragProps}
      floating="parent"
      floatOffset={{ x: right ? props.window.rect.width - 10 : corner ? props.window.rect.width - 16 : 0, y: bottom ? props.window.rect.height - 10 : corner ? props.window.rect.height - 16 : 0 }}
      zIndex={props.zIndex}
      width={right ? 10 : corner ? 16 : props.window.rect.width}
      height={bottom ? 10 : corner ? 16 : props.window.rect.height}
      backgroundColor={corner ? 0xffc96a22 : 0x00000001}
      cornerRadius={corner ? 5 : 0}
    />
  )
}

function Titlebar(props: { window: LightcodeOsWindowSnapshot; manager: LightcodeOsWindowManager; zIndex: number }) {
  return (
    <box
      width={props.window.rect.width}
      height={lightcodeTheme.space.chrome}
      floating="parent"
      floatOffset={{ x: 0, y: 0 }}
      zIndex={props.zIndex}
    >
      <box
        floating="parent"
        floatOffset={{ x: 0, y: 0 }}
        zIndex={0}
        width={props.window.rect.width}
        height={lightcodeTheme.space.chrome}
        gradient={props.window.active ? lightcodeTheme.gradient.activeTitlebar : lightcodeTheme.gradient.titlebar}
        borderBottom={1}
        borderColor={0xffffff16}
      />
      <box
        floating="parent"
        floatOffset={{ x: 0, y: 0 }}
        zIndex={1}
        width={props.window.rect.width}
        height={lightcodeTheme.space.chrome}
        direction="row"
        alignY="center"
        alignX="space-between"
        paddingX={10}
      >
        <box direction="row" alignY="center" gap={7}>
          <box width={18} height={18} cornerRadius={5} backgroundColor={props.window.active ? lightcodeTheme.color.gold : 0xffffff18} borderColor={0xffffff28} borderWidth={1} />
          <box width={260} direction="column" gap={0}>
            <text color={props.window.active ? lightcodeTheme.color.text : lightcodeTheme.color.textSoft} fontSize={12}>{props.window.title}</text>
            <text color={lightcodeTheme.color.muted} fontSize={9}>{props.window.subtitle}</text>
          </box>
        </box>
        <box direction="row" gap={5}>
          <ChromeButton label="-" onPress={() => props.manager.minimize(props.window.id)} />
          <ChromeButton label={props.window.state === LIGHTCODE_OS_WINDOW_STATE.MAXIMIZED ? "<>" : "[]"} onPress={() => props.manager.toggleMaximize(props.window.id)} />
          <ChromeButton label="x" color={lightcodeTheme.color.red} onPress={() => props.manager.close(props.window.id)} />
        </box>
      </box>
    </box>
  )
}

function WindowSurface(props: { window: LightcodeOsWindowSnapshot; zIndex: number }) {
  return (
    <box
      floating="parent"
      floatOffset={{ x: 0, y: 0 }}
      zIndex={props.zIndex}
      width={props.window.rect.width}
      height={props.window.rect.height}
      cornerRadius={lightcodeTheme.space.radius}
      backgroundColor={props.window.active ? lightcodeTheme.color.panel : lightcodeTheme.color.panelSoft}
      borderColor={props.window.active ? lightcodeTheme.color.borderStrong : lightcodeTheme.color.border}
      borderWidth={1}
      shadow={[{ x: 0, y: 18, blur: 34, color: 0x000000aa }, { x: 0, y: 0, blur: 18, color: 0xd8953540 }]}
      backdropBlur={8}
    />
  )
}

function WindowFocusHitArea(props: { window: LightcodeOsWindowSnapshot; manager: LightcodeOsWindowManager; zIndex: number }) {
  const router = useRouter()

  return (
    <box
      floating="parent"
      floatOffset={{ x: 0, y: 0 }}
      zIndex={props.zIndex}
      width={props.window.rect.width}
      height={props.window.rect.height}
      backgroundColor={0x00000001}
      onPress={() => {
        props.manager.focus(props.window.id)
        router.replace(windowRoute(props.window.id), { focusId: null })
      }}
    />
  )
}

function WindowDragHandle(props: { window: LightcodeOsWindowSnapshot; manager: LightcodeOsWindowManager; zIndex: number }) {
  let nodeId = 0

  function start(event: NodeMouseEvent) {
    logDrag(`down id=${props.window.id} x=${event.x} y=${event.y} node=${event.nodeX},${event.nodeY}`)
    if (props.window.state === LIGHTCODE_OS_WINDOW_STATE.MAXIMIZED) return
    activeWindowDrag = {
      windowId: props.window.id,
      origin: { ...props.window.rect },
      pointer: { x: event.x, y: event.y },
      nodeId,
    }
    props.manager.focus(props.window.id)
    if (nodeId) setPointerCapture(nodeId)
    markDirty()
  }

  function move(event: NodeMouseEvent) {
    const drag = activeWindowDrag
    if (!drag || drag.windowId !== props.window.id) return
    logDrag(`move id=${props.window.id} x=${event.x} y=${event.y} dx=${event.x - drag.pointer.x} dy=${event.y - drag.pointer.y}`)
    props.manager.moveTo(props.window.id, { ...drag.origin, x: drag.origin.x + event.x - drag.pointer.x, y: drag.origin.y + event.y - drag.pointer.y })
    markDirty()
  }

  function end() {
    const drag = activeWindowDrag
    logDrag(`up id=${props.window.id} dragging=${drag?.windowId === props.window.id}`)
    if (!drag || drag.windowId !== props.window.id) return
    if (drag.nodeId) releasePointerCapture(drag.nodeId)
    activeWindowDrag = null
    markDirty()
  }

  return (
    <box
      ref={(handle) => { nodeId = handle.id }}
      floating="parent"
      floatOffset={{ x: 0, y: 0 }}
      zIndex={props.zIndex}
      width={Math.max(64, props.window.rect.width - 112)}
      height={lightcodeTheme.space.chrome}
      backgroundColor={0x00000001}
      onMouseDown={start}
      onMouseMove={move}
      onMouseUp={end}
    />
  )
}

export function LightcodeOsWindowFrame(props: { window: LightcodeOsWindowSnapshot; manager: LightcodeOsWindowManager; children: JSX.Element }) {
  const z = () => props.window.stackIndex * 100

  return (
    <box
      floating="parent"
      floatOffset={{ x: props.window.rect.x, y: props.window.rect.y }}
      width={props.window.rect.width}
      height={props.window.rect.height}
    >
      <WindowSurface window={props.window} zIndex={z()} />
      <WindowFocusHitArea window={props.window} manager={props.manager} zIndex={z() + 5} />
      <Titlebar window={props.window} manager={props.manager} zIndex={z() + 20} />
      <box
        floating="parent"
        floatOffset={{ x: 0, y: lightcodeTheme.space.chrome }}
        zIndex={z() + 10}
        width={props.window.rect.width}
        height={Math.max(0, props.window.rect.height - lightcodeTheme.space.chrome)}
        padding={10}
      >
        {props.children}
      </box>
      <WindowDragHandle window={props.window} manager={props.manager} zIndex={z() + 30} />
      <ResizeHandle window={props.window} manager={props.manager} edge={LIGHTCODE_OS_RESIZE_EDGE.RIGHT} zIndex={z() + 40} />
      <ResizeHandle window={props.window} manager={props.manager} edge={LIGHTCODE_OS_RESIZE_EDGE.BOTTOM} zIndex={z() + 40} />
      <ResizeHandle window={props.window} manager={props.manager} edge={LIGHTCODE_OS_RESIZE_EDGE.BOTTOM_RIGHT} zIndex={z() + 40} />
    </box>
  )
}

function Topbar(props: { width: number }) {
  return (
    <box floating="parent" floatOffset={{ x: 22, y: 18 }} width={Math.max(420, props.width - 44)} height={34} direction="row" alignY="center" alignX="space-between" paddingX={10} cornerRadius={10} backgroundColor={0x05070c99} borderColor={0xffffff18} borderWidth={1} backdropBlur={10}>
      <box direction="row" alignY="center" gap={8}>
        <text color={lightcodeTheme.color.textSoft} fontSize={14}>LC</text>
        <box width={150} height={24} alignX="center" alignY="center" cornerRadius={7} backgroundColor={0xffffff0e} borderColor={0xffffff16} borderWidth={1}>
          <text color={lightcodeTheme.color.text} fontSize={11}>Compute Graph</text>
        </box>
        <box width={120} height={24} alignX="center" alignY="center" cornerRadius={7} backgroundColor={0x00000022}>
          <text color={lightcodeTheme.color.textSoft} fontSize={11}>v_engine.zig</text>
        </box>
      </box>
      <box direction="row" alignY="center" gap={8}>
        <text color={lightcodeTheme.color.muted} fontSize={10}>quality: cinematic</text>
        <box width={9} height={9} cornerRadius={999} backgroundColor={lightcodeTheme.color.green} glow={{ radius: 10, color: lightcodeTheme.color.green, intensity: 24 }} />
      </box>
    </box>
  )
}

function Dock(props: { width: number; height: number; manager: LightcodeOsWindowManager }) {
  const minimized = () => props.manager.minimizedWindows()
  const router = useRouter()

  return (
    <box floating="parent" floatOffset={{ x: 22, y: props.height - lightcodeTheme.space.dock - 16 }} width={Math.max(420, props.width - 44)} height={lightcodeTheme.space.dock} direction="row" alignY="center" alignX="space-between" paddingX={10} cornerRadius={10} backgroundColor={0x05070ccc} borderColor={0xffffff1e} borderWidth={1} backdropBlur={8}>
      <box direction="row" gap={10} alignY="center">
        <box width={22} height={22} cornerRadius={7} alignX="center" alignY="center" gradient={lightcodeTheme.gradient.gold}><text color={0x19110aff} fontSize={12}>*</text></box>
        <text color={lightcodeTheme.color.textSoft} fontSize={11}>L345 C015 | Zig | Lightcode OS</text>
      </box>
      <box direction="row" gap={6} alignY="center">
        <For each={minimized()}>
          {(window) => (
            <box width={110} height={22} cornerRadius={7} alignX="center" alignY="center" backgroundColor={0xffffff0f} borderColor={0xffffff1e} borderWidth={1} hoverStyle={{ backgroundColor: 0xffc96a22 }} onPress={() => { props.manager.restore(window.id); router.push(windowRoute(window.id), { focusId: null }) }}>
              <text color={lightcodeTheme.color.gold} fontSize={10}>{window.title}</text>
            </box>
          )}
        </For>
        <text color={lightcodeTheme.color.muted} fontSize={10}>Lightcode v0.1</text>
      </box>
    </box>
  )
}

export function LightcodeOsDesktop(props: { width: number; height: number; manager: LightcodeOsWindowManager; renderWindow: (window: LightcodeOsWindowSnapshot) => JSX.Element }) {
  const paintIds = () => props.manager.paintWindows().map((window) => window.id)
  const findWindow = (id: string) => props.manager.windows().find((window) => window.id === id)
  return (
    <box width={props.width} height={props.height} backgroundColor={lightcodeTheme.color.void}>
      <Starfield width={props.width} height={props.height} />
      <box floating="parent" floatOffset={{ x: 20, y: 58 }} width={Math.max(200, props.width - 40)} height={Math.max(160, props.height - 96)} cornerRadius={4} borderColor={0xffffff18} borderWidth={1} backgroundColor={0x00000001} />
      <GraphBackground width={props.width} height={props.height} />
      <For each={paintIds()}>
        {(id) => (
          <Show when={findWindow(id)}>
            {(window) => (
              <LightcodeOsWindowFrame window={window()} manager={props.manager}>
                {props.renderWindow(window())}
              </LightcodeOsWindowFrame>
            )}
          </Show>
        )}
      </For>
      <Topbar width={props.width} />
      <Dock width={props.width} height={props.height} manager={props.manager} />
    </box>
  )
}
