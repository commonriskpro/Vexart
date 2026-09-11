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

  test("wraps color queries in DCS passthrough under tmux and preserves unwrapped normal queries", async () => {
    const origEnv = { ...process.env }

    try {
      // Passthrough enabled under tmux with a supported parent terminal
      process.env["TMUX"] = "/tmp/tmux-test"
      process.env["TERM"] = "tmux-256color"
      process.env["TERM_PROGRAM"] = "ghostty"

      const tmuxIo = stream()
      const tmuxWrites: string[] = []
      const tmuxPending = queryColors((data) => {
        tmuxWrites.push(data)
        if (data.includes("11")) {
          tmuxIo.feed("\x1b]11;rgb:1111/2222/3333\x07")
        } else {
          tmuxIo.feed("\x1b]10;rgb:aaaa/bbbb/cccc\x07")
        }
      }, tmuxIo.onData, tmuxIo.offData, 100)

      await expect(tmuxPending).resolves.toEqual({ bg: [17, 34, 51], fg: [170, 187, 204] })
      expect(tmuxWrites).toEqual([
        "\x1bPtmux;\x1b\x1b]11;?\x07\x1b\\",
        "\x1bPtmux;\x1b\x1b]10;?\x07\x1b\\",
      ])

      // Normal operation outside tmux
      delete process.env["TMUX"]
      process.env["TERM"] = origEnv["TERM"] ?? "xterm-256color"
      delete process.env["TERM_PROGRAM"]

      const normalIo = stream()
      const normalWrites: string[] = []
      const normalPending = queryColors((data) => {
        normalWrites.push(data)
        if (data.includes("11")) {
          normalIo.feed("\x1b]11;rgb:1111/2222/3333\x07")
        } else {
          normalIo.feed("\x1b]10;rgb:aaaa/bbbb/cccc\x07")
        }
      }, normalIo.onData, normalIo.offData, 100)

      await expect(normalPending).resolves.toEqual({ bg: [17, 34, 51], fg: [170, 187, 204] })
      expect(normalWrites).toEqual([
        "\x1b]11;?\x07",
        "\x1b]10;?\x07",
      ])
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in origEnv)) {
          delete process.env[key]
        }
      }
      Object.assign(process.env, origEnv)
    }
  })
})
