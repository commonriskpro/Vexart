import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import {
  createComponent,
  createElement,
  type TGENode,
} from "@vexart/engine"
import { Popover, type PopoverTriggerContext } from "./tooltip"

const resolveNode = (node: unknown): TGENode =>
  (typeof node === "function" ? (node as () => TGENode)() : (node as TGENode))

describe("Popover", () => {
  test("clicking outside capture plane calls onOpenChange(false)", () => {
    let dispose!: () => void
    let rawRoot!: unknown
    const openChanges: boolean[] = []
    const [open, setOpen] = createSignal(true)

    createRoot((d) => {
      dispose = d
      rawRoot = createComponent(Popover as any, {
        get open() {
          return open()
        },
        onOpenChange(next: boolean) {
          openChanges.push(next)
          setOpen(next)
        },
        renderTrigger: (_ctx: PopoverTriggerContext) => createElement("box"),
        renderContent: () => createElement("box"),
      })
    })

    try {
      const rootNode = resolveNode(rawRoot)
      expect(rootNode).toBeDefined()

      // When open, outside plane should exist with floating="root" and zIndex=9997
      const outsidePlane = () =>
        rootNode.children.find((c) => c.props.floating === "root" && c.props.zIndex === 9997)

      expect(outsidePlane()).toBeDefined()
      expect(outsidePlane()!.props.width).toBe("100%")
      expect(outsidePlane()!.props.height).toBe("100%")
      expect(typeof outsidePlane()!.props.onPress).toBe("function")

      // Content box should also exist with floating="parent" and zIndex=9998
      const contentBox = () =>
        rootNode.children.find((c) => c.props.floating === "parent" && c.props.zIndex === 9998)
      expect(contentBox()).toBeDefined()

      // Click the outside plane
      ;(outsidePlane()!.props.onPress as () => void)()

      expect(openChanges).toEqual([false])
      expect(open()).toBe(false)

      // When closed, outside plane and content box should be removed
      expect(outsidePlane()).toBeUndefined()
      expect(contentBox()).toBeUndefined()
    } finally {
      dispose()
    }
  })
})
