import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, solidRender, type TGENode, parseColor } from "@vexart/engine/internal"
import { VoidDiff } from "./diff"
import { setTheme, darkTheme, lightTheme } from "../theme/theme"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

const SAMPLE_DIFF = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 context
-old
+new`

suite("VoidDiff component", () => {
  beforeEach(() => {
    setTheme(darkTheme)
  })

  afterEach(() => {
    setTheme(darkTheme)
  })

  test("renders with Void theme tokens", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidDiff diff={SAMPLE_DIFF} showLineNumbers width={400} />
    ))

    try {
      const diffBox = root.children[0]
      expect(diffBox).toBeDefined()
      expect(diffBox.kind).toBe("box")
      expect(diffBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })

  test("reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidDiff diff={SAMPLE_DIFF} showLineNumbers width={400} />
    ))

    try {
      const diffBox = root.children[0]
      expect(diffBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))

      // Switch theme to light
      setTheme(lightTheme)
      expect(diffBox.props.backgroundColor).toBe(parseColor(lightTheme.colors.card))

      // Switch back to dark
      setTheme(darkTheme)
      expect(diffBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })

  test("accepts theme prop overrides while preserving token reactivity for other props", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidDiff
        diff={SAMPLE_DIFF}
        theme={{
          radius: 12,
        }}
      />
    ))

    try {
      const diffBox = root.children[0]
      expect(diffBox.props.cornerRadius).toBe(12)
      expect(diffBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })
})
