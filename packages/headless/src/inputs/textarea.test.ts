import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  createComponent,
  createRenderLoop,
  dispatchInput,
  insertChild,
  markDirty,
  NO_MODS,
  resetFocus,
  setFocusedId,
  type RendererBackend,
  type TGENode,
  type Terminal,
} from "@vexart/engine"
import { Textarea, type TextareaHandle } from "./textarea"

type NodeComponent = (props: Record<string, unknown>) => TGENode
const TextareaNode = Textarea as unknown as NodeComponent

const noopBackend: RendererBackend = {
  name: "textarea-layout-test",
  paint() {
    return { output: "skip-present" }
  },
  endFrame() {
    return { output: "none", strategy: null }
  },
}

function createMockTerminal(): Terminal {
  const size = {
    cols: 80,
    rows: 24,
    pixelWidth: 640,
    pixelHeight: 384,
    cellWidth: 8,
    cellHeight: 16,
  }

  return {
    kind: "kitty",
    caps: {
      kind: "kitty",
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct",
    },
    size,
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize() { return () => {} },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  }
}

function textChildren(line: TGENode): TGENode[] {
  return line.children.filter((child) =>
    child.kind === "text" && child.children.some((nested) => nested.text.length > 0)
  )
}

describe("Textarea line layout", () => {
  beforeEach(() => {
    resetFocus()
    setFocusedId("initial-unfocused")
  })

  afterEach(() => {
    resetFocus()
  })

  test("keeps the caret on the text row at the end and in the middle", () => {
    let dispose!: () => void
    let textarea!: TGENode

    createRoot((d) => {
      dispose = d
      textarea = createComponent(TextareaNode, {
        value: "Hola sexo?",
        focusId: "textarea-cursor-layout",
        width: 500,
        height: 80,
      })
    })

    const loop = createRenderLoop(createMockTerminal(), {
      backend: noopBackend,
      experimental: { nativePresentation: false, nativeLayerRegistry: false },
    })
    try {
      insertChild(loop.root, textarea)
      setFocusedId("textarea-cursor-layout")
      markDirty()
      loop.frame()

      const line = textarea.children[0]
      const caret = line.children.find((child) => child.kind === "box")
      expect(caret).toBeDefined()
      const endText = textChildren(line)[0]
      expect(endText).toBeDefined()
      expect(caret!.layout.y).toBe(endText.layout.y)
      expect(caret!.layout.x).toBeGreaterThanOrEqual(endText.layout.x + endText.layout.width)

      dispatchInput({ type: "key", key: "home", char: "", mods: NO_MODS })
      for (let i = 0; i < 4; i++) {
        dispatchInput({ type: "key", key: "right", char: "", mods: NO_MODS })
      }
      markDirty()
      loop.frame()

      const middleLine = textarea.children[0]
      const middleCaret = middleLine.children.find((child) => child.kind === "box")
      const middleTexts = textChildren(middleLine)
      expect(middleTexts.length).toBe(2)
      expect(middleCaret).toBeDefined()
      expect(middleTexts.every((child) => child.layout.y === middleCaret!.layout.y)).toBe(true)
      expect(middleTexts[0].layout.x).toBeLessThan(middleCaret!.layout.x)
      expect(middleCaret!.layout.x).toBeLessThan(middleTexts[1].layout.x)
    } finally {
      loop.destroy()
      dispose()
    }
  })

  test("lays out non-cursor colored segments in one row", () => {
    let dispose!: () => void
    let textarea!: TGENode
    let handle!: TextareaHandle

    createRoot((d) => {
      dispose = d
      textarea = createComponent(TextareaNode, {
        value: "first\nsecond",
        focusId: "textarea-segment-layout",
        width: 500,
        height: 80,
        ref: (next: TextareaHandle) => { handle = next },
      })
    })

    const loop = createRenderLoop(createMockTerminal(), {
      backend: noopBackend,
      experimental: { nativePresentation: false, nativeLayerRegistry: false },
    })
    try {
      insertChild(loop.root, textarea)
      handle.extmarks.create({
        start: 0,
        end: 2,
        typeId: handle.extmarks.registerType("test-highlight"),
        fg: 0xff00ffff,
      })
      setFocusedId("textarea-segment-layout")
      markDirty()
      loop.frame()

      const line = textarea.children[0]
      const segments = textChildren(line)
      expect(segments.length).toBe(2)
      expect(segments[0].layout.y).toBe(segments[1].layout.y)
      expect(segments[0].layout.x).toBeLessThan(segments[1].layout.x)
    } finally {
      loop.destroy()
      dispose()
    }
  })
})
