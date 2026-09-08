import { describe, expect, test } from "bun:test"
import { attachedClientCount, parentTerminalFromEnv, parsePassthroughOption, parseTmuxClientRecords, tmuxClientSupportsRgbFromFeatures, wrapPassthrough } from "./tmux"

describe("tmux parent resolution", () => {
  test("resolves inherited parent markers rather than pane TERM", () => {
    expect(parentTerminalFromEnv({ TMUX: "/tmp/tmux", TERM: "screen-256color", GHOSTTY_RESOURCES_DIR: "/Applications/Ghostty.app" })).toBe("ghostty")
    expect(parentTerminalFromEnv({ TMUX: "/tmp/tmux", TERM: "tmux-256color", KITTY_WINDOW_ID: "4" })).toBe("kitty")
    expect(parentTerminalFromEnv({ TMUX: "/tmp/tmux", TERM: "screen-256color", TERM_PROGRAM: "wezterm" })).toBe("wezterm")
    expect(parentTerminalFromEnv({ TMUX: "/tmp/tmux", TERM: "screen-256color" })).toBe("unknown")
  })

  test("parses live allow-passthrough choices conservatively", () => {
    expect(parsePassthroughOption("on\n")).toBe("enabled")
    expect(parsePassthroughOption("all")).toBe("enabled")
    expect(parsePassthroughOption("off")).toBe("disabled")
    expect(parsePassthroughOption("unexpected")).toBe("unknown")
  })

  test("doubles every ESC inside the passthrough payload", () => {
    expect(wrapPassthrough("\x1b_Ga=q;ok\x1b\\")).toBe("\x1bPtmux;\x1b\x1b_Ga=q;ok\x1b\x1b\\\x1b\\")
  })

  test("counts only non-empty attached-client records", () => {
    expect(attachedClientCount("/dev/ttys001\n/dev/ttys002\n")).toBe(2)
    expect(attachedClientCount("\n/dev/ttys001\n")).toBe(1)
    expect(attachedClientCount("")).toBe(0)
  })

  test("requires the effective RGB client feature", () => {
    expect(tmuxClientSupportsRgbFromFeatures("256,RGB,focus")).toBe(true)
    expect(tmuxClientSupportsRgbFromFeatures("256,focus")).toBe(false)
    expect(tmuxClientSupportsRgbFromFeatures("rgb")).toBe(true)
    expect(tmuxClientSupportsRgbFromFeatures(null)).toBe(false)
  })

  test("parses the stable client identity and capabilities snapshot", () => {
    const records = parseTmuxClientRecords("/dev/ttys001\txterm-ghostty\t256,RGB,focus\n")
    expect(records).toEqual([{
      tty: "/dev/ttys001",
      termName: "xterm-ghostty",
      termFeatures: "256,RGB,focus",
      passthroughAll: false,
      rgb: true,
    }])
    expect(parseTmuxClientRecords("/dev/ttys001\tbroken\n")).toBeNull()
    expect(parseTmuxClientRecords("")).toEqual([])
  })
})

test.skipIf(!Bun.which("tmux"))("reads effective inherited and pane-specific passthrough settings from an isolated tmux server", () => {
  const socket = `/tmp/vexart-tmux-${process.pid}-${Date.now()}`
  const session = `vexart-${process.pid}-${Date.now()}`
  const run = (args: string[]) => Bun.spawnSync(["tmux", "-S", socket, ...args], { stdout: "pipe", stderr: "pipe" })
  const env = {
    ...process.env,
    TMUX: `${socket},${process.pid},0`,
    TMUX_PANE: "%0",
    TERM: "screen-256color",
  }
  const child = (helper: "tmuxPassthroughState" | "tmuxPassthroughAllowsAll") => Bun.spawnSync(
    [process.execPath, "-e", `import { ${helper} } from "./packages/engine/src/terminal/tmux.ts"; process.stdout.write(String(${helper}()))`],
    { cwd: process.cwd(), env, stdout: "pipe", stderr: "pipe" },
  )

  try {
    expect(run(["-f", "/dev/null", "new-session", "-d", "-s", session, "sleep 30"]).exitCode).toBe(0)
    expect(run(["set-option", "-g", "allow-passthrough", "on"]).exitCode).toBe(0)
    expect(child("tmuxPassthroughState").stdout.toString()).toBe("enabled")
    expect(child("tmuxPassthroughAllowsAll").stdout.toString()).toBe("false")

    expect(run(["set-option", "-g", "allow-passthrough", "all"]).exitCode).toBe(0)
    expect(child("tmuxPassthroughState").stdout.toString()).toBe("enabled")
    expect(child("tmuxPassthroughAllowsAll").stdout.toString()).toBe("true")

    expect(run(["set-option", "-p", "-t", "%0", "allow-passthrough", "off"]).exitCode).toBe(0)
    expect(child("tmuxPassthroughState").stdout.toString()).toBe("disabled")
    expect(child("tmuxPassthroughAllowsAll").stdout.toString()).toBe("false")
  } finally {
    run(["kill-server"])
  }
})
