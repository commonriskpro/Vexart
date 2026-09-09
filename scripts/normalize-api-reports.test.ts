import { describe, expect, test } from "bun:test"
import { normalizeApiReport } from "./normalize-api-reports"

describe("API report path normalization", () => {
  test("redacts an absolute extractor temp path while preserving the diagnostic", () => {
    const source = "// /Users/dev/ve/vexart/.api-extractor-temp/packages/engine/src/index.d.ts:1:1 - warning\n"
    expect(normalizeApiReport(source)).toBe("// <repo>/.api-extractor-temp/packages/engine/src/index.d.ts:1:1 - warning\n")
  })

  test("normalizes CI paths to the same stable value", () => {
    const source = "// /home/runner/work/Vexart/Vexart/.api-extractor-temp/packages/headless/src/index.d.ts:2:3 - warning\n"
    expect(normalizeApiReport(source)).toBe("// <repo>/.api-extractor-temp/packages/headless/src/index.d.ts:2:3 - warning\n")
  })

  test("preserves the report's existing line-ending convention", () => {
    const source = "// /home/runner/work/Vexart/Vexart/.api-extractor-temp/packages/styled/src/index.d.ts:4:5 - warning\r\n"
    expect(normalizeApiReport(source)).toBe("// <repo>/.api-extractor-temp/packages/styled/src/index.d.ts:4:5 - warning\r\n")
  })

  test("leaves ordinary report content unchanged", () => {
    const source = "export function stable(): void;\n"
    expect(normalizeApiReport(source)).toBe(source)
  })
})
