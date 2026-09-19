import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createComponent, type TGENode } from "@vexart/engine/internal"
import {
  Diff,
  createDiff,
  useDiff,
  parseDiff,
  getDiffStats,
  LINE_TYPE,
  DIFF_DEFAULTS,
  type DiffLine,
} from "./diff"

type NodeComponent = (props: any) => TGENode
const DiffNode = Diff as unknown as NodeComponent

const SAMPLE_DIFF = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 first context
-removed line
+added line 1
+added line 2
 second context`

const MULTI_HUNK_DIFF = `--- a/app.ts
+++ b/app.ts
@@ -1,2 +1,2 @@
 const x = 1
-const y = 2
+const y = 20
@@ -10,3 +10,4 @@
 function test() {
+  console.log("start")
   return true
 }`

describe("parseDiff", () => {
  test("returns empty array for empty or whitespace diff", () => {
    expect(parseDiff("")).toEqual([])
    expect(parseDiff("   \n  \n  ")).toEqual([])
  })

  test("parses headers, context, added, and removed lines with accurate line numbers", () => {
    const lines = parseDiff(SAMPLE_DIFF)

    // Headers
    expect(lines[0]).toEqual({
      type: LINE_TYPE.HEADER,
      content: "--- a/file.txt",
      oldLineNum: null,
      newLineNum: null,
    })
    expect(lines[1]).toEqual({
      type: LINE_TYPE.HEADER,
      content: "+++ b/file.txt",
      oldLineNum: null,
      newLineNum: null,
    })
    expect(lines[2]).toEqual({
      type: LINE_TYPE.HEADER,
      content: "@@ -1,3 +1,4 @@",
      oldLineNum: null,
      newLineNum: null,
    })

    // Context line: old 1, new 1
    expect(lines[3]).toEqual({
      type: LINE_TYPE.CONTEXT,
      content: "first context",
      oldLineNum: 1,
      newLineNum: 1,
    })

    // Removed line: old 2, new null
    expect(lines[4]).toEqual({
      type: LINE_TYPE.REMOVED,
      content: "removed line",
      oldLineNum: 2,
      newLineNum: null,
    })

    // Added line 1: old null, new 2
    expect(lines[5]).toEqual({
      type: LINE_TYPE.ADDED,
      content: "added line 1",
      oldLineNum: null,
      newLineNum: 2,
    })

    // Added line 2: old null, new 3
    expect(lines[6]).toEqual({
      type: LINE_TYPE.ADDED,
      content: "added line 2",
      oldLineNum: null,
      newLineNum: 3,
    })

    // Second context: old 3, new 4
    expect(lines[7]).toEqual({
      type: LINE_TYPE.CONTEXT,
      content: "second context",
      oldLineNum: 3,
      newLineNum: 4,
    })
  })

  test("parses multiple hunks and tracks line numbers accurately", () => {
    const lines = parseDiff(MULTI_HUNK_DIFF)

    const hunk2HeaderIndex = lines.findIndex(
      (l) => l.type === LINE_TYPE.HEADER && l.content.startsWith("@@ -10,3 +10,4 @@")
    )
    expect(hunk2HeaderIndex).toBeGreaterThan(0)

    // First line after second hunk header
    const firstLineHunk2 = lines[hunk2HeaderIndex + 1]
    expect(firstLineHunk2).toEqual({
      type: LINE_TYPE.CONTEXT,
      content: "function test() {",
      oldLineNum: 10,
      newLineNum: 10,
    })

    // Added line in hunk 2
    const addedLineHunk2 = lines[hunk2HeaderIndex + 2]
    expect(addedLineHunk2).toEqual({
      type: LINE_TYPE.ADDED,
      content: '  console.log("start")',
      oldLineNum: null,
      newLineNum: 11,
    })

    // Following context line
    const nextContextHunk2 = lines[hunk2HeaderIndex + 3]
    expect(nextContextHunk2).toEqual({
      type: LINE_TYPE.CONTEXT,
      content: "  return true",
      oldLineNum: 11,
      newLineNum: 12,
    })
  })

  test("calculates stats correctly", () => {
    const lines = parseDiff(SAMPLE_DIFF)
    const stats = getDiffStats(lines)

    expect(stats.added).toBe(2)
    expect(stats.removed).toBe(1)
    expect(stats.total).toBe(3)
  })
})

describe("createDiff and useDiff", () => {
  test("returns reactive lines and stats accessors", () => {
    createRoot((dispose) => {
      const [diffText, setDiffText] = createSignal(SAMPLE_DIFF)
      const { lines, stats } = createDiff(diffText)

      expect(lines().length).toBe(8)
      expect(stats()).toEqual({ added: 2, removed: 1, total: 3 })

      // Update diff reactively
      setDiffText(MULTI_HUNK_DIFF)
      expect(stats()).toEqual({ added: 2, removed: 1, total: 3 })

      setDiffText("@@ -1,1 +1,2 @@\n context\n+new line")
      expect(stats()).toEqual({ added: 1, removed: 0, total: 1 })

      dispose()
    })
  })

  test("useDiff alias behaves identically", () => {
    createRoot((dispose) => {
      const { stats } = useDiff(() => SAMPLE_DIFF)
      expect(stats()).toEqual({ added: 2, removed: 1, total: 3 })
      dispose()
    })
  })
})

describe("Diff component", () => {
  test("renders with unstyled neutral DIFF_DEFAULTS by default", () => {
    createRoot((dispose) => {
      const node = createComponent(DiffNode, {
        diff: SAMPLE_DIFF,
      })

      expect(node.kind).toBe("box")
      expect(node.props.backgroundColor).toBe(0) // parseColor("transparent") = 0
      expect(node.props.cornerRadius).toBe(0)
      expect(DIFF_DEFAULTS.addedBg).toBe("transparent")
      expect(DIFF_DEFAULTS.removedBg).toBe("transparent")
      expect(DIFF_DEFAULTS.fg).toBe("currentColor")

      dispose()
    })
  })

  test("applies custom theme overrides", () => {
    createRoot((dispose) => {
      const node = createComponent(DiffNode, {
        diff: SAMPLE_DIFF,
        theme: {
          bg: "#223344",
          radius: 8,
          addedBg: "#115511",
        },
      })

      expect(node.props.backgroundColor).toBe(0x223344ff)
      expect(node.props.cornerRadius).toBe(8)

      dispose()
    })
  })

  test("supports custom children line renderer", () => {
    createRoot((dispose) => {
      const renderedLines: DiffLine[] = []
      const node = createComponent(DiffNode, {
        diff: SAMPLE_DIFF,
        children: (line: DiffLine) => {
          renderedLines.push(line)
          const row = { kind: "box", props: { id: "custom-row" }, children: [] } as unknown as TGENode
          return row as any
        },
      })

      expect(renderedLines.length).toBe(8)
      expect(renderedLines[0].type).toBe(LINE_TYPE.HEADER)
      expect(renderedLines[4].type).toBe(LINE_TYPE.REMOVED)
      expect(renderedLines[5].type).toBe(LINE_TYPE.ADDED)

      dispose()
    })
  })
})
