import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  createComponent,
  createElement,
  focusedId,
  resetFocus,
  setFocusedId,
  type TGENode,
} from "@vexart/engine"
import { Select, type SelectOption, type SelectTriggerContext } from "./select"

const dummyOptions: SelectOption[] = [
  { value: "opt1", label: "Option 1" },
  { value: "opt2", label: "Option 2" },
]

const resolveNode = (node: unknown): TGENode =>
  (typeof node === "function" ? (node as () => TGENode)() : (node as TGENode))

describe("Select", () => {
  beforeEach(() => {
    resetFocus()
    setFocusedId("initial-unfocused")
  })

  afterEach(() => {
    resetFocus()
  })

  test("Clicking trigger in render-prop mode grants focus and toggles open", () => {
    let capturedCtx!: SelectTriggerContext
    let dispose!: () => void
    let rawRoot!: unknown

    createRoot((d) => {
      dispose = d
      rawRoot = createComponent(Select as any, {
        options: dummyOptions,
        focusId: "test-select-render-prop",
        renderTrigger: (ctx: SelectTriggerContext) => {
          capturedCtx = ctx
          return createElement("text")
        },
      })
    })

    try {
      const rootNode = resolveNode(rawRoot)
      expect(focusedId()).toBe("initial-unfocused")
      expect(capturedCtx.focused).toBe(false)
      expect(capturedCtx.open).toBe(false)

      const triggerBox = rootNode.children[0]
      expect(triggerBox).toBeDefined()
      expect(typeof triggerBox.props.onPress).toBe("function")

      // First click: grants focus and opens
      ;(triggerBox.props.onPress as () => void)()

      expect(focusedId()).toBe("test-select-render-prop")
      expect(capturedCtx.focused).toBe(true)
      expect(capturedCtx.open).toBe(true)

      // Second click: toggles closed while retaining focus
      ;(triggerBox.props.onPress as () => void)()

      expect(focusedId()).toBe("test-select-render-prop")
      expect(capturedCtx.focused).toBe(true)
      expect(capturedCtx.open).toBe(false)
    } finally {
      dispose()
    }
  })

  test("Clicking SelectTrigger in compound mode grants focus and toggles open", () => {
    let dispose!: () => void
    let triggerNode!: TGENode
    let contentAccessor!: () => TGENode | null

    createRoot((d) => {
      dispose = d
      createComponent(Select as any, {
        focusId: "test-select-compound",
        get children() {
          triggerNode = createComponent(Select.Trigger as any, {
            get children() {
              return createElement("text")
            },
          })
          contentAccessor = (createComponent as any)(Select.Content as any, {
            get children() {
              return createComponent(Select.Item as any, {
                value: "opt1",
                get children() {
                  return createElement("text")
                },
              })
            },
          }) as () => TGENode | null
          return [triggerNode, contentAccessor]
        },
      })
    })

    try {
      expect(focusedId()).toBe("initial-unfocused")
      expect(triggerNode).toBeDefined()
      expect(typeof triggerNode.props.onPress).toBe("function")

      // Initially closed: content accessor returns null
      expect(contentAccessor()).toBeNull()

      // First click: grants focus and opens dropdown
      ;(triggerNode.props.onPress as () => void)()

      expect(focusedId()).toBe("test-select-compound")
      expect(contentAccessor()).not.toBeNull()

      // Second click: closes dropdown while maintaining focus
      ;(triggerNode.props.onPress as () => void)()

      expect(focusedId()).toBe("test-select-compound")
      expect(contentAccessor()).toBeNull()
    } finally {
      dispose()
    }
  })

  test("Disabled select does not open or grant focus in render-prop mode", () => {
    let capturedCtx!: SelectTriggerContext
    let dispose!: () => void
    let rawRoot!: unknown

    createRoot((d) => {
      dispose = d
      rawRoot = createComponent(Select as any, {
        options: dummyOptions,
        disabled: true,
        focusId: "test-select-disabled-render-prop",
        renderTrigger: (ctx: SelectTriggerContext) => {
          capturedCtx = ctx
          return createElement("text")
        },
      })
    })

    try {
      const rootNode = resolveNode(rawRoot)
      expect(focusedId()).toBe("initial-unfocused")
      expect(capturedCtx.focused).toBe(false)
      expect(capturedCtx.open).toBe(false)
      expect(capturedCtx.disabled).toBe(true)

      const triggerBox = rootNode.children[0]
      expect(triggerBox).toBeDefined()
      expect(typeof triggerBox.props.onPress).toBe("function")

      // Click attempt should not grant focus or open
      ;(triggerBox.props.onPress as () => void)()

      expect(focusedId()).toBe("initial-unfocused")
      expect(capturedCtx.focused).toBe(false)
      expect(capturedCtx.open).toBe(false)
    } finally {
      dispose()
    }
  })

  test("Disabled select does not open or grant focus in compound mode", () => {
    let dispose!: () => void
    let triggerNode!: TGENode
    let contentAccessor!: () => TGENode | null

    createRoot((d) => {
      dispose = d
      createComponent(Select as any, {
        disabled: true,
        focusId: "test-select-disabled-compound",
        get children() {
          triggerNode = createComponent(Select.Trigger as any, {
            get children() {
              return createElement("text")
            },
          })
          contentAccessor = (createComponent as any)(Select.Content as any, {
            get children() {
              return createComponent(Select.Item as any, {
                value: "opt1",
                get children() {
                  return createElement("text")
                },
              })
            },
          }) as () => TGENode | null
          return [triggerNode, contentAccessor]
        },
      })
    })

    try {
      expect(focusedId()).toBe("initial-unfocused")
      expect(triggerNode).toBeDefined()
      expect(typeof triggerNode.props.onPress).toBe("function")
      expect(contentAccessor()).toBeNull()

      // Click attempt should not grant focus or open
      ;(triggerNode.props.onPress as () => void)()

      expect(focusedId()).toBe("initial-unfocused")
      expect(contentAccessor()).toBeNull()
    } finally {
      dispose()
    }
  })
})
