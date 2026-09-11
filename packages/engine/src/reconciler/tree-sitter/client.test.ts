import { describe, expect, test } from "bun:test"
import { TreeSitterClient, getTreeSitterClient } from "./client"

describe("TreeSitterClient", () => {
  test("calling destroy() rejects all pending highlightOnce requests with 'Tree-sitter worker terminated'", async () => {
    const client = new TreeSitterClient()
    await client.initialize()

    const worker = (client as any).worker
    expect(worker).toBeDefined()

    // Prevent worker from answering so requests remain pending
    worker.postMessage = () => {}

    const p1 = client.highlightOnce("const a = 1;", "typescript")
    const p2 = client.highlightOnce("const b = 2;", "typescript")

    expect((client as any).callbacks.size).toBe(2)

    let err1: Error | undefined
    let err2: Error | undefined
    p1.catch((e) => { err1 = e })
    p2.catch((e) => { err2 = e })

    client.destroy()

    await Promise.allSettled([p1, p2])

    expect(err1?.message).toBe("Tree-sitter worker terminated")
    expect(err2?.message).toBe("Tree-sitter worker terminated")
    expect((client as any).callbacks.size).toBe(0)
    expect(client.isReady()).toBe(false)
  })

  test("HIGHLIGHT_ERROR causes highlightOnce to reject with the worker error message", async () => {
    const client = new TreeSitterClient()
    await client.initialize()

    const worker = (client as any).worker
    expect(worker).toBeDefined()

    // Intercept postMessage to simulate worker returning HIGHLIGHT_ERROR
    const errorMessage = "Parsing failed: unexpected syntax token"
    worker.postMessage = (msg: any) => {
      if (msg.type === "HIGHLIGHT") {
        queueMicrotask(() => {
          worker.onmessage?.({
            data: {
              type: "HIGHLIGHT_ERROR",
              id: msg.id,
              error: errorMessage,
            },
          } as MessageEvent)
        })
      }
    }

    await expect(client.highlightOnce("const err = ;", "typescript")).rejects.toThrow(errorMessage)
    expect((client as any).callbacks.size).toBe(0)
    client.destroy()
  })

  test("calling highlightOnce on a destroyed client re-initializes cleanly", async () => {
    const client = new TreeSitterClient()
    await client.initialize()

    const res1 = await client.highlightOnce("const x: number = 1;", "typescript")
    expect(res1.length).toBeGreaterThan(0)

    client.destroy()
    expect(client.isReady()).toBe(false)

    // Re-initializes cleanly on subsequent highlightOnce
    const res2 = await client.highlightOnce("const y: string = 'hello';", "typescript")
    expect(res2.length).toBeGreaterThan(0)
    expect(client.isReady()).toBe(true)

    client.destroy()
  })

  test("calling highlightOnce on a client without worker rejects with 'Tree-sitter worker is not available'", async () => {
    const client = new TreeSitterClient()
    client.destroy()

    // Bypassing re-init or worker initialization
    client.initialize = async () => {}

    await expect(client.highlightOnce("const x = 1;", "typescript")).rejects.toThrow(
      "Tree-sitter worker is not available"
    )
    expect((client as any).callbacks.size).toBe(0)
  })

  test("destroy() clears singleton reference so getTreeSitterClient returns a new instance", () => {
    const s1 = getTreeSitterClient()
    expect(getTreeSitterClient()).toBe(s1)

    s1.destroy()

    const s2 = getTreeSitterClient()
    expect(s2).not.toBe(s1)
    s2.destroy()
  })
})
