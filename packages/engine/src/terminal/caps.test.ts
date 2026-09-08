import { describe, expect, test } from "bun:test"
import { parseKittyProbeResponse, probeKittyGraphics, queryColors } from "./caps"

type Feed = (data: string) => void

function stream(): { feed: Feed; onData: (handler: (data: Buffer) => void) => void; offData: (handler: (data: Buffer) => void) => void } {
  let handler: ((data: Buffer) => void) | null = null
  return {
    feed(data) { handler?.(Buffer.from(data)) },
    onData(next) { handler = next },
    offData(next) { if (handler === next) handler = null },
  }
}

describe("terminal capability replies", () => {
  test("requires the complete Kitty status terminator", () => {
    expect(parseKittyProbeResponse("\x1b_Gi=31;O")).toBeNull()
    expect(parseKittyProbeResponse("\x1b_Gi=31;OK\x1b\\")).toBe(true)
    expect(parseKittyProbeResponse("\x1b_Gi=31;ENOTSUP\x1b\\")).toBe(false)
  })

  test("assembles a Kitty response split across PTY reads", async () => {
    const io = stream()
    const writes: string[] = []
    const pending = probeKittyGraphics((data) => {
      writes.push(data)
      io.feed("\x1b_Gi=31;O")
      io.feed("K\x1b\\")
    }, io.onData, io.offData, 100)

    await expect(pending).resolves.toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0]).not.toContain("U=1")
  })

  test("requires complete OSC color responses when fragmented", async () => {
    const io = stream()
    const pending = queryColors((data) => {
      if (data.includes("11")) {
        io.feed("\x1b]11;rgb:1111/2222/3333")
        io.feed("\x07")
      } else {
        io.feed("\x1b]10;rgb:aaaa/bbbb/cccc")
        io.feed("\x1b\\")
      }
    }, io.onData, io.offData, 100)

    await expect(pending).resolves.toEqual({ bg: [17, 34, 51], fg: [170, 187, 204] })
  })
})
