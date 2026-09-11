import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  createComponent,
  createElement,
  type TGENode,
} from "@vexart/engine"
import {
  Combobox,
  type ComboboxInputContext,
  type ComboboxOption,
  type ComboboxOptionContext,
} from "./combobox"

const resolveNode = (node: unknown): TGENode =>
  (typeof node === "function" ? (node as () => TGENode)() : (node as TGENode))

const dummyOptions: ComboboxOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
]

describe("Combobox", () => {
  test("clicking outside capture plane sets open to false", () => {
    let dispose!: () => void
    let rawRoot!: unknown
    let capturedCtx!: ComboboxInputContext

    createRoot((d) => {
      dispose = d
      rawRoot = createComponent(Combobox as any, {
        options: dummyOptions,
        renderInput: (ctx: ComboboxInputContext) => {
          capturedCtx = ctx
          return createElement("box")
        },
        renderOption: (_opt: ComboboxOption, _ctx: ComboboxOptionContext) => createElement("box"),
      })
    })

    try {
      const rootNode = resolveNode(rawRoot)
      expect(rootNode).toBeDefined()
      expect(capturedCtx.open).toBe(false)

      const outsidePlane = () =>
        rootNode.children.find((c) => c.props.floating === "root" && c.props.zIndex === 9997)

      // Initially closed: no outside plane
      expect(outsidePlane()).toBeUndefined()

      // Click the input trigger box to open
      const inputTriggerBox = rootNode.children[0]
      expect(inputTriggerBox).toBeDefined()
      expect(typeof inputTriggerBox.props.onPress).toBe("function")

      ;(inputTriggerBox.props.onPress as () => void)()

      expect(capturedCtx.open).toBe(true)

      // Dropdown is open: outside plane and content box should exist
      expect(outsidePlane()).toBeDefined()
      expect(outsidePlane()!.props.width).toBe("100%")
      expect(outsidePlane()!.props.height).toBe("100%")
      expect(typeof outsidePlane()!.props.onPress).toBe("function")

      const contentBox = () =>
        rootNode.children.find((c) => c.props.zIndex === 9998)
      expect(contentBox()).toBeDefined()

      // Click the outside plane to dismiss
      ;(outsidePlane()!.props.onPress as () => void)()

      // Dropdown should now be closed
      expect(capturedCtx.open).toBe(false)
      expect(outsidePlane()).toBeUndefined()
      expect(contentBox()).toBeUndefined()
    } finally {
      dispose()
    }
  })
})
