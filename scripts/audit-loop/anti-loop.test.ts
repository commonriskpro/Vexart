import { describe, expect, test } from "bun:test"
import { createAntiLoopMonitor } from "./anti-loop"

describe("anti-loop circuit breaker", () => {
  test("allows many distinct commands without an arbitrary budget limit", () => {
    const monitor = createAntiLoopMonitor()
    for (let i = 0; i < 150; i++) {
      const reason = monitor.check(`/opt/homebrew/bin/zsh -lc 'sed -n "${i},${i + 10}p" packages/engine/src/file${i}.ts'`)
      expect(reason).toBeNull()
    }
  })

  test("catches identical command repeated 3 times", () => {
    const monitor = createAntiLoopMonitor()
    expect(monitor.check("/opt/homebrew/bin/zsh -lc 'git status'")).toBeNull()
    expect(monitor.check("/opt/homebrew/bin/zsh -lc 'git status'")).toBeNull()
    const reason = monitor.check("/opt/homebrew/bin/zsh -lc 'git status'")
    expect(reason).toContain("circuit breaker: identical command repeated 3 times")
  })

  test("catches consecutive bare status commands (6 in a row)", () => {
    const monitor = createAntiLoopMonitor()
    expect(monitor.check("git status")).toBeNull()
    expect(monitor.check("pwd")).toBeNull()
    expect(monitor.check("git branch")).toBeNull()
    expect(monitor.check("git status -s")).toBeNull()
    expect(monitor.check("pwd")).toBeNull()
    const reason = monitor.check("git status")
    expect(reason).toContain("circuit breaker: consecutive bare status commands exceeded limit (6)")
  })

  test("resets bare status counter when inspecting code or running tests", () => {
    const monitor = createAntiLoopMonitor()
    expect(monitor.check("git status")).toBeNull()
    expect(monitor.check("pwd")).toBeNull()
    expect(monitor.check("git diff packages/engine/src/parser.ts")).toBeNull() // real inspection
    expect(monitor.check("git status")).toBeNull()
    expect(monitor.check("bun test packages/engine")).toBeNull() // real test
    expect(monitor.check("git status")).toBeNull()
  })

  test("catches alternating 2-command loop", () => {
    const monitor = createAntiLoopMonitor()
    expect(monitor.check("git status")).toBeNull()
    expect(monitor.check("git diff")).toBeNull()
    expect(monitor.check("git status")).toBeNull()
    expect(monitor.check("git diff")).toBeNull()
    expect(monitor.check("git status")).toBeNull()
    const reason = monitor.check("git diff")
    expect(reason).toContain("circuit breaker: alternating command loop detected")
  })

  test("catches cyclic 3-command loop", () => {
    const monitor = createAntiLoopMonitor()
    const seq = ["cat foo.ts", "cat bar.ts", "cat baz.ts"]
    for (let i = 0; i < 8; i++) {
      expect(monitor.check(seq[i % 3])).toBeNull()
    }
    const reason = monitor.check(seq[8 % 3])
    expect(reason).toContain("circuit breaker: cyclic command loop detected")
  })
})

