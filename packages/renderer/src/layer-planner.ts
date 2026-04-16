import { CMD, type RenderCommand } from "./clay"
import type { TGENode } from "./node"

export type LayerSlot = {
  key: string
  z: number
  cmdIndices: number[]
}

export type LayerBoundary = {
  path: string
  nodeId: number
  z: number
  isScroll: boolean
  hasBg: boolean
  insideScroll: boolean
}

export function resolveNodeByPath(fromRoot: TGENode, path: string): TGENode | null {
  const parts = path.split(".")
  let node = fromRoot
  for (let i = 1; i < parts.length; i++) {
    const idx = parseInt(parts[i])
    if (isNaN(idx) || idx >= node.children.length) return null
    node = node.children[idx]
  }
  return node
}

export function collectAllTexts(node: TGENode, collectText: (node: TGENode) => string): string[] {
  const result: string[] = []
  function walk(n: TGENode) {
    if (n.kind === "text") {
      const t = n.text || collectText(n)
      if (t) result.push(t)
      return
    }
    for (const child of n.children) walk(child)
  }
  walk(node)
  return result
}

export function findLayerBoundaries(
  node: TGENode,
  path: string,
  result: LayerBoundary[],
  nextZ: () => number,
  shouldPromoteLayer: (node: TGENode) => boolean,
  insideScroll = false,
) {
  if (node.kind === "text") return
  const isScroll = !!(node.props.scrollX || node.props.scrollY)
  const isInteractionLayer = shouldPromoteLayer(node)
  if (node.props.layer === true || isInteractionLayer) {
    result.push({
      path,
      nodeId: node.id,
      z: nextZ(),
      isScroll,
      hasBg: node.props.backgroundColor !== undefined,
      insideScroll,
    })
  }
  const childInsideScroll = insideScroll || isScroll
  for (let i = 0; i < node.children.length; i++) {
    findLayerBoundaries(node.children[i], `${path}.${i}`, result, nextZ, shouldPromoteLayer, childInsideScroll)
  }
}

export function claimScissorCommands(commands: RenderCommand[]) {
  const scissorStarts: number[] = []
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type === CMD.SCISSOR_START) scissorStarts.push(i)
  }
  return scissorStarts
}
