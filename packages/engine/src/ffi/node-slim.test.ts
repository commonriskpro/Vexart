import { describe, expect, test } from "bun:test"
import {
  createNode,
  createTextNode,
  ensureCanvasExtra,
  ensureCompositorExtra,
  ensureImageExtra,
  ensureTransformExtra,
  TGENodeImpl,
} from "./node"

describe("Slim TGENode shape (core + lazy bags)", () => {
  test("in-object core properties count is <= 24 (well below V8 32 in-object limit)", () => {
    const box = createNode("box")
    const text = createNode("text")

    const boxKeys = Object.keys(box)
    const textKeys = Object.keys(text)

    // Core properties fit completely in-object (<32 properties)
    expect(boxKeys.length).toBeLessThanOrEqual(24)
    expect(textKeys.length).toBeLessThanOrEqual(24)
    expect(boxKeys.length).toBe(23)
    expect(textKeys.length).toBe(23)

    // Must be instance of TGENodeImpl with prototype accessors
    expect(box).toBeInstanceOf(TGENodeImpl)
    expect(text).toBeInstanceOf(TGENodeImpl)
  })

  test("dead measurement properties are removed from node and prototype", () => {
    const node = createNode("box")
    expect("_lastMeasuredText" in node).toBe(false)
    expect("_lastMeasuredFontId" in node).toBe(false)
    expect("_lastMeasuredFontSize" in node).toBe(false)
    expect("_lastMeasurement" in node).toBe(false)
  })

  test("lazy bags are unallocated on newly created box and text nodes", () => {
    const node = createNode("box")
    expect(Object.prototype.hasOwnProperty.call(node, "_transforms")).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(node, "_compositor")).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(node, "_imageExtra")).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(node, "_canvasExtra")).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(node, "_dirtyTracker")).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(node, "_rawInteractionMode")).toBe(false)

    expect(node._transforms).toBeUndefined()
    expect(node._compositor).toBeUndefined()
    expect(node._imageExtra).toBeUndefined()
    expect(node._canvasExtra).toBeUndefined()
  })

  test("media extras instantiate lazily or on specific intrinsics", () => {
    const img = createNode("img")
    expect(img._imageExtra).toBeDefined()
    expect(img._imageExtra?.state).toBe("idle")
    expect(img._canvasExtra).toBeUndefined()

    const canvas = createNode("canvas")
    expect(canvas._canvasExtra).toBeDefined()
    expect(canvas._canvasExtra?.displayListCommands).toBeNull()
    expect(canvas._imageExtra).toBeUndefined()

    const box = createNode("box")
    expect(box._imageExtra).toBeUndefined()
    ensureImageExtra(box)
    expect(box._imageExtra).toBeDefined()
    expect(box._imageExtra?.state).toBe("idle")

    expect(box._canvasExtra).toBeUndefined()
    ensureCanvasExtra(box)
    expect(box._canvasExtra).toBeDefined()
  })

  test("transform bag instantiates lazily on demand without allocating for null", () => {
    const node = createNode("box")

    // Reading returns null without allocating
    expect(node._transform).toBeNull()
    expect(node._transformInverse).toBeNull()
    expect(node._accTransform).toBeNull()
    expect(node._accTransformInverse).toBeNull()
    expect(node._transforms).toBeUndefined()

    // Setting null does not allocate bag
    node._transform = null
    node._transformInverse = null
    node._accTransform = null
    node._accTransformInverse = null
    expect(node._transforms).toBeUndefined()

    // Setting a matrix instantiates _transforms
    const matrix = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    node._transform = matrix
    expect(node._transforms).toBeDefined()
    expect(node._transforms?.local).toBe(matrix)
    expect(node._transform).toBe(matrix)
    expect(node._transformInverse).toBeNull()

    const inv = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    node._transformInverse = inv
    expect(node._transforms?.localInverse).toBe(inv)
    expect(node._transformInverse).toBe(inv)

    const acc = new Float64Array([2, 0, 0, 0, 2, 0, 0, 0, 1])
    node._accTransform = acc
    expect(node._transforms?.acc).toBe(acc)
    expect(node._accTransform).toBe(acc)

    const accInv = new Float64Array([0.5, 0, 0, 0, 0.5, 0, 0, 0, 1])
    node._accTransformInverse = accInv
    expect(node._transforms?.accInverse).toBe(accInv)
    expect(node._accTransformInverse).toBe(accInv)

    // Setting fields back to null preserves bag but clears references
    node._transform = null
    expect(node._transform).toBeNull()
    expect(node._transforms?.local).toBeNull()

    // ensureTransformExtra returns existing or creates fresh
    const extra = ensureTransformExtra(node)
    expect(extra).toBe(node._transforms!)

    const fresh = createNode("box")
    const created = ensureTransformExtra(fresh)
    expect(created).toBeDefined()
    expect(fresh._transforms).toBe(created)
  })

  test("compositor heuristics instantiate lazily on demand without allocating for defaults", () => {
    const node = createNode("box")

    // Reading returns defaults without allocating
    expect(node._stableFrameCount).toBe(0)
    expect(node._unstableFrameCount).toBe(0)
    expect(node._autoLayer).toBe(false)
    expect(node._compositor).toBeUndefined()

    // Setting zero / false does not allocate
    node._stableFrameCount = 0
    node._unstableFrameCount = 0
    node._autoLayer = false
    expect(node._compositor).toBeUndefined()

    // Setting non-zero stable frames allocates
    node._stableFrameCount = 5
    expect(node._compositor).toBeDefined()
    expect(node._compositor?.stableFrames).toBe(5)
    expect(node._stableFrameCount).toBe(5)
    expect(node._unstableFrameCount).toBe(0)
    expect(node._autoLayer).toBe(false)

    // Setting autoLayer updates bag
    node._autoLayer = true
    expect(node._compositor?.autoLayer).toBe(true)
    expect(node._autoLayer).toBe(true)

    // ensureCompositorExtra returns existing
    expect(ensureCompositorExtra(node)).toBe(node._compositor!)

    const fresh = createNode("box")
    const created = ensureCompositorExtra(fresh)
    expect(created.stableFrames).toBe(0)
    expect(fresh._compositor).toBe(created)
  })

  test("interactionMode defaults to 'none' without own property and cleans up on reset", () => {
    const node = createNode("box")
    expect(node._interactionMode).toBe("none")
    expect(Object.prototype.hasOwnProperty.call(node, "_rawInteractionMode")).toBe(false)

    node._interactionMode = "drag"
    expect(node._interactionMode).toBe("drag")

    node._interactionMode = "none"
    expect(node._interactionMode).toBe("none")
    expect(Object.prototype.hasOwnProperty.call(node, "_rawInteractionMode")).toBe(false)
  })
})
