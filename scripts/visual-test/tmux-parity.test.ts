import { expect, test } from "bun:test"
import { deflateSync } from "node:zlib"
import { decodeFrames, parseOutput } from "./tmux-parity"
import { isOwnedTmuxShmName, validateRawRgbaFrame } from "./tmux-shm-reader"

function apc(header: string, payload = ""): string {
  return `\x1b_G${header};${payload}\x1b\\`
}

function tmux(body: string): string {
  return `\x1bPtmux;${body.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`
}

test("parity decoder reassembles fragmented zlib uploads", () => {
  const rgba = Uint8Array.from({ length: 2 * 2 * 4 }, (_, index) => (index * 29 + 7) & 0xff)
  const encoded = deflateSync(Buffer.from(rgba)).toString("base64")
  const splitOne = Math.max(4, Math.floor(encoded.length / 3) & ~3)
  const splitTwo = Math.max(splitOne + 4, Math.floor(encoded.length * 2 / 3) & ~3)
  const output = Buffer.from(
    apc("a=T,f=32,s=2,v=2,i=1073741900,o=z,m=1", encoded.slice(0, splitOne))
    + apc("m=1", encoded.slice(splitOne, splitTwo))
    + apc("m=0", encoded.slice(splitTwo)),
  )
  const parsed = parseOutput(output, false, 2, 2)
  expect(parsed.frames).toHaveLength(1)
  expect(parsed.frames[0].rgba).toEqual(rgba)
})

test("parity decoder rejects a new upload before m=0", () => {
  expect(() => decodeFrames([
    { header: "a=T,f=32,s=1,v=1,i=1073741900,o=z,m=1", payload: "eA==" },
    { header: "a=T,f=32,s=1,v=1,i=1073741900,o=z,m=0", payload: "eA==" },
  ])).toThrow("previous continuation")
})

test("parity decoder rejects malformed non-final chunk framing", () => {
  expect(() => decodeFrames([
    { header: "a=T,f=32,s=1,v=1,i=1073741900,o=z,m=1", payload: "abc" },
  ])).toThrow("divisible by 4")
})

test("parity decoder requires one APC per tmux passthrough wrapper", () => {
  const body = apc("a=p,i=1073741900,p=1") + apc("a=p,i=1073741900,p=1")
  expect(() => parseOutput(Buffer.from(tmux(body)), true, 1, 1)).toThrow("exactly one")
})

test("parity decoder rejects an unterminated tmux wrapper", () => {
  expect(() => parseOutput(Buffer.from("\x1bPtmux;\x1b\x1b_Ga=p,i=1,p=1;\x1b\\"), true, 1, 1)).toThrow("unterminated")
})

test("SHM decoder accepts one complete raw RGBA frame", () => {
  const rgba = Uint8Array.from({ length: 2 * 3 * 4 }, (_, index) => (index * 17 + 3) & 0xff)
  expect(validateRawRgbaFrame(rgba, 2, 3)).toEqual(rgba)
  expect(isOwnedTmuxShmName("/vx-1a-2b")).toBe(true)
})

test("SHM decoder rejects truncated frames and foreign names", () => {
  expect(() => validateRawRgbaFrame(new Uint8Array(7), 2, 1)).toThrow("expected 8")
  expect(isOwnedTmuxShmName("/vexart-kitty-1-2")).toBe(false)
  expect(isOwnedTmuxShmName("/vx-../../other")).toBe(false)
})

test("tmux decoder rejects compressed or direct uploads", () => {
  const packet = apc("a=T,t=t,f=32,U=1,s=1,v=1,i=1,p=1,q=1,c=1,r=1", "Lw==")
  expect(() => parseOutput(Buffer.from(tmux(packet)), true, 1, 1)).toThrow()
  expect(() => decodeFrames([{ header: "a=T,t=s,f=32,U=1,s=1,v=1,i=1,p=1,q=1", payload: "/vx-1-1" }])).toThrow("SHM Kitty upload")
})
