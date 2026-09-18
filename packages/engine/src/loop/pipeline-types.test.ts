import { describe, expect, it } from "bun:test"
import { CMD } from "../ffi/render-graph"
import { createNode } from "../ffi/node"
import {
  createClipContext,
  createLayerContext,
  createPipelineContext,
  emitOp,
  getCurrentClipBounds,
  popClip,
  popLayer,
  pushClip,
  pushLayer,
  restoreLayouts,
  snapshotLayouts,
  type ClipEntry,
  type RenderGraphOp,
} from "./pipeline-types"

function createDummyOp(id: number): RenderGraphOp {
  return {
    kind: "rectangle",
    renderObjectId: id,
    type: CMD.RECTANGLE,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    color: 0xffffffff,
    cornerRadius: 0,
    extra1: 0,
    extra2: 0,
    radius: 0,
    image: null,
    canvas: null,
    effect: null,
  }
}

describe("pipeline-types", () => {
  describe("snapshotLayouts and restoreLayouts", () => {
    it("captures and restores layout rects accurately", () => {
      const nodeA = createNode("box")
      nodeA.layout = { x: 10, y: 20, width: 100, height: 200 }
      const nodeB = createNode("box")
      nodeB.layout = { x: 30, y: 40, width: 150, height: 250 }

      const snapshot = snapshotLayouts([nodeA, nodeB])

      expect(snapshot.nodes).toHaveLength(2)
      expect(snapshot.data).toHaveLength(8)
      expect(snapshot.data[0]).toBe(10)
      expect(snapshot.data[1]).toBe(20)
      expect(snapshot.data[2]).toBe(100)
      expect(snapshot.data[3]).toBe(200)
      expect(snapshot.data[4]).toBe(30)
      expect(snapshot.data[5]).toBe(40)
      expect(snapshot.data[6]).toBe(150)
      expect(snapshot.data[7]).toBe(250)

      // Modify layouts
      nodeA.layout.x = 999
      nodeA.layout.y = 888
      nodeA.layout.width = 777
      nodeA.layout.height = 666

      nodeB.layout.x = 555
      nodeB.layout.y = 444
      nodeB.layout.width = 333
      nodeB.layout.height = 222

      // Restore
      restoreLayouts(snapshot)

      expect(nodeA.layout).toEqual({ x: 10, y: 20, width: 100, height: 200 })
      expect(nodeB.layout).toEqual({ x: 30, y: 40, width: 150, height: 250 })
    })

    it("handles empty node lists safely", () => {
      const snapshot = snapshotLayouts([])
      expect(snapshot.nodes).toHaveLength(0)
      expect(snapshot.data).toHaveLength(0)

      expect(() => restoreLayouts(snapshot)).not.toThrow()
    })

    it("supports restoreLayouts overload with nodes argument", () => {
      const node = createNode("box")
      node.layout = { x: 5, y: 15, width: 50, height: 60 }
      const snapshot = snapshotLayouts([node])

      node.layout.x = 100
      restoreLayouts([node], snapshot)

      expect(node.layout.x).toBe(5)
    })
  })

  describe("ClipContext", () => {
    it("returns null when clip stack is empty", () => {
      const ctx = createClipContext()
      expect(getCurrentClipBounds(ctx)).toBeNull()
    })

    it("returns entry bounds for a single clip", () => {
      const ctx = createClipContext()
      const clip: ClipEntry = { x: 10, y: 20, width: 100, height: 200, nodeId: 1 }
      pushClip(ctx, clip)

      expect(getCurrentClipBounds(ctx)).toEqual({ x: 10, y: 20, width: 100, height: 200 })
    })

    it("computes the intersection of two overlapping clips", () => {
      const ctx = createClipContext()
      pushClip(ctx, { x: 0, y: 0, width: 100, height: 100, nodeId: 1 })
      pushClip(ctx, { x: 40, y: 30, width: 100, height: 100, nodeId: 2 })

      expect(getCurrentClipBounds(ctx)).toEqual({ x: 40, y: 30, width: 60, height: 70 })
    })

    it("computes empty intersection for non-overlapping clips", () => {
      const ctx = createClipContext()
      pushClip(ctx, { x: 0, y: 0, width: 50, height: 50, nodeId: 1 })
      pushClip(ctx, { x: 100, y: 100, width: 50, height: 50, nodeId: 2 })

      const bounds = getCurrentClipBounds(ctx)
      expect(bounds).not.toBeNull()
      expect(bounds?.width).toBe(0)
      expect(bounds?.height).toBe(0)
    })

    it("restores previous clip bounds on popClip", () => {
      const ctx = createClipContext()
      const clip1: ClipEntry = { x: 10, y: 10, width: 200, height: 200, nodeId: 1 }
      const clip2: ClipEntry = { x: 50, y: 50, width: 50, height: 50, nodeId: 2 }

      pushClip(ctx, clip1)
      expect(getCurrentClipBounds(ctx)).toEqual({ x: 10, y: 10, width: 200, height: 200 })

      pushClip(ctx, clip2)
      expect(getCurrentClipBounds(ctx)).toEqual({ x: 50, y: 50, width: 50, height: 50 })

      popClip(ctx)
      expect(getCurrentClipBounds(ctx)).toEqual({ x: 10, y: 10, width: 200, height: 200 })

      popClip(ctx)
      expect(getCurrentClipBounds(ctx)).toBeNull()
    })
  })

  describe("LayerContext", () => {
    it("emits ops to the root bucket by default", () => {
      const ctx = createLayerContext()
      expect(ctx.stack).toHaveLength(1)
      expect(ctx.stack[0].key).toBe("root")
      expect(ctx.allBuckets).toHaveLength(1)

      const op = createDummyOp(1)
      emitOp(ctx, op)

      expect(ctx.stack[0].ops).toHaveLength(1)
      expect(ctx.stack[0].ops[0]).toBe(op)
    })

    it("routes ops to the pushed layer bucket and back to root on pop", () => {
      const ctx = createLayerContext()
      const opRoot1 = createDummyOp(1)
      const opLayer1 = createDummyOp(2)
      const opRoot2 = createDummyOp(3)

      emitOp(ctx, opRoot1)

      pushLayer(ctx, "layer:child", 42)
      expect(ctx.stack).toHaveLength(2)
      expect(ctx.allBuckets).toHaveLength(2)

      emitOp(ctx, opLayer1)
      expect(ctx.stack[1].ops).toHaveLength(1)
      expect(ctx.stack[1].ops[0]).toBe(opLayer1)
      expect(ctx.stack[0].ops).toHaveLength(1)

      popLayer(ctx)
      expect(ctx.stack).toHaveLength(1)
      expect(ctx.stack[0].key).toBe("root")

      emitOp(ctx, opRoot2)
      expect(ctx.stack[0].ops).toHaveLength(2)
      expect(ctx.stack[0].ops[1]).toBe(opRoot2)

      expect(ctx.allBuckets).toHaveLength(2)
      expect(ctx.allBuckets[0].key).toBe("root")
      expect(ctx.allBuckets[1].key).toBe("layer:child")
      expect(ctx.allBuckets[1].ops).toHaveLength(1)
    })

    it("does not pop the root bucket if popLayer is called excessively", () => {
      const ctx = createLayerContext()
      popLayer(ctx)
      expect(ctx.stack).toHaveLength(1)
      expect(ctx.stack[0].key).toBe("root")
    })
  })

  describe("PipelineContext", () => {
    it("creates a default pipeline context", () => {
      const ctx = createPipelineContext()
      expect(ctx.absX).toBe(0)
      expect(ctx.absY).toBe(0)
      expect(ctx.scrollContainerId).toBe(0)
      expect(ctx.insideTransform).toBe(false)
      expect(ctx.dfsIndex).toBe(0)
      expect(ctx.clip.stack).toHaveLength(0)
      expect(ctx.layer.stack).toHaveLength(1)
      expect(ctx.layer.allBuckets).toHaveLength(1)
    })

    it("allows operations directly using PipelineContext", () => {
      const ctx = createPipelineContext()

      pushClip(ctx, { x: 5, y: 10, width: 80, height: 90, nodeId: 10 })
      expect(getCurrentClipBounds(ctx)).toEqual({ x: 5, y: 10, width: 80, height: 90 })

      popClip(ctx)
      expect(getCurrentClipBounds(ctx)).toBeNull()

      const op = createDummyOp(99)
      emitOp(ctx, op)
      expect(ctx.layer.stack[0].ops).toHaveLength(1)

      pushLayer(ctx, "layer:sub", 100)
      const opSub = createDummyOp(101)
      emitOp(ctx, opSub)
      expect(ctx.layer.stack[1].ops).toHaveLength(1)

      popLayer(ctx)
      expect(ctx.layer.stack).toHaveLength(1)
    })
  })
})
