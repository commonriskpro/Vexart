import { describe, expect, test } from "bun:test"
import { CLASS_NAME_UNKNOWN_BEHAVIOR } from "../styles/class-name"
import { defineConfig, mergeConfig } from "./config"

describe("app config", () => {
  test("preserves typed config input", () => {
    const config = defineConfig({ app: { name: "Demo", defaultRoute: "/projects" } })

    expect(config.app?.name).toBe("Demo")
  })

  test("merges defaults", () => {
    expect(mergeConfig({ styles: { unknownClass: CLASS_NAME_UNKNOWN_BEHAVIOR.ERROR } })).toEqual({
      app: { name: "Vexart App", defaultRoute: "/" },
      theme: { preset: "void" },
      styles: { className: true, unknownClass: "error" },
      terminal: { minColumns: 80, minRows: 24 },
    })
  })
})
