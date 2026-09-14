import { expect, test } from "bun:test"

import { createSignal } from "solid-js"
import { measureText, type NodeHandle } from "vexart"
import { captureDemo } from "./capture"
import { DemoFooter, Label } from "./shared"

const content = (node: NodeHandle): string => node.text + node.children.map(content).join("")
const labels = (node: NodeHandle): NodeHandle[] => [
  ...(node.kind === "text" && (node.props as any).fontSize ? [node] : []),
  ...node.children.flatMap(labels),
]

for (const [width, height] of [[1536, 1024], [1200, 800]] as const) {
  test(`keeps measured text and shortcut keycaps on one line at ${width} × ${height}`, async () => {
    let rootHandle: NodeHandle | undefined
    await captureDemo(() => <box width={width} height={height} direction="column" ref={(handle: NodeHandle) => { rootHandle = handle }}>
      <box width="100%" height="grow">
        <Label x={24} y={60} size={20} weight={600}>Mission Control</Label>
        <Label x={24} y={100} size={15}>Running</Label>
        <Label x={24} y={140} size={16} mono>13:08:21</Label>
      </box>
      <DemoFooter hints={[{ keys: "Space", label: "Pause stream" }, { keys: "Esc", label: "Back" }]} />
    </box>, width, height, async () => {
      if (!rootHandle) throw new Error("Typography scene was not mounted")
      const root = rootHandle
      const nodes = labels(root).filter(node => ["Mission Control", "Running", "13:08:21", "Space", "Esc", "Back"].includes(content(node)))
      expect(nodes).toHaveLength(6)
      for (const node of nodes) {
        const size = (node.props as any).fontSize!
        const measured = measureText(content(node), { fontSize: size, fontFamily: (node.props as any).fontFamily, fontWeight: (node.props as any).fontWeight })
        expect(Number.isInteger(size)).toBe(true)
        expect(node.layout.width).toBeGreaterThanOrEqual(measured.width)
        expect(node.layout.height).toBeLessThan(measured.height * 2)
      }
    })
  })
}

test("renders DemoFooter and standard components across viewport updates", async () => {
  let rootHandle: NodeHandle | undefined
  let resize: (() => void) | undefined
  const scene = () => {
    const [size, setSize] = createSignal({ width: 1536, height: 1024 })
    resize = () => setSize({ width: 1200, height: 800 })
    return <box width={size().width} height={size().height} direction="column" ref={(handle: NodeHandle) => { rootHandle = handle }}>
      <box width="100%" height="grow">
        <Label x={640} y={500} size={20}>Standard label</Label>
      </box>
      <DemoFooter hints={[{ keys: "Tab", label: "Next" }]} />
    </box>
  }
  await captureDemo(scene, 1536, 1024, async ({ frame }) => {
    if (!rootHandle || !resize) throw new Error("Resize scene was not mounted")
    const root = rootHandle
    const before = labels(root).find(node => content(node) === "Standard label")
    if (!before) throw new Error("Resize label was not mounted")
    expect((before.props as any).fontSize).toBe(20)
    expect((before.parent?.props as any).floatOffset).toEqual({ x: 640, y: 500 })
    resize()
    await frame()
    const after = labels(root).find(node => content(node) === "Standard label")
    expect(after).toBe(before)
    expect((after?.props as any).fontSize).toBe(20)
    expect((after?.parent?.props as any).floatOffset).toEqual({ x: 640, y: 500 })
    expect(rootHandle.layout.width).toBe(1200)
    expect(rootHandle.layout.height).toBe(800)
  })
})
