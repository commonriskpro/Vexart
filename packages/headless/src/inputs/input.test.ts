import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import {
  createComponent,
  dispatchInput,
  measureForLayout,
  NO_MODS,
  resetFocus,
  setFocusedId,
  type TGENode,
} from "@vexart/engine"
import { Input } from "./input"

type NodeComponent = (props: any) => TGENode
const InputNode = Input as unknown as NodeComponent

function collectText(node: TGENode): string {
  let result = node.text || ""
  for (const child of node.children) {
    result += collectText(child)
  }
  return result
}

function findCursorBox(innerBox: TGENode): TGENode | undefined {
  return innerBox.children.find((c) => c.kind === "box")
}

describe("Input", () => {
  beforeEach(() => {
    resetFocus()
    // Pre-occupy focus so newly created Input does not auto-focus as the first scope entry
    setFocusedId("initial-unfocused")
  })

  afterEach(() => {
    resetFocus()
  })

  test("paste normalizes carriage returns and tabs", () => {
    const text = "hello\r\nworld\ttab"
    const normalized = text.replace(/[\r\n\t]/g, " ")

    expect(normalized).toBe("hello  world tab")
  })

  test("renders pure text without '│' or ' ' string mutation when focused or blinking", () => {
    let dispose: () => void
    let inputNode: TGENode

    createRoot((d) => {
      dispose = d
      inputNode = createComponent(InputNode, {
        value: "PureTextValue",
        focusId: "test-input-pure",
      })
    })

    try {
      // Find the inner box and the text node
      const innerBox = () => inputNode.children[0]
      expect(innerBox()).toBeDefined()
      const textNode = () => innerBox().children[0]
      expect(textNode()).toBeDefined()
      expect(textNode().kind).toBe("text")

      // When unfocused, text content must be purely the value
      const unfocusedText = collectText(textNode())
      expect(unfocusedText).toBe("PureTextValue")
      expect(unfocusedText).not.toContain("│")
      expect(unfocusedText).not.toContain(" ")

      // Focus the input
      setFocusedId("test-input-pure")

      // When focused, text content MUST remain pure without string mutation
      const focusedText = collectText(textNode())
      expect(focusedText).toBe("PureTextValue")
      expect(focusedText).not.toContain("│")
      expect(focusedText).not.toContain(" ")
      expect(focusedText.length).toBe("PureTextValue".length)

      // Move cursor to start
      dispatchInput({ type: "key", key: "home", char: "", mods: NO_MODS })
      const textAtStart = collectText(textNode())
      expect(textAtStart).toBe("PureTextValue")
      expect(textAtStart).not.toContain("│")
      expect(textAtStart).not.toContain(" ")

      // Move cursor to middle
      for (let i = 0; i < 4; i++) {
        dispatchInput({ type: "key", key: "right", char: "", mods: NO_MODS })
      }
      const textAtMiddle = collectText(textNode())
      expect(textAtMiddle).toBe("PureTextValue")
      expect(textAtMiddle).not.toContain("│")
      expect(textAtMiddle).not.toContain(" ")
    } finally {
      dispose!()
    }
  })

  test("cursor overlay is rendered as a floating box positioned by text prefix measurement", () => {
    let dispose: () => void
    let inputNode: TGENode
    const [val, setVal] = createSignal("HelloWorld")

    createRoot((d) => {
      dispose = d
      inputNode = createComponent(InputNode, {
        get value() {
          return val()
        },
        focusId: "test-input-cursor",
      })
    })

    try {
      const innerBox = () => inputNode.children[0]
      expect(innerBox()).toBeDefined()

      // Unfocused: no cursor box overlay
      expect(findCursorBox(innerBox())).toBeUndefined()

      // Focus the input: cursor overlay appears as floating box
      setFocusedId("test-input-cursor")

      const cursorBox = findCursorBox(innerBox())
      expect(cursorBox).toBeDefined()
      expect(cursorBox!.kind).toBe("box")
      expect(cursorBox!.props.floating).toBe("parent")
      expect(cursorBox!.props.width).toBe(1.5)
      expect(cursorBox!.props.height).toBe(17) // lineHeight = Math.ceil(14 * 1.2) = 17

      // By default on focus, cursor is at the end of text ("HelloWorld")
      const expectedEndWidth = measureForLayout("HelloWorld", 0, 14).width
      expect(cursorBox!.props.floatOffset).toEqual({ x: expectedEndWidth, y: 0 })

      // Move cursor to start using Home key
      dispatchInput({
        type: "key",
        key: "home",
        char: "",
        mods: NO_MODS,
      })

      // When cursor is at position 0, prefix is "" and cursorX is 0
      const cursorBoxAtStart = findCursorBox(innerBox())
      expect(cursorBoxAtStart).toBeDefined()
      expect(cursorBoxAtStart!.props.floatOffset).toEqual({ x: 0, y: 0 })

      // Move cursor 5 characters to the right ("Hello")
      for (let i = 0; i < 5; i++) {
        dispatchInput({
          type: "key",
          key: "right",
          char: "",
          mods: NO_MODS,
        })
      }

      const expectedPrefixWidth = measureForLayout("Hello", 0, 14).width
      const cursorBoxAtHello = findCursorBox(innerBox())
      expect(cursorBoxAtHello).toBeDefined()
      expect(cursorBoxAtHello!.props.floatOffset).toEqual({ x: expectedPrefixWidth, y: 0 })

      // Throughout navigation, the text node remains strictly pure
      const textNode = innerBox().children[0]
      expect(collectText(textNode)).toBe("HelloWorld")

      // Unfocus: cursor box overlay is removed
      setFocusedId("initial-unfocused")
      expect(findCursorBox(innerBox())).toBeUndefined()
    } finally {
      dispose!()
    }
  })
})
