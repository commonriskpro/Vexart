import { describe, expect, test } from "bun:test"
import type { NativeRenderGraphSnapshot, NativeRenderOpKind, NativeRenderOpSnapshot } from "../ffi/native-render-graph"
import { analyzeNativeRenderGraphCoverage } from "../ffi/native-render-graph"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { canUseNativeRenderGraphForLayer } from "./paint"

function command(type: number, nodeId: number): RenderCommand {
  return {
    type,
    nodeId,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: [255, 255, 255, 255],
    cornerRadius: 0,
    extra1: 0,
    extra2: 0,
  }
}

function op(kind: NativeRenderOpKind, nodeId: number): NativeRenderOpSnapshot {
  return {
    kind,
    nodeId,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: 0xffffffff,
    cornerRadius: 0,
    borderWidth: 0,
    opacity: 1,
    text: kind === "text" ? "hello" : "",
    fontSize: 12,
    fontId: 0,
    materialKey: `pipeline:${kind}`,
    effectKey: "",
    imageSource: "",
    hasGradient: false,
    hasShadow: false,
    hasGlow: false,
    hasFilter: false,
    hasBackdrop: false,
    hasTransform: false,
    hasOpacity: false,
    gradientJson: "",
    shadowJson: "",
    glowJson: "",
    filterJson: "",
    transformJson: "",
    backdropBlur: null,
    backdropBrightness: null,
    backdropContrast: null,
    backdropSaturate: null,
    backdropGrayscale: null,
    backdropInvert: null,
    backdropSepia: null,
    backdropHueRotate: null,
  }
}

function snapshot(ops: NativeRenderOpSnapshot[]): NativeRenderGraphSnapshot {
  return { ops, batches: [] }
}

describe("canUseNativeRenderGraphForLayer", () => {
  test("allows fully covered rect/text layers", () => {
    const graph = snapshot([op("rect", 11), op("text", 12)])
    const commands = [
      command(CMD.RECTANGLE, 1),
      command(CMD.TEXT, 2),
    ]
    const nativeToTs = new Map([[11, 1], [12, 2]])

    expect(canUseNativeRenderGraphForLayer(graph, commands, nativeToTs)).toBe(true)
    expect(analyzeNativeRenderGraphCoverage(graph, commands, nativeToTs)).toEqual({
      renderableCommands: 2,
      coveredCommands: 2,
      fullyCovered: true,
    })
  })

  test("allows partially covered layers but marks them as not fully covered", () => {
    const graph = snapshot([op("rect", 11)])
    const commands = [
      command(CMD.RECTANGLE, 1),
      command(CMD.TEXT, 2),
    ]
    const nativeToTs = new Map([[11, 1]])

    expect(canUseNativeRenderGraphForLayer(graph, commands, nativeToTs)).toBe(true)
    expect(analyzeNativeRenderGraphCoverage(graph, commands, nativeToTs)).toEqual({
      renderableCommands: 2,
      coveredCommands: 1,
      fullyCovered: false,
    })
  })

  test("allows covered effect image and canvas layers", () => {
    const graph = snapshot([op("effect", 21), op("image", 22), op("canvas", 23)])
    const commands = [
      command(CMD.RECTANGLE, 3),
      command(CMD.RECTANGLE, 4),
      command(CMD.RECTANGLE, 5),
    ]
    const nativeToTs = new Map([[21, 3], [22, 4], [23, 5]])

    expect(canUseNativeRenderGraphForLayer(graph, commands, nativeToTs)).toBe(true)
    expect(analyzeNativeRenderGraphCoverage(graph, commands, nativeToTs).fullyCovered).toBe(true)
  })
})
