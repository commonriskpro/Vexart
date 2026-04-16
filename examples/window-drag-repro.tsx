import { createSignal } from "solid-js"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { markDirty, mount, onInput, useDrag, type NodeMouseEvent } from "@tge/renderer"

const REPRO_CONFIG = {
  PARTIAL_UPDATES: process.env.TGE_REPRO_PARTIAL_UPDATES === "1",
  LAYERED: process.env.TGE_REPRO_LAYERED !== "0",
  FORCE_LAYER_REPAINT: process.env.TGE_REPRO_FORCE_LAYER_REPAINT === "1",
} as const

function useDraggableBox(initialX: number, initialY: number) {
  const [x, setX] = createSignal(initialX)
  const [y, setY] = createSignal(initialY)
  const [lastEvent, setLastEvent] = createSignal("drag: waiting")
  const [dragCount, setDragCount] = createSignal(0)
  let anchorX = 0
  let anchorY = 0

  const { dragProps, dragging } = useDrag({
    onDragStart: (event: NodeMouseEvent) => {
      anchorX = event.nodeX
      anchorY = event.nodeY
      setLastEvent(`start abs(${Math.round(event.x)},${Math.round(event.y)}) rel(${Math.round(event.nodeX)},${Math.round(event.nodeY)})`)
      markDirty()
    },
    onDrag: (event: NodeMouseEvent) => {
      const nextX = Math.round(event.x - anchorX)
      const nextY = Math.round(event.y - anchorY)
      setX(nextX)
      setY(nextY)
      setDragCount((value) => value + 1)
      setLastEvent(`drag abs(${Math.round(event.x)},${Math.round(event.y)}) rel(${Math.round(event.nodeX)},${Math.round(event.nodeY)}) pos(${nextX},${nextY})`)
      markDirty()
    },
    onDragEnd: (event: NodeMouseEvent) => {
      setLastEvent(`end abs(${Math.round(event.x)},${Math.round(event.y)}) pos(${x()},${y()})`)
      markDirty()
    },
  })

  return {
    x,
    y,
    dragging,
    dragCount,
    lastEvent,
    dragProps,
  }
}

function App() {
  const drag = useDraggableBox(180, 180)
  const [mouseLine, setMouseLine] = createSignal("mouse: waiting")
  const [mouseCounts, setMouseCounts] = createSignal({ press: 0, move: 0, release: 0 })

  onInput((event) => {
    if (event.type !== "mouse") return
    setMouseLine(`mouse ${event.action} b=${String(event.button)} x=${String(event.x)} y=${String(event.y)}`)
    setMouseCounts((current) => ({
      press: current.press + (event.action === "press" ? 1 : 0),
      move: current.move + (event.action === "move" ? 1 : 0),
      release: current.release + (event.action === "release" ? 1 : 0),
    }))
  })

  return (
    <box width="100%" height="100%" backgroundColor={0x05070bff}>
      <box
        floating="root"
        floatOffset={{ x: 24, y: 24 }}
        zIndex={10}
        width={360}
        padding={12}
        gap={6}
        backgroundColor={0x10131af2}
        borderColor={0xffffff18}
        borderWidth={1}
        cornerRadius={10}
      >
        <text color={0xf5f7fbff} fontSize={14}>Window Drag Repro</text>
        <text color={0x9ea6b5ff} fontSize={11}>Rectángulo flotante mínimo para aislar drag del renderer.</text>
        <text color={0x9ea6b5ff} fontSize={10}>{`partialUpdates=${String(REPRO_CONFIG.PARTIAL_UPDATES)} layered=${String(REPRO_CONFIG.LAYERED)} forceLayerRepaint=${String(REPRO_CONFIG.FORCE_LAYER_REPAINT)}`}</text>
        <text color={0x7fd0f7ff} fontSize={10}>{mouseLine()}</text>
        <text color={0x9ea6b5ff} fontSize={10}>{`press=${String(mouseCounts().press)} move=${String(mouseCounts().move)} release=${String(mouseCounts().release)}`}</text>
        <text color={0xf3bf6bff} fontSize={10}>{drag.lastEvent()}</text>
        <text color={0x9bd198ff} fontSize={10}>{`dragging=${drag.dragging() ? "yes" : "no"} count=${String(drag.dragCount())} pos=(${String(drag.x())},${String(drag.y())})`}</text>
        <text color={0x9ea6b5ff} fontSize={10}>Arrastrá el panel brillante del centro. q para salir.</text>
      </box>

      <box
        {...drag.dragProps}
        debugName="drag-target"
        layer={REPRO_CONFIG.LAYERED}
        floating="root"
        focusable
        onPress={() => markDirty()}
        floatOffset={{ x: drag.x(), y: drag.y() }}
        zIndex={30}
        width={420}
        padding={16}
        gap={10}
        backgroundColor={0x162033ff}
        borderColor={drag.dragging() ? 0x5cc8ffff : 0x4b5563ff}
        borderWidth={2}
        cornerRadius={12}
        shadow={{ x: 0, y: 18, blur: 28, color: 0x00000040 }}
      >
        <box direction="row" alignY="center" width="grow" paddingY={2}>
          <text color={0xf5f7fbff} fontSize={14}>Drag target</text>
          <box width="grow" />
          <text color={drag.dragging() ? 0x9bd198ff : 0x9ea6b5ff} fontSize={10}>{drag.dragging() ? "dragging" : "idle"}</text>
        </box>
        <box width="grow" height={1} backgroundColor={0x5cc8ffff} opacity={0.8} />
        <text color={0xdbe4f0ff} fontSize={12}>Este mismo nodo recibe el drag y cambia su `floatOffset`.</text>
        <text color={0x9ea6b5ff} fontSize={11}>{`x=${String(drag.x())} y=${String(drag.y())}`}</text>
        <box width="grow" height={120} backgroundColor={0x0b1220ff} borderColor={0xffffff10} borderWidth={1} cornerRadius={8} />
      </box>
    </box>
  )
}

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term, {
    maxFps: 60,
    experimental: {
      partialUpdates: REPRO_CONFIG.PARTIAL_UPDATES,
      forceLayerRepaint: REPRO_CONFIG.FORCE_LAYER_REPAINT,
    },
  })

  const parser = createParser((event) => {
    if (event.type !== "key") return
    if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
      parser.destroy()
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
