import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import {
  createNode,
  dispatchInput,
  resetFocus,
  setFocusedId,
  solidRender,
  type TGENode,
} from "@vexart/engine/internal"
import { focusedId, useFocus } from "@vexart/engine"
import { Popover } from "./popover"
import { Dialog } from "./dialog"

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

describe("Popover", () => {
  beforeEach(() => resetFocus())
  afterEach(() => resetFocus())

  test("clicking outside capture plane calls onOpenChange(false) when modal", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)
    const openChanges: boolean[] = []

    const dispose = renderScene(root, () => (
      <Popover
        open={open()}
        onOpenChange={(next) => {
          openChanges.push(next)
          setOpen(next)
        }}
        renderTrigger={() => <box />}
        renderContent={() => <box />}
      />
    ))

    try {
      const popoverRoot = root.children[0]
      expect(popoverRoot).toBeDefined()

      // When open, outside plane should exist with floating="root" and zIndex=9997
      const outsidePlane = popoverRoot.children.find(
        (c) => c.props.floating === "root" && c.props.zIndex === 9997
      )
      expect(outsidePlane).toBeDefined()
      expect(outsidePlane!.props.width).toBe("100%")
      expect(outsidePlane!.props.height).toBe("100%")
      expect(typeof outsidePlane!.props.onPress).toBe("function")

      // Content box should exist with floating="parent" and zIndex=9998
      const contentBox = popoverRoot.children.find(
        (c) => c.props.floating === "parent" && c.props.zIndex === 9998
      )
      expect(contentBox).toBeDefined()

      // Click the outside plane
      ;(outsidePlane!.props.onPress as () => void)()
      expect(openChanges).toEqual([false])
      expect(open()).toBe(false)
    } finally {
      dispose()
    }
  })

  test("isolates focus when open with modal={true} (default)", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(false)

    function Trigger() {
      useFocus({ id: "trigger-btn" })
      return <box focusable focusId="trigger-btn" />
    }

    function PopoverContent() {
      useFocus({ id: "popover-item-1" })
      useFocus({ id: "popover-item-2" })
      return (
        <box>
          <box focusable focusId="popover-item-1" />
          <box focusable focusId="popover-item-2" />
        </box>
      )
    }

    const dispose = renderScene(root, () => (
      <box>
        <Popover
          open={open()}
          onOpenChange={setOpen}
          renderTrigger={() => <Trigger />}
          renderContent={() => <PopoverContent />}
        />
      </box>
    ))

    try {
      setFocusedId("trigger-btn")
      expect(focusedId()).toBe("trigger-btn")

      // Open popover
      setOpen(true)

      // Active focus scope is now isolated for the popover content,
      // and focus automatically enters the first item in the new scope.
      expect(focusedId()).toBe("popover-item-1")

      // Tab navigation stays within the popover focus scope
      dispatchInput({
        type: "key",
        key: "tab",
        char: "\t",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(focusedId()).toBe("popover-item-2")

      // Tab wraps around within the popover scope, does not escape to trigger-btn
      dispatchInput({
        type: "key",
        key: "tab",
        char: "\t",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(focusedId()).toBe("popover-item-1")
    } finally {
      dispose()
    }
  })

  test("pressing Escape dismisses popover via onOpenChange(false)", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)

    const dispose = renderScene(root, () => (
      <Popover
        open={open()}
        onOpenChange={setOpen}
        renderTrigger={() => <box />}
        renderContent={() => <box />}
      />
    ))

    try {
      expect(open()).toBe(true)

      dispatchInput({
        type: "key",
        key: "escape",
        char: "",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })

      expect(open()).toBe(false)
    } finally {
      dispose()
    }
  })

  test("restores focus to trigger element when popover closes", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(false)

    function Trigger() {
      useFocus({ id: "trigger-btn" })
      return <box focusable focusId="trigger-btn" />
    }

    function PopoverContent() {
      useFocus({ id: "popover-item" })
      return <box focusable focusId="popover-item" />
    }

    const dispose = renderScene(root, () => (
      <box>
        <Popover
          open={open()}
          onOpenChange={setOpen}
          renderTrigger={() => <Trigger />}
          renderContent={() => <PopoverContent />}
        />
      </box>
    ))

    try {
      setFocusedId("trigger-btn")
      expect(focusedId()).toBe("trigger-btn")

      // Open popover
      setOpen(true)
      setFocusedId("popover-item")
      expect(focusedId()).toBe("popover-item")

      // Close popover
      setOpen(false)

      // Focus should be restored to trigger element
      expect(focusedId()).toBe("trigger-btn")
    } finally {
      dispose()
    }
  })

  test("LIFO coordination: Escape closes Popover first when opened inside Dialog", () => {
    const root = createNode("root")
    const [dialogOpen, setDialogOpen] = createSignal(true)
    const [popoverOpen, setPopoverOpen] = createSignal(false)

    function DialogBody() {
      useFocus({ id: "dialog-trigger" })
      return (
        <Dialog.Content>
          <Popover
            open={popoverOpen()}
            onOpenChange={setPopoverOpen}
            renderTrigger={() => <box focusable focusId="dialog-trigger" />}
            renderContent={() => {
              useFocus({ id: "popover-inner" })
              return <box focusable focusId="popover-inner" />
            }}
          />
        </Dialog.Content>
      )
    }

    const dispose = renderScene(root, () => (
      <box>
        {dialogOpen() ? (
          <Dialog onClose={() => setDialogOpen(false)}>
            <Dialog.Overlay />
            <DialogBody />
          </Dialog>
        ) : null}
      </box>
    ))

    try {
      expect(dialogOpen()).toBe(true)
      expect(popoverOpen()).toBe(false)

      // Open the popover inside the dialog
      setPopoverOpen(true)
      expect(popoverOpen()).toBe(true)

      // First Escape: must close only the Popover (top of LIFO stack)
      dispatchInput({
        type: "key",
        key: "escape",
        char: "",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(popoverOpen()).toBe(false)
      expect(dialogOpen()).toBe(true)

      // Second Escape: now Dialog is top of stack, closes Dialog
      dispatchInput({
        type: "key",
        key: "escape",
        char: "",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(dialogOpen()).toBe(false)
    } finally {
      dispose()
    }
  })

  test("non-modal mode (modal={false}): does not isolate focus or render outside plane, but Escape dismisses", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(false)

    function Trigger() {
      useFocus({ id: "trigger-btn" })
      return <box focusable focusId="trigger-btn" />
    }

    function PopoverContent() {
      useFocus({ id: "popover-item" })
      return <box focusable focusId="popover-item" />
    }

    const dispose = renderScene(root, () => (
      <box>
        <Popover
          open={open()}
          modal={false}
          onOpenChange={setOpen}
          renderTrigger={() => <Trigger />}
          renderContent={() => <PopoverContent />}
        />
      </box>
    ))

    try {
      setFocusedId("trigger-btn")
      expect(focusedId()).toBe("trigger-btn")

      // Open non-modal popover
      setOpen(true)

      const popoverRoot = root.children[0].children[0]
      // Outside capture plane should NOT exist in non-modal mode
      const outsidePlane = popoverRoot.children.find(
        (c) => c.props.floating === "root" && c.props.zIndex === 9997
      )
      expect(outsidePlane).toBeUndefined()

      // Focus was not cleared or trapped in a new scope
      expect(focusedId()).toBe("trigger-btn")

      // Escape key still dismisses the non-modal popover
      dispatchInput({
        type: "key",
        key: "escape",
        char: "",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(open()).toBe(false)
    } finally {
      dispose()
    }
  })
})
