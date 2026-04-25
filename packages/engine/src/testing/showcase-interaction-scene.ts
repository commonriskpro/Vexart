import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"

export const SHOWCASE_INTERACTION_W = 360
export const SHOWCASE_INTERACTION_H = 140

function box(props: TGEProps, kids: TGENode[] = []) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  for (const child of kids) insertChild(node, child)
  return node
}

function text(value: string, props: TGEProps = {}) {
  const node = createTextNode(value)
  node.props = props
  return node
}

export function createShowcaseInteractionScene() {
  const panel = box({ width: 120, height: 40, backgroundColor: 0x223047ff, cornerRadius: 10 })
  const label = text("VISUAL", { color: 0xffffffff, fontSize: 14 })

  const activate = () => {
    panel.props.backgroundColor = 0xdc2626ff
    panel.props.width = 180
    panel.props.height = 40
    panel._widthSizing = parseSizing(180)
    panel._heightSizing = parseSizing(40)
    label.text = "ACTIVE"
  }

  const actionButton = box({
    width: 100,
    height: 32,
    backgroundColor: 0x334155ff,
    cornerRadius: 8,
    focusable: true,
    onPress: activate,
    alignX: "center",
    alignY: "center",
  }, [text("Activate", { color: 0xffffffff, fontSize: 12 })])

  return box({
    width: SHOWCASE_INTERACTION_W,
    height: SHOWCASE_INTERACTION_H,
    backgroundColor: 0x0f172aff,
    direction: "column",
    gap: 16,
    padding: 16,
  }, [
    actionButton,
    panel,
    label,
  ])
}
