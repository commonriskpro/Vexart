import { createSignal, For } from "solid-js"
import { createEffect } from "solid-js"
import { createTerminal } from "@vexart/engine"
import { createParser } from "@vexart/engine"
import { mount, useDrag, markDirty, debugState, setDebug, type NodeMouseEvent, useTerminalDimensions } from "@vexart/engine"
import { appendFileSync } from "node:fs"

const LOG = "/tmp/interaction-latency.log"
const EXIT_AFTER_MS = Number(process.env.TGE_EXIT_AFTER_MS ?? 0)
const LOG_FPS = process.env.TGE_LOG_FPS === "1"

function useDraggable(initialX: number, initialY: number) {
  const [x, setX] = createSignal(initialX)
  const [y, setY] = createSignal(initialY)
  let anchorX = 0
  let anchorY = 0
  const { dragProps } = useDrag({
    onDragStart: (evt: NodeMouseEvent) => {
      anchorX = evt.nodeX
      anchorY = evt.nodeY
    },
    onDrag: (evt: NodeMouseEvent) => {
      setX(Math.round(evt.x - anchorX))
      setY(Math.round(evt.y - anchorY))
      markDirty()
    },
  })
  return { x, y, dragProps }
}

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const drag = useDraggable(40, 40)
  const [selected, setSelected] = createSignal("focus-a")
  const [textValue, setTextValue] = createSignal("")
  const rows = Array.from({ length: 40 }, (_, i) => `Scroll row ${i + 1}`)
  const dims = useTerminalDimensions(props.terminal)

  const handleTyping = (event: any) => {
    if (event.key === "backspace") {
      setTextValue((value) => value.slice(0, -1))
      return
    }
    if (event.key.length === 1) setTextValue((value) => value + event.key)
  }

  let lastLoggedSeq = 0
  createEffect(() => {
    const seq = debugState.presentedInteractionSeq
    if (!seq || seq === lastLoggedSeq) return
    lastLoggedSeq = seq
    appendFileSync(
      LOG,
      `interaction seq=${seq} type=${debugState.interactionType ?? "none"} latency=${debugState.interactionLatencyMs} strategy=${debugState.rendererStrategy ?? "none"} output=${debugState.rendererOutput ?? "none"} tx=${debugState.transmissionMode ?? "none"}\n`,
    )
  })

  return (
    <box width={dims.width()} height={dims.height()} backgroundColor={0x050507ff} padding={16} gap={16}>
      <text color={0xf3ede2ff} fontSize={16}>Interaction Latency Lab</text>
      <text color={0xc6bcaeff} fontSize={12}>Drag, scroll, focus and type. Metrics are written to /tmp/interaction-latency.log.</text>
      <box direction="row" gap={16} height="grow">
        <box width={340} height="grow" borderColor={0xffffff12} borderWidth={1} cornerRadius={10} padding={10} gap={8}>
          <text color={0xf3bf6bff} fontSize={14}>Scroll panel</text>
          <box scrollY height="grow" gap={4} borderColor={0xffffff10} borderWidth={1} cornerRadius={8} padding={8} backgroundColor={0x111217ff}>
            <For each={rows}>{(row, index) => (
              <box height={28} paddingX={8} alignY="center" backgroundColor={index() % 2 === 0 ? 0xffffff06 : 0xffffff03} cornerRadius={6}>
                <text color={0xe8ddd0ff} fontSize={12}>{row}</text>
              </box>
            )}</For>
          </box>
        </box>

        <box width={340} height="grow" borderColor={0xffffff12} borderWidth={1} cornerRadius={10} padding={10} gap={8}>
          <text color={0x90a8d0ff} fontSize={14}>Focus / typing panel</text>
          <box direction="row" gap={8}>
            <box focusable onPress={() => setSelected("focus-a")} padding={10} backgroundColor={selected() === "focus-a" ? 0x2a3344ff : 0x17181cff} cornerRadius={8} focusStyle={{ borderColor: 0x90a8d0ff, borderWidth: 2 }}>
              <text color={0xf3ede2ff}>Focus A</text>
            </box>
            <box focusable onPress={() => setSelected("focus-b")} padding={10} backgroundColor={selected() === "focus-b" ? 0x443322ff : 0x17181cff} cornerRadius={8} focusStyle={{ borderColor: 0xf3bf6bff, borderWidth: 2 }}>
              <text color={0xf3ede2ff}>Focus B</text>
            </box>
          </box>
          <box focusable onKeyDown={handleTyping} padding={12} borderColor={0xffffff16} borderWidth={1} cornerRadius={8} focusStyle={{ borderColor: 0x9bd198ff, borderWidth: 2 }}>
            <text color={0xc6bcaeff} fontSize={12}>Type here:</text>
            <text color={0xf3ede2ff} fontSize={13}>{textValue() || "<empty>"}</text>
          </box>
        </box>
      </box>

      <box floating="root" floatOffset={{ x: drag.x(), y: drag.y() }} zIndex={20} width={280} padding={12} backgroundColor={0x121317f4} borderColor={0xffffff12} borderWidth={1} cornerRadius={10} gap={8} {...drag.dragProps}>
        <text color={0xf3bf6bff} fontSize={14}>Drag panel</text>
        <text color={0xc6bcaeff} fontSize={12}>Drag me around and watch latency update.</text>
        <text color={0x9bd198ff} fontSize={12}>GPU path forced. Use q to exit.</text>
      </box>
    </box>
  )
}

async function main() {
  appendFileSync(LOG, "\n--- interaction latency lab ---\n")
  const term = await createTerminal()
  setDebug(true)
  appendFileSync(LOG, `[main] terminal kitty=${term.caps.kittyGraphics} mode=${term.caps.transmissionMode}\n`)
  const cleanup = mount(() => <App terminal={term} />, term, {
    maxFps: 60,
    experimental: {
      idleMaxFps: 60,
      forceLayerRepaint: false,
      nativeSceneLayout: false,
      nativeRenderGraph: false,
    },
  })

  let perfTimer: ReturnType<typeof setInterval> | null = null
  let exitTimer: ReturnType<typeof setTimeout> | null = null
  if (LOG_FPS) {
    perfTimer = setInterval(() => {
      appendFileSync(LOG, `fps=${debugState.fps} ms=${debugState.frameTimeMs} strategy=${debugState.rendererStrategy ?? "none"} output=${debugState.rendererOutput ?? "none"} tx=${debugState.transmissionMode ?? "none"} input=${debugState.interactionType ?? "none"} latency=${debugState.interactionLatencyMs} resBytes=${debugState.resourceBytes} gpuBytes=${debugState.gpuResourceBytes} entries=${debugState.resourceEntries}\n`)
    }, 300)
  }

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      if (perfTimer) clearInterval(perfTimer)
      if (exitTimer) clearTimeout(exitTimer)
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))

  if (EXIT_AFTER_MS > 0) {
    exitTimer = setTimeout(() => {
      parser.destroy()
      if (perfTimer) clearInterval(perfTimer)
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }, EXIT_AFTER_MS)
  }
}

main().catch((err) => {
  appendFileSync(LOG, `[fatal] ${String((err as Error)?.stack || err)}\n`)
  process.exit(1)
})
