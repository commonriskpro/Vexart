import { expect, test } from "bun:test"
import * as api from "./public"
import type { NodeHandle } from "./public"

// @ts-expect-error TGENode is an engine implementation type, not public API.
type _PublicTGENode = import("./public").TGENode

type _NodeHandleKeys = keyof NodeHandle
type _NodeHandleHasNoRawNode = "_node" extends _NodeHandleKeys ? never : true
const nodeHandleHasNoRawNode: _NodeHandleHasNoRawNode = true

test("does not expose retained engine implementation", () => {
  for (const name of [
    "createNode",
    "createHandle",
    "insertChild",
    "removeChild",
    "setFocusedId",
    "registerNodeFocusable",
    "updateNodeFocusEntry",
    "unregisterNodeFocusable",
    "getNodeFocusId",
    "createRenderLoop",
    "createElement",
    "insertNode",
    "setProp",
    "spread",
    "buildRenderGraphFrame",
    "setRendererBackend",
    "createGpuRendererBackend",
    "createParser",
    "debugState",
    "debugDumpCulledNodes",
    "probeShm",
  ]) {
    expect(name in api).toBe(false)
  }
})

test("keeps user-facing engine contracts", () => {
  for (const name of [
    "mount",
    "createTerminal",
    "useFocus",
    "useDrag",
    "createTransition",
    "CanvasContext",
    "createParticleSystem",
    "registerFont",
    "createComponent",
    "createContext",
  ]) {
    expect(name in api).toBe(true)
  }
})
