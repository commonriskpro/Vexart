import { describe, expect, test } from "bun:test"
import { parsePixelReports, queryPixelSize } from "./size"

type Feed = (data: string) => void

function stream(): { feed: Feed; onData: (handler: (data: Buffer) => void) => void; offData: (handler: (data: Buffer) => void) => void } {
  let handler: ((data: Buffer) => void) | null = null
  return {
    feed(data) { handler?.(Buffer.from(data)) },
    onData(next) { handler = next },
    offData(next) { if (handler === next) handler = null },
  }
}

describe("terminal pixel reports", () => {
  test("parses tmux area and cell reports", () => {
    const reports = parsePixelReports("\x1b[6;20;10t\x1b[4;840;800t")
    expect(reports).toEqual({
      cell: { width: 10, height: 20 },
      area: { width: 800, height: 840 },
    })
  })

  test("keeps the pane pixel area relative to pane cells", async () => {
    const io = stream()
    const writes: string[] = []
    const pending = queryPixelSize((data) => {
      writes.push(data)
      io.feed("\x1b[6;2")
      io.feed("0;10t\x1b[4;84")
      io.feed("0;800t")
    }, io.onData, io.offData, 80, 42, 100)

    await expect(pending).resolves.toEqual({
      pixelWidth: 800,
      pixelHeight: 840,
      cellWidth: 10,
      cellHeight: 20,
    })
    expect(writes).toEqual(["\x1b[16t\x1b[14t"])
  })

  test("uses explicit cell dimensions when area report is unavailable", async () => {
    const io = stream()
    const pending = queryPixelSize(() => io.feed("\x1b[6;18;9t"), io.onData, io.offData, 80, 24, 5)

    await expect(pending).resolves.toEqual({
      pixelWidth: 720,
      pixelHeight: 432,
      cellWidth: 9,
      cellHeight: 18,
    })
  })

  test("does not accept a partial report", async () => {
    const io = stream()
    const pending = queryPixelSize(() => io.feed("\x1b[4;840;800"), io.onData, io.offData, 80, 24, 5)

    await expect(pending).resolves.toEqual({
      pixelWidth: 640,
      pixelHeight: 384,
      cellWidth: 8,
      cellHeight: 16,
    })
  })
})
