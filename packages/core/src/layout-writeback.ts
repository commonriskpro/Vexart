import { clay, CMD, type RenderCommand } from "./clay"
import type { TGENode } from "./node"

export function applyCommandLayout(node: TGENode, cmd: RenderCommand) {
  node.layout.x = cmd.x
  node.layout.y = cmd.y
  node.layout.width = cmd.width
  node.layout.height = cmd.height
}

export function writeLayoutFromElementIds(boxNodes: TGENode[]) {
  for (const node of boxNodes) {
    const hasMouseProps = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut
    const isInteractive = node.props.focusable || node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle || node.props.onPress || hasMouseProps
    const needsLayoutId = isInteractive || node.props.layer === true
    if (!needsLayoutId) continue
    const isScroll = node.props.scrollX || node.props.scrollY
    const clayLabel = isScroll && node.props.scrollId
      ? node.props.scrollId
      : `tge-node-${node.id}`
    const data = clay.getElementData(clayLabel)
    if (!data.found) continue
    node.layout.x = data.x
    node.layout.y = data.y
    node.layout.width = data.width
    node.layout.height = data.height
  }
}

export function writeSequentialCommandLayout(commands: RenderCommand[], rectNodes: TGENode[], textNodes: TGENode[]) {
  let rectIdx = 0
  let textIdx = 0
  for (const cmd of commands) {
    if (cmd.type === CMD.RECTANGLE && rectIdx < rectNodes.length) {
      applyCommandLayout(rectNodes[rectIdx], cmd)
      rectIdx++
      continue
    }
    if (cmd.type === CMD.TEXT && textIdx < textNodes.length) {
      applyCommandLayout(textNodes[textIdx], cmd)
      textIdx++
    }
  }
}
