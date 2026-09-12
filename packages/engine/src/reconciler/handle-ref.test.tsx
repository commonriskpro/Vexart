import { describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { createNode, type TGENode } from "../ffi/node"
import { createHandle, getHandleNode, type NodeHandle } from "./handle"
import { useInteractionLayer } from "./interaction"
import { render, setProp } from "./reconciler"

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      directive: string
    }
  }
}

describe("NodeHandle refs", () => {
  test("direct JSX refs receive the cached NodeHandle", () => {
    const root = createNode("root")
    let received: NodeHandle | undefined

    const dispose = render(() => <box ref={(handle) => { received = handle }} /> as unknown as TGENode, root)
    const node = root.children[0]

    expect(received).toBe(createHandle(node))
    expect(getHandleNode(received!)).toBe(node)
    dispose()
  })

  test("spread refs receive the cached NodeHandle", () => {
    const root = createNode("root")
    let received: NodeHandle | undefined
    const props = { ref: (handle: NodeHandle) => { received = handle } }

    const dispose = render(() => <box {...props} /> as unknown as TGENode, root)
    const node = root.children[0]

    expect(received).toBe(createHandle(node))
    expect(getHandleNode(received!)).toBe(node)
    dispose()
  })

  test("setProp refs receive the cached NodeHandle", () => {
    const node = createNode("box")
    let received: NodeHandle | undefined

    setProp(node, "ref", (handle: NodeHandle) => { received = handle })

    expect(received).toBe(createHandle(node))
  })

  test("spread keeps live getters and adapts a late ref", () => {
    const root = createNode("root")
    const [color, setColor] = createSignal(0x112233ff)
    const [ref, setRef] = createSignal<((handle: NodeHandle) => void) | undefined>()
    let received: NodeHandle | undefined
    const props = {
      get backgroundColor() { return color() },
      get ref() { return ref() },
    }

    const dispose = render(() => <box {...props} /> as unknown as TGENode, root)
    const node = root.children[0]

    expect(node.props.backgroundColor).toBe(0x112233ff)
    setColor(0xaabbccff)
    expect(node.props.backgroundColor).toBe(0xaabbccff)

    const callback = (handle: NodeHandle) => { received = handle }
    setRef(() => callback)
    expect(received).toBe(createHandle(node))

    let replacementCalls = 0
    const replacement = () => { replacementCalls += 1 }
    setRef(() => replacement)
    expect(replacementCalls).toBe(1)
    dispose()
  })

  test("directives receive a NodeHandle and preserve their accessor", () => {
    const root = createNode("root")
    let received: NodeHandle | undefined
    let value = ""
    const directive = (handle: NodeHandle, accessor: () => string) => {
      received = handle
      value = accessor()
    }

    // @ts-expect-error Custom runtime directives are not part of the intrinsic prop list.
    const dispose = render(() => <box use:directive={"directive-value"} /> as unknown as TGENode, root)

    expect(received).toBe(createHandle(root.children[0]))
    expect(value).toBe("directive-value")
    dispose()
  })

  test("interaction layers expose handles while updating the retained node internally", () => {
    const node = createNode("box")
    const handle = createHandle(node)
    const interaction = useInteractionLayer()

    interaction.ref(handle)
    expect(interaction.node()).toBe(handle)
    interaction.begin("drag")
    expect(node._interactionMode).toBe("drag")
    interaction.end("drag")
    expect(node._interactionMode).toBe("none")
  })
})
