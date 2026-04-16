import { createSignal, onCleanup } from "solid-js"
import { mount, onInput, useTerminalDimensions } from "@tge/renderer"
import {
  Box,
  Button,
  Desktop,
  Taskbar,
  Text,
  WindowHeader,
  WindowHost,
  createWindowManager,
  useWindowList,
  useWindowManagerContext,
  type WindowManagerState,
  type WindowOpenInput,
} from "@tge/components"
import { createTerminal, type Terminal } from "@tge/terminal"
import { colors, radius, space } from "@tge/void"

const DEMO_WINDOW_ID = {
  EXPLORER: "explorer",
  INSPECTOR: "inspector",
  CONSOLE: "console",
} as const

type DemoWindowId = (typeof DEMO_WINDOW_ID)[keyof typeof DEMO_WINDOW_ID]

function createWindowInput(id: DemoWindowId): WindowOpenInput {
  if (id === DEMO_WINDOW_ID.EXPLORER) {
    return {
      id,
      kind: id,
      title: "Project Explorer",
      bounds: { x: 42, y: 220, width: 360, height: 300 },
    }
  }

  if (id === DEMO_WINDOW_ID.INSPECTOR) {
    return {
      id,
      kind: id,
      title: "Window Inspector",
      bounds: { x: 470, y: 84, width: 360, height: 280 },
    }
  }

  return {
    id,
    kind: id,
    title: "Activity Console",
    bounds: { x: 250, y: 390, width: 620, height: 230 },
  }
}

function createDemoWindowManager() {
  return createWindowManager({
    initialWindows: [
      createWindowInput(DEMO_WINDOW_ID.EXPLORER),
      createWindowInput(DEMO_WINDOW_ID.INSPECTOR),
      createWindowInput(DEMO_WINDOW_ID.CONSOLE),
    ],
  })
}

const manager = createDemoWindowManager()

function describeWindowEvents(previous: WindowManagerState, next: WindowManagerState): string[] {
  const lines: string[] = []

  const previousIds = Object.keys(previous.windowsById)
  const nextIds = Object.keys(next.windowsById)

  nextIds.forEach((id) => {
    if (previous.windowsById[id]) return
    lines.push(`opened ${next.windowsById[id].title}`)
  })

  previousIds.forEach((id) => {
    if (next.windowsById[id]) return
    lines.push(`closed ${previous.windowsById[id].title}`)
  })

  if (previous.focusedWindowId !== next.focusedWindowId && next.focusedWindowId) {
    const focused = next.windowsById[next.focusedWindowId]
    if (focused) lines.push(`focus → ${focused.title}`)
  }

  nextIds.forEach((id) => {
    const current = next.windowsById[id]
    const previousWindow = previous.windowsById[id]
    if (!current || !previousWindow) return
    if (current.status === previousWindow.status) return
    lines.push(`${current.title} → ${current.status}`)
  })

  nextIds.forEach((id) => {
    const current = next.windowsById[id]
    const previousWindow = previous.windowsById[id]
    if (!current || !previousWindow) return
    const moved = current.bounds.x !== previousWindow.bounds.x || current.bounds.y !== previousWindow.bounds.y
    const resized = current.bounds.width !== previousWindow.bounds.width || current.bounds.height !== previousWindow.bounds.height
    if (moved) {
      lines.push(`${current.title} moved → (${String(current.bounds.x)}, ${String(current.bounds.y)})`)
    }
    if (resized) {
      lines.push(`${current.title} resized → ${String(current.bounds.width)}×${String(current.bounds.height)}`)
    }
  })

  const previousOrder = previous.order.join(" > ")
  const nextOrder = next.order.join(" > ")
  if (previousOrder !== nextOrder) {
    lines.push(`stack → ${nextOrder}`)
  }

  return lines
}

function MouseDebugOverlay(props: { terminal: Terminal }) {
  const [lastMouse, setLastMouse] = createSignal("mouse: waiting")
  const [counts, setCounts] = createSignal({ press: 0, move: 0, release: 0, scroll: 0 })

  const unsubscribe = onInput((event) => {
    if (event.type !== "mouse") return
    setLastMouse(`mouse: ${event.action} b=${String(event.button)} x=${String(event.x)} y=${String(event.y)}`)
    setCounts((current) => ({
      press: current.press + (event.action === "press" ? 1 : 0),
      move: current.move + (event.action === "move" ? 1 : 0),
      release: current.release + (event.action === "release" ? 1 : 0),
      scroll: current.scroll + (event.action === "scroll" ? 1 : 0),
    }))
  })

  onCleanup(() => unsubscribe())

  return (
    <box
      layer
      floating="root"
      floatOffset={{ x: Math.max(0, props.terminal.size.pixelWidth - 320), y: 18 }}
      zIndex={1600}
      width={300}
      direction="column"
      gap={4}
      padding={10}
      backgroundColor={0x10131af0}
      borderColor={0xffffff14}
      borderWidth={1}
      cornerRadius={10}
      shadow={{ x: 0, y: 10, blur: 24, color: 0x00000030 }}
    >
      <Text color={colors.foreground} fontSize={12}>Input probe</Text>
      <Text color={colors.mutedForeground} fontSize={10}>{`renderer=gpu? ${process.env.TGE_RENDERER_BACKEND === "gpu" ? "yes" : "no"}`}</Text>
      <Text color={colors.mutedForeground} fontSize={10}>{`kittyGraphics=${String(props.terminal.caps.kittyGraphics)} transport=${props.terminal.caps.transmissionMode}`}</Text>
      <Text color={0x7fd0f7ff} fontSize={10}>{lastMouse()}</Text>
      <Text color={colors.mutedForeground} fontSize={10}>{`press=${String(counts().press)} move=${String(counts().move)} release=${String(counts().release)} scroll=${String(counts().scroll)}`}</Text>
    </box>
  )
}

function HeaderDebugOverlay(props: { lines: () => string[] }) {
  return (
    <box
      layer
      floating="root"
      floatOffset={{ x: 980, y: 150 }}
      zIndex={1600}
      width={300}
      direction="column"
      gap={4}
      padding={10}
      backgroundColor={0x10131af0}
      borderColor={0xffffff14}
      borderWidth={1}
      cornerRadius={10}
      shadow={{ x: 0, y: 10, blur: 24, color: 0x00000030 }}
    >
      <Text color={colors.foreground} fontSize={12}>Header probe</Text>
      {props.lines().map((line) => (
        <Text color={0x7fd0f7ff} fontSize={10}>{line}</Text>
      ))}
    </box>
  )
}

function DragDebugOverlay(props: { lines: () => string[] }) {
  return (
    <box
      layer
      floating="root"
      floatOffset={{ x: 980, y: 390 }}
      zIndex={1600}
      width={360}
      direction="column"
      gap={4}
      padding={10}
      backgroundColor={0x10131af0}
      borderColor={0xffffff14}
      borderWidth={1}
      cornerRadius={10}
      shadow={{ x: 0, y: 10, blur: 24, color: 0x00000030 }}
    >
      <Text color={colors.foreground} fontSize={12}>Drag core probe</Text>
      {props.lines().map((line) => (
        <Text color={0xf3bf6bff} fontSize={10}>{line}</Text>
      ))}
    </box>
  )
}

function LaunchButton(props: { label: string; hint: string; onPress: () => void }) {
  return (
    <Button
      onPress={props.onPress}
      renderButton={(button) => (
        <box
          {...button.buttonProps}
          direction="column"
          gap={2}
          paddingX={12}
          paddingY={10}
          backgroundColor={button.focused ? 0xffffff12 : 0xffffff08}
          borderColor={0xffffff14}
          borderWidth={1}
          cornerRadius={8}
        >
          <Text color={colors.foreground} fontSize={12}>{props.label}</Text>
          <Text color={colors.mutedForeground} fontSize={10}>{props.hint}</Text>
        </box>
      )}
    />
  )
}

function WorkspaceLauncher() {
  const context = useWindowManagerContext()

  function openOrFocus(id: DemoWindowId) {
    const existing = context.getWindow(id)
    if (!existing) {
      context.openWindow(createWindowInput(id))
      return
    }
    if (existing.status === "minimized") {
      context.restoreWindow(id)
      return
    }
    context.focusWindow(id)
  }

  return (
    <box
      layer
      floating="root"
      floatOffset={{ x: 18, y: 18 }}
      zIndex={1500}
      width={300}
      direction="column"
      gap={space[3]}
      padding={space[4]}
      backgroundColor={0x10131af0}
      borderColor={0xffffff14}
      borderWidth={1}
      cornerRadius={radius.xl}
      shadow={{ x: 0, y: 10, blur: 24, color: 0x00000030 }}
    >
      <Text color={colors.foreground} fontSize={15}>TGE Windowing Demo</Text>
      <Text color={colors.mutedForeground} fontSize={11}>
        Demo integrado para validar drag, foco, taskbar y lifecycle de ventanas.
      </Text>

      <box direction="column" gap={space[2]}>
        <LaunchButton label="Explorer" hint="Abrir o enfocar" onPress={() => openOrFocus(DEMO_WINDOW_ID.EXPLORER)} />
        <LaunchButton label="Inspector" hint="Estado vivo del manager" onPress={() => openOrFocus(DEMO_WINDOW_ID.INSPECTOR)} />
        <LaunchButton label="Console" hint="Eventos de windowing" onPress={() => openOrFocus(DEMO_WINDOW_ID.CONSOLE)} />
      </box>

      <box direction="column" gap={2}>
        <Text color={colors.mutedForeground} fontSize={10}>• Arrastrá las ventanas desde el header</Text>
        <Text color={colors.mutedForeground} fontSize={10}>• Minimizá/restaurá desde header o taskbar</Text>
        <Text color={colors.mutedForeground} fontSize={10}>• Maximizá para validar workspace reservado</Text>
        <Text color={colors.mutedForeground} fontSize={10}>• Mirá el panel Input probe para confirmar press/move/release</Text>
        <Text color={colors.mutedForeground} fontSize={10}>• q o Ctrl+C para salir</Text>
      </box>
    </box>
  )
}

function ExplorerWindowContent() {
  const files = [
    "packages/windowing/src/manager.ts",
    "packages/windowing/src/context.tsx",
    "packages/windowing/src/window-frame.tsx",
    "packages/windowing/src/taskbar.tsx",
    "examples/windowing-demo.tsx",
  ]

  return (
    <box width="grow" height="grow" direction="column" gap={space[2]}>
      <Text color={colors.mutedForeground} fontSize={11}>Arquitectura actual del sistema</Text>
      <box direction="column" gap={space[1]}>
        {files.map((file) => (
          <box paddingX={8} paddingY={6} backgroundColor={0xffffff06} cornerRadius={6}>
            <Text color={colors.foreground} fontSize={11}>{file}</Text>
          </box>
        ))}
      </box>
    </box>
  )
}

function InspectorWindowContent() {
  const context = useWindowManagerContext()
  const windows = useWindowList()

  const openCount = () => windows().length
  const minimizedCount = () => windows().filter((window) => window.status === "minimized").length

  return (
    <box width="grow" height="grow" direction="column" gap={space[2]}>
      <box direction="row" gap={space[2]}>
        <Box padding={space[2]} backgroundColor={0xffffff08} cornerRadius={radius.lg}>
          <Text color={colors.foreground} fontSize={11}>{`open: ${String(openCount())}`}</Text>
        </Box>
        <Box padding={space[2]} backgroundColor={0xffffff08} cornerRadius={radius.lg}>
          <Text color={colors.foreground} fontSize={11}>{`minimized: ${String(minimizedCount())}`}</Text>
        </Box>
      </box>

      <Text color={colors.mutedForeground} fontSize={11}>{`focused: ${context.focusedWindowId() ?? "none"}`}</Text>

      <box width="grow" height="grow" direction="column" gap={space[1]}>
        {windows().map((window) => (
          <box direction="row" gap={space[2]} paddingX={8} paddingY={6} backgroundColor={window.focused ? 0xffffff10 : 0xffffff06} cornerRadius={6}>
            <Text color={colors.foreground} fontSize={11}>{window.title}</Text>
            <Text color={colors.mutedForeground} fontSize={11}>{window.status}</Text>
            <Text color={colors.mutedForeground} fontSize={11}>{`z:${String(window.zIndex)}`}</Text>
          </box>
        ))}
      </box>
    </box>
  )
}

function ConsoleWindowContent() {
  const context = useWindowManagerContext()
  const [lines, setLines] = createSignal<string[]>([
    "window manager ready",
    "drag, focus, minimize y restore generan eventos acá",
  ])

  let previous = context.state()
  const unsubscribe = context.manager.subscribe((next) => {
    const events = describeWindowEvents(previous, next)
    previous = next
    if (events.length === 0) return
    setLines((current) => events.concat(current).slice(0, 10))
  })

  onCleanup(() => unsubscribe())

  return (
    <box width="grow" height="grow" scrollY direction="column" gap={space[1]}>
      {lines().map((line) => (
        <box paddingX={8} paddingY={5} backgroundColor={0x0b0d12ff} cornerRadius={6}>
          <Text color={0x7fd0f7ff} fontSize={11}>{line}</Text>
        </box>
      ))}
    </box>
  )
}

function renderWindowContent(id: DemoWindowId) {
  if (id === DEMO_WINDOW_ID.EXPLORER) return <ExplorerWindowContent />
  if (id === DEMO_WINDOW_ID.INSPECTOR) return <InspectorWindowContent />
  return <ConsoleWindowContent />
}

function renderWindowSubtitle(id: DemoWindowId): string {
  if (id === DEMO_WINDOW_ID.EXPLORER) return "fake file tree"
  if (id === DEMO_WINDOW_ID.INSPECTOR) return "live manager snapshot"
  return "window lifecycle events"
}

function App(props: { terminal: Terminal }) {
  const dims = useTerminalDimensions(props.terminal)
  const [headerLines, setHeaderLines] = createSignal<string[]>(["header: waiting"])
  const [dragLines, setDragLines] = createSignal<string[]>(["drag: waiting"])
  const workspace = () => ({
    x: 0,
    y: 0,
    width: dims.width(),
    height: dims.height(),
  })

  function pushHeaderLine(line: string) {
    setHeaderLines((current) => [line].concat(current).slice(0, 8))
  }

  function pushDragLine(line: string) {
    setDragLines((current) => [line].concat(current).slice(0, 10))
  }

  return (
    <Desktop
      manager={manager}
      workspace={workspace}
      taskbarHeight={46}
      backgroundColor={colors.background}
      renderTaskbar={(taskbar) => (
        <Taskbar
          floating
          bounds={taskbar.bounds}
          height={taskbar.bounds?.height ?? 46}
          emptyState={<Text color={colors.mutedForeground} fontSize={11}>No windows open</Text>}
        />
      )}
      renderWindow={(window) => (
        <WindowHost
          windowId={window.id}
          layer={false}
          borderWidth={2}
          activeBackgroundColor={0x162033ff}
          inactiveBackgroundColor={0x111827ff}
          activeBorderColor={0x5cc8ffff}
          inactiveBorderColor={0x4b5563ff}
          contentPadding={14}
          onDragDebugEvent={pushDragLine}
          renderHeader={(currentWindow, header) => (
            <WindowHeader
              windowId={currentWindow.id}
              subtitle={renderWindowSubtitle(currentWindow.id as DemoWindowId)}
              dragHandleProps={header.dragHandleProps}
              activeBackgroundColor={0x1f2a44ff}
              inactiveBackgroundColor={0x182235ff}
              borderColor={0x5cc8ffff}
              onMouseDown={(event) => pushHeaderLine(`${currentWindow.id}: down x=${String(Math.round(event.x))} y=${String(Math.round(event.y))}`)}
              onMouseMove={(event) => pushHeaderLine(`${currentWindow.id}: move x=${String(Math.round(event.x))} y=${String(Math.round(event.y))}`)}
              onMouseUp={(event) => pushHeaderLine(`${currentWindow.id}: up x=${String(Math.round(event.x))} y=${String(Math.round(event.y))}`)}
            />
          )}
          renderContent={() => renderWindowContent(window.id as DemoWindowId)}
        />
      )}
    >
      <WorkspaceLauncher />
      <MouseDebugOverlay terminal={props.terminal} />
      <HeaderDebugOverlay lines={headerLines} />
      <DragDebugOverlay lines={dragLines} />
    </Desktop>
  )
}

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term, {
    maxFps: 60,
    experimental: {
      partialUpdates: false,
      forceLayerRepaint: false,
    },
  })

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
