import { describe, expect, test } from "bun:test"
import { createKittyResponseParser } from "./kitty-responses"

const response = (header: string, status = "OK") => Buffer.from(`\x1b_G${header};${status}\x1b\\`)

describe("Kitty response observer", () => {
  test("parses fragmented, multiple responses", () => {
    const seen: unknown[] = []
    const parser = createKittyResponseParser((value) => seen.push(value))
    const bytes = Buffer.concat([response("i=71,p=9"), response("i=72", "EINVAL")])
    for (let index = 0; index < bytes.length; index++) parser.feed(bytes.subarray(index, index + 1))
    expect(seen).toEqual([
      { imageId: 71, placementId: 9, status: "OK" },
      { imageId: 72, placementId: null, status: "EINVAL" },
    ])
    parser.destroy()
  })

  test("rejects reordered, duplicate, unknown, and malformed headers", () => {
    const seen: unknown[] = []
    const parser = createKittyResponseParser((value) => seen.push(value))
    parser.feed(Buffer.concat([
      response("i=1,i=1"),
      response("i=2,x=4"),
      response("i=04"),
      response("i=9007199254740992"),
      response("i=5", "OK\n"),
      Buffer.concat([Buffer.from("\x1b_Gi="), Buffer.from([0x80]), Buffer.from(";OK\x1b\\")]),
    ]))
    expect(seen).toEqual([])
    parser.destroy()
  })

  test("accepts either order for the optional placement field", () => {
    const seen: unknown[] = []
    const parser = createKittyResponseParser((value) => seen.push(value))
    parser.feed(response("p=11,i=6", "OK done"))
    expect(seen).toEqual([{ imageId: 6, placementId: 11, status: "OK done" }])
    parser.destroy()
  })

  test("ignores response-looking text in bracketed paste", () => {
    const seen: unknown[] = []
    const parser = createKittyResponseParser((value) => seen.push(value))
    const paste = Buffer.from("\x1b[200~typed \x1b_Gi=88;OK\x1b\\ text\x1b[201~")
    parser.feed(paste.subarray(0, 7))
    parser.feed(paste.subarray(7))
    parser.feed(response("i=89"))
    expect(seen).toEqual([{ imageId: 89, placementId: null, status: "OK" }])
    parser.destroy()
  })

  test("waits for a complete terminator and stays bounded", () => {
    const seen: unknown[] = []
    const parser = createKittyResponseParser((value) => seen.push(value))
    parser.feed(Buffer.from("\x1b_Gi=90;OK"))
    expect(seen).toEqual([])
    parser.feed(Buffer.from("\x1b\\"))
    expect(seen).toEqual([{ imageId: 90, placementId: null, status: "OK" }])
    parser.feed(Buffer.from("\x1b_G" + "x".repeat(40_000)))
    parser.feed(response("i=91"))
    expect(seen).toEqual([
      { imageId: 90, placementId: null, status: "OK" },
      { imageId: 91, placementId: null, status: "OK" },
    ])
    parser.destroy()
    parser.feed(response("i=92"))
    expect(seen).toHaveLength(2)
  })
})
