import { describe, expect, test } from "bun:test"
import type { Terminal } from "@vexart/engine"
import { createApp } from "./create-app"

function createMockTerminal(): Terminal {
  return {
    kind: "kitty",
    caps: {
      kind: "kitty",
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: true,
      focus: true,
      bracketedPaste: true,
      syncOutput: true,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct",
    },
    size: {
      cols: 80,
      rows: 24,
      pixelWidth: 640,
      pixelHeight: 384,
      cellWidth: 8,
      cellHeight: 16,
    },
    write: () => {},
    rawWrite: () => {},
    writeBytes: () => {},
    beginSync: () => {},
    endSync: () => {},
    onResize: () => () => {},
    onData: () => () => {},
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: () => {},
    writeClipboard: () => {},
    suspend: () => {},
    resume: () => {},
    destroy: () => {},
  }
}

describe("createApp signal handling (LC-08)", () => {
  test("prepends signal listeners and cleans them up on destroy", async () => {
    const beforeSigint = process.listeners("SIGINT").length
    const beforeSigterm = process.listeners("SIGTERM").length
    const beforeSighup = process.listeners("SIGHUP").length

    const terminal = createMockTerminal()
    const ctx = await createApp(() => null, {
      terminal,
      quit: ["q"],
    })

    const afterSigint = process.listeners("SIGINT")
    const afterSigterm = process.listeners("SIGTERM")
    const afterSighup = process.listeners("SIGHUP")

    expect(afterSigint.length).toBe(beforeSigint + 1)
    expect(afterSigterm.length).toBe(beforeSigterm + 1)
    expect(afterSighup.length).toBe(beforeSighup + 1)

    ctx.destroy()

    expect(process.listeners("SIGINT").length).toBe(beforeSigint)
    expect(process.listeners("SIGTERM").length).toBe(beforeSigterm)
    expect(process.listeners("SIGHUP").length).toBe(beforeSighup)
  })

  test("handles SIGINT with exit code 130 in child process", () => {
    const script = `
      import { createApp } from "${import.meta.dir}/create-app"
      const term = {
        kind: "kitty",
        caps: { kind: "kitty", kittyGraphics: true, kittyPlaceholder: false, kittyKeyboard: false, sixel: false, truecolor: true, mouse: true, focus: true, bracketedPaste: true, syncOutput: true, tmux: false, parentKind: null, transmissionMode: "direct" },
        size: { cols: 80, rows: 24, pixelWidth: 640, pixelHeight: 384, cellWidth: 8, cellHeight: 16 },
        write: () => {},
        rawWrite: () => {},
        writeBytes: () => {},
        beginSync: () => {},
        endSync: () => {},
        onResize: () => () => {},
        onData: () => () => {},
        bgColor: null,
        fgColor: null,
        isDark: true,
        setTitle: () => {},
        writeClipboard: () => {},
        suspend: () => {},
        resume: () => {},
        destroy: () => {},
      }
      await createApp(() => null, { terminal: term })
      process.kill(process.pid, "SIGINT")
    `
    const child = Bun.spawnSync([process.execPath, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode).toBe(130)
  })

  test("handles SIGTERM with exit code 143 in child process", () => {
    const script = `
      import { createApp } from "${import.meta.dir}/create-app"
      const term = {
        kind: "kitty",
        caps: { kind: "kitty", kittyGraphics: true, kittyPlaceholder: false, kittyKeyboard: false, sixel: false, truecolor: true, mouse: true, focus: true, bracketedPaste: true, syncOutput: true, tmux: false, parentKind: null, transmissionMode: "direct" },
        size: { cols: 80, rows: 24, pixelWidth: 640, pixelHeight: 384, cellWidth: 8, cellHeight: 16 },
        write: () => {},
        rawWrite: () => {},
        writeBytes: () => {},
        beginSync: () => {},
        endSync: () => {},
        onResize: () => () => {},
        onData: () => () => {},
        bgColor: null,
        fgColor: null,
        isDark: true,
        setTitle: () => {},
        writeClipboard: () => {},
        suspend: () => {},
        resume: () => {},
        destroy: () => {},
      }
      await createApp(() => null, { terminal: term })
      process.kill(process.pid, "SIGTERM")
    `
    const child = Bun.spawnSync([process.execPath, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode).toBe(143)
  })

  test("handles SIGHUP with exit code 129 in child process", () => {
    const script = `
      import { createApp } from "${import.meta.dir}/create-app"
      const term = {
        kind: "kitty",
        caps: { kind: "kitty", kittyGraphics: true, kittyPlaceholder: false, kittyKeyboard: false, sixel: false, truecolor: true, mouse: true, focus: true, bracketedPaste: true, syncOutput: true, tmux: false, parentKind: null, transmissionMode: "direct" },
        size: { cols: 80, rows: 24, pixelWidth: 640, pixelHeight: 384, cellWidth: 8, cellHeight: 16 },
        write: () => {},
        rawWrite: () => {},
        writeBytes: () => {},
        beginSync: () => {},
        endSync: () => {},
        onResize: () => () => {},
        onData: () => () => {},
        bgColor: null,
        fgColor: null,
        isDark: true,
        setTitle: () => {},
        writeClipboard: () => {},
        suspend: () => {},
        resume: () => {},
        destroy: () => {},
      }
      await createApp(() => null, { terminal: term })
      process.kill(process.pid, "SIGHUP")
    `
    const child = Bun.spawnSync([process.execPath, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode).toBe(129)
  })
})
