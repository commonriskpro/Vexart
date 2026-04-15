import type { RenderGraphOp } from "./render-graph"
import type { RendererBackend, RendererBackendPaintContext } from "./renderer-backend"

export function createCpuRendererBackend(paintOp: (ctx: RendererBackendPaintContext, op: RenderGraphOp) => void): RendererBackend {
  return {
    name: "cpu-render-graph",
    paint(ctx) {
      for (const op of ctx.graph.ops) {
        paintOp(ctx, op)
      }
    },
  }
}
