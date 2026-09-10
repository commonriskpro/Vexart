import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { probeFile } from "./kitty"

describe("probeFile temp file lifecycle", () => {
  const probeFilePath = path.join(os.tmpdir(), `tty-graphics-protocol-probe-${process.pid}`)

  test("cleans up temp file on successful probe response", async () => {
    let dataHandler: ((data: Buffer) => void) | undefined
    let writeCalled = false

    const promise = probeFile(
      () => {
        writeCalled = true
        // Simulate immediate terminal reply
        queueMicrotask(() => {
          dataHandler?.(Buffer.from("\x1b_Gi=33;OK\x1b\\"))
        })
      },
      (handler) => { dataHandler = handler },
      () => { dataHandler = undefined },
      1000,
    )

    const result = await promise
    expect(result).toBe(true)
    expect(writeCalled).toBe(true)
    expect(fs.existsSync(probeFilePath)).toBe(false)
  })

  test("cleans up temp file on probe timeout", async () => {
    let dataHandler: ((data: Buffer) => void) | undefined
    let writeCalled = false

    const promise = probeFile(
      () => { writeCalled = true },
      (handler) => { dataHandler = handler },
      () => { dataHandler = undefined },
      50,
    )

    const result = await promise
    expect(result).toBe(false)
    expect(writeCalled).toBe(true)
    expect(fs.existsSync(probeFilePath)).toBe(false)
  })

  test("cleans up temp file if write throws an exception", async () => {
    let dataHandler: ((data: Buffer) => void) | undefined

    const promise = probeFile(
      () => {
        // File was written right before write() is called; throw here
        expect(fs.existsSync(probeFilePath)).toBe(true)
        throw new Error("simulated write failure")
      },
      (handler) => { dataHandler = handler },
      () => { dataHandler = undefined },
      1000,
    )

    const result = await promise
    expect(result).toBe(false)
    expect(fs.existsSync(probeFilePath)).toBe(false)
  })
})
