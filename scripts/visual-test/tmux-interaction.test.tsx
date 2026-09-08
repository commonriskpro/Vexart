import { describe, expect, test } from "bun:test"
import { createSignal, type JSX } from "solid-js"
import { createToaster, Dialog, type TextareaHandle } from "@vexart/headless"
import { Input, Textarea } from "@vexart/headless"
import {
  createScrollHandle,
  focusedId,
  getRendererBackend,
  mount,
  resetFocus,
  setRendererBackend,
  useFocus,
  type Capabilities,
  type Terminal,
} from "@vexart/engine"
import { createGpuRendererBackendForTesting } from "../../packages/engine/src/ffi/gpu-renderer-backend"
import { useDrag } from "../../packages/engine/src/reconciler/drag"
import { setFocusedId } from "../../packages/engine/src/reconciler/focus"

type TestTerminal = Terminal & {
  emit: (data: Uint8Array | string) => void
}

function createTestTerminal(tmux = false): TestTerminal {
  const noop = () => {}
  const size = {
    cols: 30,
    rows: 12,
    pixelWidth: 240,
    pixelHeight: 192,
    cellWidth: 8,
    cellHeight: 16,
  }
  const caps: Capabilities = tmux
    ? {
        kind: "xterm",
        kittyGraphics: false,
        kittyPlaceholder: true,
        kittyKeyboard: false,
        sixel: false,
        truecolor: true,
        mouse: true,
        focus: true,
        bracketedPaste: true,
        syncOutput: true,
        tmux: true,
        parentKind: "kitty",
        transmissionMode: "direct",
      }
    : {
        kind: "kitty",
        kittyGraphics: true,
        kittyPlaceholder: false,
        kittyKeyboard: false,
        sixel: false,
        truecolor: true,
        mouse: true,
        focus: true,
        bracketedPaste: true,
        syncOutput: true,
        tmux: false,
        parentKind: null,
        transmissionMode: "direct",
      }

  let dataHandler: ((data: Buffer) => void) | null = null
  return {
    kind: caps.kind,
    caps,
    size,
    write: noop,
    rawWrite: noop,
    writeBytes: noop,
    beginSync: noop,
    endSync: noop,
    onResize: () => noop,
    onData(handler) {
      dataHandler = handler
      return () => {
        if (dataHandler === handler) dataHandler = null
      }
    },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: noop,
    writeClipboard: noop,
    suspend: noop,
    resume: noop,
    destroy: noop,
    emit(data) {
      dataHandler?.(Buffer.from(data))
    },
  }
}

function waitForFrame(ms = 30) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function emitFragmented(terminal: TestTerminal, data: string) {
  const bytes = new TextEncoder().encode(data)
  for (let index = 0; index < bytes.length; index += 1) terminal.emit(bytes.slice(index, index + 1))
}

function hasLoneSurrogate(text: string) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= text.length) return true
      const next = text.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

async function eachCapabilityVariant(run: (terminal: TestTerminal, tmux: boolean) => Promise<void>) {
  for (const tmux of [false, true]) await run(createTestTerminal(tmux), tmux)
}

function mountWithGpu(component: () => JSX.Element, terminal: TestTerminal) {
  const previous = getRendererBackend()
  const backend = createGpuRendererBackendForTesting()
  setRendererBackend(backend)
  let handle: ReturnType<typeof mount>
  try {
    handle = mount(component, terminal, {
      maxFps: 60,
      experimental: {
        forceLayerRepaint: true,
        nativePresentation: false,
        nativeLayerRegistry: false,
      },
    })
  } catch (error) {
    backend.destroy?.()
    setRendererBackend(previous)
    throw error
  }
  return {
    async destroy() {
      try {
        handle.destroy()
      } finally {
        setRendererBackend(previous)
        await waitForFrame(0)
      }
    },
  }
}

describe("tmux input through the real mounted engine", () => {
  test("moves focus with Tab/Shift-Tab and activates the focused control", async () => {
    await eachCapabilityVariant(async (terminal) => {
      const presses: string[] = []
      function Control(props: { id: string }) {
        useFocus({ id: props.id, onPress: () => { presses.push(props.id) } })
        return <box width={120} height={32} />
      }
      const runtime = mountWithGpu(() => (
        <box width={240} height={192} direction="column">
          <Control id="first" />
          <Control id="second" />
        </box>
      ), terminal)

      try {
        await waitForFrame()
        expect(focusedId()).toBe("first")

        terminal.emit("\t")
        await waitForFrame()
        expect(focusedId()).toBe("second")

        // tmux extended-keys emits xterm modifyOtherKeys for Shift+Tab.
        terminal.emit("\x1b[27;2;9~")
        await waitForFrame()
        expect(focusedId()).toBe("first")

        terminal.emit("\t")
        await waitForFrame()
        expect(focusedId()).toBe("second")
        terminal.emit("\r")
        await waitForFrame()
        expect(presses).toEqual(["second"])
      } finally {
        await runtime.destroy()
      }
    })
  })

  // This mounted check runs two cold GPU capability cycles; the timeout is a
  // test allowance, not a performance budget.
  test("Input consumes fragmented UTF-8 and a bracketed paste in a tmux-capable pane", async () => {
    await eachCapabilityVariant(async (terminal, tmux) => {
      const [value, setValue] = createSignal("")
      const changes: string[] = []
      const runtime = mountWithGpu(() => (
        <Input
          value={value()}
          focusId={`tmux-input-${tmux ? "tmux" : "normal"}`}
          width={200}
          onChange={(next) => { changes.push(next); setValue(next) }}
        />
      ), terminal)

      try {
        await waitForFrame()
        const utf8 = new TextEncoder().encode("hé")
        terminal.emit(utf8.slice(0, 2))
        terminal.emit(utf8.slice(2, 3))
        terminal.emit(utf8.slice(3))
        await waitForFrame()
        expect(value()).toBe("hé")

        const paste = "\x1b[200~a\nb\x1b[201~"
        for (const byte of new TextEncoder().encode(paste)) terminal.emit(new Uint8Array([byte]))
        await waitForFrame()
        expect(value()).toBe("héa b")
        expect(changes.length).toBeGreaterThan(1)

        // Kitty CSI-u and xterm modifyOtherKeys both carry Unicode codepoints
        // as decimal values. Feed each sequence one byte at a time through the
        // mounted parser so Input exercises the actual insertion callback.
        emitFragmented(terminal, "\x1b[233u")
        emitFragmented(terminal, "\x1b[27;1;128512~")
        terminal.emit("x")
        await waitForFrame()
        expect(value()).toBe("héa bé😀x")
      } finally {
        await runtime.destroy()
      }
    })
  }, 30_000)

  test("Textarea receives fragmented UTF-8 and bracketed paste through onChange/onPaste", async () => {
    await eachCapabilityVariant(async (terminal, tmux) => {
      const [value, setValue] = createSignal("")
      const pasted: string[] = []
      const runtime = mountWithGpu(() => (
        <Textarea
          value={value()}
          focusId={`tmux-textarea-${tmux ? "tmux" : "normal"}`}
          width={200}
          height={120}
          onChange={setValue}
          onPaste={(text) => pasted.push(text)}
        />
      ), terminal)

      try {
        await waitForFrame()
        const utf8 = new TextEncoder().encode("λ")
        terminal.emit(utf8.slice(0, 1))
        terminal.emit(utf8.slice(1))
        await waitForFrame()
        expect(value()).toBe("λ")

        const paste = "\x1b[200~line one\r\nline two\x1b[201~"
        const bytes = new TextEncoder().encode(paste)
        for (let i = 0; i < bytes.length; i += 1) terminal.emit(bytes.slice(i, i + 1))
        await waitForFrame()
        expect(pasted).toEqual(["line one\r\nline two"])
        expect(value()).toBe("λline one\nline two")

        emitFragmented(terminal, "\x1b[233u")
        emitFragmented(terminal, "\x1b[27;1;128512~")
        terminal.emit("x")
        await waitForFrame()
        expect(value()).toBe("λline one\nline twoé😀x")
      } finally {
        await runtime.destroy()
      }
    })
  })

  test("Input edits astral characters by codepoint without splitting surrogates", async () => {
    await eachCapabilityVariant(async (terminal, tmux) => {
      const [value, setValue] = createSignal("A😀B")
      let cursor = -1
      let selection: [number, number] | null = null
      let focusInput = () => {}
      const runtime = mountWithGpu(() => (
        <Input
          value={value()}
          focusId={`astral-input-${tmux ? "tmux" : "normal"}`}
          width={200}
          onChange={setValue}
          renderInput={(ctx) => {
            cursor = ctx.cursor
            selection = ctx.selection
            focusInput = ctx.inputProps.onPress
            return <box width={200} height={32} {...ctx.inputProps} />
          }}
        />
      ), terminal)

      async function send(data: string) {
        terminal.emit(data)
        await waitForFrame()
      }

      try {
        await waitForFrame()
        focusInput()
        await waitForFrame()
        expect(cursor).toBe(4)

        await send("\x1b[D")
        expect(cursor).toBe(3)
        await send("\x1b[D")
        expect(cursor).toBe(1)
        await send("\x1b[C")
        expect(cursor).toBe(3)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[H")
        await send("\x1b[C")
        await send("X")
        expect(value()).toBe("AX😀B")
        expect(hasLoneSurrogate(value())).toBe(false)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[H")
        await send("\x1b[C")
        await send("\x1b[3~")
        expect(value()).toBe("AB")
        expect(hasLoneSurrogate(value())).toBe(false)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[F")
        await send("\x1b[D")
        await send("\x7f")
        expect(value()).toBe("AB")
        expect(hasLoneSurrogate(value())).toBe(false)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[H")
        await send("\x1b[C")
        await send("\x1b[1;2C")
        expect(selection as unknown as [number, number]).toEqual([1, 3])
        await send("X")
        expect(value()).toBe("AXB")
        expect(hasLoneSurrogate(value())).toBe(false)
      } finally {
        await runtime.destroy()
      }
    })
  })

  test("Textarea edits astral characters by codepoint without splitting surrogates", async () => {
    await eachCapabilityVariant(async (terminal, tmux) => {
      const [value, setValue] = createSignal("A😀B")
      let textarea: TextareaHandle | null = null
      const runtime = mountWithGpu(() => (
        <Textarea
          value={value()}
          ref={(handle) => { textarea = handle }}
          focusId={`astral-textarea-${tmux ? "tmux" : "normal"}`}
          width={200}
          height={120}
          onChange={setValue}
        />
      ), terminal)

      async function send(data: string) {
        terminal.emit(data)
        await waitForFrame()
      }

      try {
        await waitForFrame()
        textarea!.focus()
        await waitForFrame()
        expect(textarea!.cursorOffset).toBe(4)

        await send("\x1b[D")
        expect(textarea!.cursorOffset).toBe(3)
        await send("\x1b[D")
        expect(textarea!.cursorOffset).toBe(1)
        await send("\x1b[C")
        expect(textarea!.cursorOffset).toBe(3)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[H")
        await send("\x1b[C")
        await send("X")
        expect(value()).toBe("AX😀B")
        expect(hasLoneSurrogate(value())).toBe(false)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[H")
        await send("\x1b[C")
        await send("\x1b[3~")
        expect(value()).toBe("AB")
        expect(hasLoneSurrogate(value())).toBe(false)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[F")
        await send("\x1b[D")
        await send("\x7f")
        expect(value()).toBe("AB")
        expect(hasLoneSurrogate(value())).toBe(false)

        setValue("A😀B")
        await waitForFrame()
        await send("\x1b[H")
        await send("\x1b[C")
        await send("\x1b[1;2C")
        await send("X")
        expect(value()).toBe("AXB")
        expect(hasLoneSurrogate(value())).toBe(false)
      } finally {
        await runtime.destroy()
      }
    })
  })

  test("SGR click/drag capture and wheel update mounted state", async () => {
    await eachCapabilityVariant(async (terminal, tmux) => {
      const [dragValue, setDragValue] = createSignal(0)
      const scrollId = `tmux-interaction-scroll-${tmux ? "tmux" : "normal"}`
      const scroll = createScrollHandle(scrollId)
      let dragMoves = 0
      let dragEnds = 0

      function Draggable() {
        const drag = useDrag({
          onDragStart: (event) => { setDragValue(Math.round(event.nodeX)) },
          onDrag: (event) => { dragMoves += 1; setDragValue(Math.round(event.nodeX)) },
          onDragEnd: () => { dragEnds += 1 },
        })
        return <box width={160} height={32} {...drag.dragProps} />
      }

      const runtime = mountWithGpu(() => (
        <box width={240} height={192} direction="column">
          <Draggable />
          <box width={240} height={64} scrollY scrollId={scrollId}>
            <box width={240} height={320} />
          </box>
        </box>
      ), terminal)

      try {
        await waitForFrame()

        // Press inside the drag target, move outside it, then release outside.
        terminal.emit("\x1b[<0;2;1M")
        await waitForFrame()
        terminal.emit("\x1b[<32;25;1M")
        await waitForFrame()
        terminal.emit("\x1b[<0;25;1m")
        await waitForFrame()
        expect(dragValue()).toBeGreaterThan(160)
        expect(dragMoves).toBeGreaterThan(0)
        expect(dragEnds).toBe(1)

        // Button 65 is the SGR wheel-down event; the real scroll handle moves.
        terminal.emit("\x1b[<65;2;5M")
        await waitForFrame()
        expect(scroll.contentHeight).toBeGreaterThan(scroll.viewportHeight)
        expect(scroll.scrollTop).toBeGreaterThan(0)
      } finally {
        await runtime.destroy()
      }
    })
  })

  test("Dialog Escape invokes close and traps focus inside the modal", async () => {
    await eachCapabilityVariant(async (terminal) => {
      let dialogClosed = 0
      function Background() {
        useFocus({ id: "background" })
        return <box width={120} height={32} />
      }
      function ModalControl(props: { id: string }) {
        useFocus({ id: props.id })
        return <box width={80} height={24} />
      }
      const runtime = mountWithGpu(() => (
        <box width={240} height={192}>
          <Background />
          <Dialog onClose={() => { dialogClosed += 1 }}>
            <Dialog.Content width={160}>
              <ModalControl id="dialog-first" />
              <ModalControl id="dialog-second" />
            </Dialog.Content>
          </Dialog>
        </box>
      ), terminal)

      try {
        expect(focusedId()).toBe("dialog-first")

        terminal.emit("\t")
        expect(focusedId()).toBe("dialog-second")

        terminal.emit("\t")
        expect(focusedId()).toBe("dialog-first")

        // Use the complete tmux/xterm extended-key representation of Escape so
        // this assertion does not depend on the lone-Escape disambiguation timer.
        terminal.emit("\x1b[27;1;27~")
        expect(dialogClosed).toBe(1)
      } finally {
        setFocusedId(null)
        await runtime.destroy()
      }
    })
  })

  test("Dialog restores the previously focused control after Escape unmounts it", async () => {
    await eachCapabilityVariant(async (terminal) => {
      // The focus runtime is intentionally process-global. Isolate this
      // lifecycle assertion from registrations left by earlier mounted tests.
      resetFocus()
      const [open, setOpen] = createSignal(true)
      let closeCalls = 0

      function Background() {
        useFocus({ id: "dialog-background" })
        return <box width={120} height={32} />
      }

      function ModalControl() {
        useFocus({ id: "dialog-control" })
        return <box width={80} height={24} />
      }

      const runtime = mountWithGpu(() => (
        <box width={240} height={192}>
          <Background />
          {open() ? (
            <Dialog onClose={() => { closeCalls += 1; setOpen(false) }}>
              <Dialog.Content width={160}>
                <ModalControl />
              </Dialog.Content>
            </Dialog>
          ) : null}
        </box>
      ), terminal)

      try {
        await waitForFrame()
        expect(focusedId()).toBe("dialog-control")

        // This is the complete extended Escape sequence emitted by tmux's
        // modifyOtherKeys mode. The callback removes the dialog, so this
        // checks the actual cleanup path rather than just onClose dispatch.
        terminal.emit("\x1b[27;1;27~")
        await waitForFrame()

        expect(closeCalls).toBe(1)
        expect(open()).toBe(false)
        expect(focusedId()).toBe("dialog-background")
      } finally {
        await runtime.destroy()
        resetFocus()
      }
    })
  })

  test("Toast honors all requested positions in direct and tmux runtimes", async () => {
    const positions = [
      { position: "top-left", x: 16, y: 16 },
      { position: "top-center", x: 60, y: 16 },
      { position: "top-right", x: 104, y: 16 },
      { position: "bottom-left", x: 16, y: 144 },
      { position: "bottom-center", x: 60, y: 144 },
      { position: "bottom-right", x: 104, y: 144 },
    ] as const

    await eachCapabilityVariant(async (terminal) => {
      const probes = positions.map((spec) => {
        let layout: { x: number; y: number; width: number; height: number } | null = null
        const toaster = createToaster({
          position: spec.position,
          padding: 16,
          defaultDuration: 0,
          renderToast: () => (
            <box
              ref={(handle) => { layout = handle.layout }}
              width={120}
              height={32}
              backgroundColor={0xef4444ff}
            />
          ),
        })
        return { ...spec, toaster, get layout() { return layout } }
      })
      const runtime = mountWithGpu(() => (
        <box width={240} height={192}>
          {probes.map(({ toaster }) => toaster.Toaster())}
        </box>
      ), terminal)

      try {
        await waitForFrame()
        for (const probe of probes) probe.toaster.toast(`${probe.position} probe`)
        await waitForFrame()

        for (const probe of probes) {
          expect(probe.layout).toMatchObject({ x: probe.x, y: probe.y, width: 120, height: 32 })
        }
      } finally {
        for (const probe of probes) probe.toaster.dismissAll()
        await runtime.destroy()
      }
    })
  })
})
