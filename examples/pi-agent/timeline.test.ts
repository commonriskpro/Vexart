import { describe, expect, test } from "bun:test"
import { buildTimeline, contentText } from "./timeline"

describe("Pi timeline", () => {
  test("groups tool calls and results while keeping assistant text outside work", () => {
    const blocks = buildTimeline([
      { role: "user", content: "Inspect the repository" },
      { role: "assistant", content: [
        { type: "text", text: "I will inspect it first." },
        { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "pwd" } },
      ] },
      { role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "/worktree" }] },
      { role: "assistant", content: [{ type: "text", text: "The repository is ready." }] },
    ])

    expect(blocks.map((block) => block.kind)).toEqual(["user", "work", "assistant"])
    const work = blocks[1]
    expect(work.kind).toBe("work")
    if (work.kind === "work") expect(work.items.find((item) => item.kind === "tool")?.state).toBe("done")
  })

  test("measures work from actual activity timestamps through the final answer", () => {
    const blocks = buildTimeline([
      { role: "user", content: "Inspect", timestamp: 1000 },
      { role: "assistant", timestamp: 2000, content: [{ type: "toolCall", id: "timed", name: "read" }] },
      { role: "toolResult", timestamp: 7000, toolCallId: "timed", content: "source" },
      { role: "assistant", timestamp: 9000, content: "Done" },
    ])
    expect(blocks[1]).toMatchObject({ kind: "work", durationMs: 7000 })
    expect(blocks[2].kind).toBe("assistant")
  })

  test("marks failed tool results as errors", () => {
    const blocks = buildTimeline([
      { role: "assistant", content: [{ type: "toolCall", id: "call-2", name: "bash", arguments: { command: "false" } }] },
      { role: "toolResult", toolCallId: "call-2", isError: true, content: [{ type: "text", text: "exit 1" }] },
    ])
    const work = blocks[0]
    expect(work.kind).toBe("work")
    if (work.kind === "work") expect(work.items.find((item) => item.kind === "tool")?.state).toBe("error")
  })

  test("keeps interleaved commentary in one disclosure and only final text outside", () => {
    const blocks = buildTimeline([
      { role: "user", content: "Fix the failing check" },
      { role: "assistant", content: [
        { type: "thinking", thinking: "I should inspect the check." },
        { type: "text", text: "I will inspect the check." },
        { type: "toolCall", id: "call-a", name: "bash", arguments: { command: "bun test" } },
      ] },
      { role: "toolResult", toolCallId: "call-a", content: [{ type: "text", text: "failed" }] },
      { role: "assistant", content: [
        { type: "text", text: "The failure is in the parser." },
        { type: "toolCall", id: "call-b", name: "edit", arguments: { path: "src/parser.ts" } },
      ] },
      { role: "toolResult", toolCallId: "call-b", content: [{ type: "text", text: "updated" }] },
      { role: "assistant", content: [{ type: "text", text: "The check now passes." }] },
    ])
    expect(blocks.map((block) => block.kind)).toEqual(["user", "work", "assistant"])
    const work = blocks[1]
    expect(work.kind).toBe("work")
    if (work.kind === "work") {
      expect(work.items.filter((item) => item.kind === "commentary").length).toBe(3)
      expect(work.items.filter((item) => item.kind === "tool").length).toBe(2)
    }
    const final = blocks[2]
    if (final.kind === "assistant") expect(final.text).toBe("The check now passes.")
  })

  test("extracts text content without inventing values", () => {
    expect(contentText([{ type: "text", text: "one" }, { type: "text", text: "two" }])).toBe("one\ntwo")
    expect(contentText([{ type: "toolCall", name: "bash" }])).toBe("")
  })

  test("limits tool grouping to the current user turn", () => {
    const blocks = buildTimeline([
      { role: "user", content: "First task" },
      { role: "assistant", content: [{ type: "text", text: "First answer" }] },
      { role: "user", content: "Second task" },
      { role: "assistant", content: [{ type: "toolCall", id: "call-second", name: "bash" }] },
      { role: "toolResult", toolCallId: "call-second", content: [{ type: "text", text: "done" }] },
      { role: "assistant", content: [{ type: "text", text: "Second answer" }] },
    ])
    expect(blocks.map((block) => block.kind)).toEqual(["user", "assistant", "user", "work", "assistant"])
  })

  test("merges completed transient tools into their existing work disclosure", () => {
    const blocks = buildTimeline([
      { role: "user", content: "Run the check" },
      { role: "assistant", content: [{ type: "toolCall", id: "call-3", name: "bash" }] },
      { role: "toolResult", toolCallId: "call-3", content: [{ type: "text", text: "passed" }] },
    ], [{ type: "tool_execution_end", toolCallId: "call-3", toolName: "bash", result: "passed" }])
    expect(blocks).toHaveLength(2)
    const work = blocks[1]
    expect(work.kind).toBe("work")
    if (work.kind === "work") expect(work.items.filter((item) => item.kind === "tool")).toHaveLength(1)
  })

  test("keeps identical output from a different active bash request visible", () => {
    const blocks = buildTimeline([
      { role: "user", content: "Run commands" },
      { role: "bashExecution", command: "echo old", output: "old output", exitCode: 0, cancelled: false },
    ], [
      { type: "bash_execution_update", id: "rpc-old", delta: "old output", reconciled: true },
      { type: "bash_execution_update", id: "rpc-current", delta: "old output" },
    ], true)
    const work = blocks[1]
    expect(work.kind).toBe("work")
    if (work.kind === "work") {
      expect(work.items.filter((item) => item.kind === "tool")).toHaveLength(2)
      expect(work.items.some((item) => item.kind === "tool" && item.id === "rpc-current")).toBe(true)
    }
  })
})
