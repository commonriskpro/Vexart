/**
 * Public Code / Markdown / Diff parity scene.
 *
 * The left column uses the headless public components and the right column
 * uses their styled public wrappers. Assertions intentionally check colored
 * content and component surfaces rather than opaque alpha or export presence.
 * This is not a complete typography or terminal-font proof. The focused
 * whitespace checks below cover the source-formatting contract for these
 * components without trying to assert every font metric.
 */

import assert from "node:assert/strict"
import { Code, Diff, Markdown } from "@vexart/headless"
import { VoidCode, VoidDiff, VoidMarkdown } from "@vexart/styled"
import { ONE_DARK, SyntaxStyle, getTreeSitterClient } from "@vexart/engine"
import {
  renderToBufferAfterInteractions,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 1160
export const height = 820

const syntaxStyle = SyntaxStyle.fromTheme(ONE_DARK)
const CODE = `const answer: number = 42
function greet(name: string) {
  return "Hello, " + name
}`
const MARKDOWN = `# Public Markdown

The **headless** renderer keeps _semantic_ text visible.

- headings and emphasis
- links and inline code

\`const ready = true\`

\`\`\`typescript
const count = 3
\`\`\``
const DIFF = `--- a/status.ts
+++ b/status.ts
@@ -1,3 +1,3 @@
   const  ready = false
-return "waiting"
+return "ready"
`

function PanelTitle(props: { children: string }) {
  return <text color={0xffd166ff} fontSize={14}>{props.children}</text>
}

function HeadlessColumn() {
  return (
    <box width={560} direction="column" gap={10}>
      <PanelTitle>HEADLESS PUBLIC</PanelTitle>
      <box width={560} height={170} backgroundColor={0x111827ff} padding={10} cornerRadius={8}>
        <Code content={CODE} language="typescript" syntaxStyle={syntaxStyle} width={540} lineNumbers />
      </box>
      <box width={560} height={155} backgroundColor={0x111827ff} padding={10} cornerRadius={8}>
        <Diff diff={DIFF} showLineNumbers width={540} />
      </box>
      <box width={560} height={410} backgroundColor={0x111827ff} padding={10} cornerRadius={8}>
        <Markdown content={MARKDOWN} syntaxStyle={syntaxStyle} width={540} />
      </box>
    </box>
  )
}

function StyledColumn() {
  return (
    <box width={560} direction="column" gap={10}>
      <PanelTitle>STYLED PUBLIC</PanelTitle>
      <box width={560} height={170} backgroundColor={0x111827ff} padding={10} cornerRadius={8}>
        <VoidCode content={CODE} language="typescript" syntaxStyle={syntaxStyle} width={540} lineNumbers />
      </box>
      <box width={560} height={155} backgroundColor={0x111827ff} padding={10} cornerRadius={8}>
        <VoidDiff diff={DIFF} showLineNumbers width={540} />
      </box>
      <box width={560} height={410} backgroundColor={0x111827ff} padding={10} cornerRadius={8}>
        <VoidMarkdown content={MARKDOWN} syntaxStyle={syntaxStyle} width={540} />
      </box>
    </box>
  )
}

export function Scene() {
  return (
    <box width={width} height={height} backgroundColor={0x080b16ff} padding={18} direction="column" gap={14}>
      <text color={0xffd166ff} fontSize={22}>Code and documentation primitives</text>
      <text color={0x94a3b8ff} fontSize={12}>Headless and Void styled public surfaces · syntax and diff color checks</text>
      <box direction="row" gap={18}>
        <HeadlessColumn />
        <StyledColumn />
      </box>
    </box>
  )
}

function countColor(frame: RenderToBufferResult, x0: number, y0: number, x1: number, y1: number, color: [number, number, number], tolerance = 10) {
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * frame.width + x) * 4
      if (Math.abs(frame.pixels[index] - color[0]) <= tolerance
        && Math.abs(frame.pixels[index + 1] - color[1]) <= tolerance
        && Math.abs(frame.pixels[index + 2] - color[2]) <= tolerance
        && frame.pixels[index + 3] > 150) count++
    }
  }
  return count
}

function countAntialiasedColor(frame: RenderToBufferResult, x0: number, y0: number, x1: number, y1: number, foreground: [number, number, number], background: [number, number, number]) {
  const direction = foreground.map((value, index) => value - background[index])
  const directionLength = direction.reduce((sum, value) => sum + value * value, 0)
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * frame.width + x) * 4
      if (frame.pixels[index + 3] <= 150) continue
      const delta = [
        frame.pixels[index] - background[0],
        frame.pixels[index + 1] - background[1],
        frame.pixels[index + 2] - background[2],
      ]
      const coverage = delta.reduce((sum, value, channel) => sum + value * direction[channel], 0) / directionLength
      if (coverage < 0.2 || coverage > 1.05) continue
      const error = delta.reduce((sum, value, channel) => sum + Math.abs(value - coverage * direction[channel]), 0)
      if (error <= 24) count++
    }
  }
  return count
}

function assertSurface(frame: RenderToBufferResult, x: number, y: number, color: [number, number, number], label: string) {
  assert.ok(countColor(frame, x, y, x + 530, y + 120, color, 8) > 500, `${label} surface is missing`)
}

function firstInkX(frame: RenderToBufferResult, x0: number, y0: number, x1: number, y1: number, background: [number, number, number]) {
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      const index = (y * frame.width + x) * 4
      if (frame.pixels[index + 3] > 150
        && (Math.abs(frame.pixels[index] - background[0]) > 5
          || Math.abs(frame.pixels[index + 1] - background[1]) > 5
          || Math.abs(frame.pixels[index + 2] - background[2]) > 5)) return x
    }
  }
  return Infinity
}

function inkCount(frame: RenderToBufferResult, x0: number, y0: number, x1: number, y1: number, background: [number, number, number]) {
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * frame.width + x) * 4
      if (frame.pixels[index + 3] > 150
        && (Math.abs(frame.pixels[index] - background[0]) > 5
          || Math.abs(frame.pixels[index + 1] - background[1]) > 5
          || Math.abs(frame.pixels[index + 2] - background[2]) > 5)) count++
    }
  }
  return count
}

function inkRuns(frame: RenderToBufferResult, x0: number, y0: number, x1: number, y1: number, background: [number, number, number]) {
  const runs: Array<[number, number]> = []
  for (let x = x0; x < x1; x++) {
    let ink = false
    for (let y = y0; y < y1; y++) {
      const index = (y * frame.width + x) * 4
      if (frame.pixels[index + 3] > 150
        && (Math.abs(frame.pixels[index] - background[0]) > 5
          || Math.abs(frame.pixels[index + 1] - background[1]) > 5
          || Math.abs(frame.pixels[index + 2] - background[2]) > 5)) {
        ink = true
        break
      }
    }
    const previous = runs[runs.length - 1]
    if (ink) {
      if (previous && previous[1] === x - 1) previous[1] = x
      else runs.push([x, x])
    }
  }
  return runs
}

function colorBounds(frame: RenderToBufferResult, x0: number, y0: number, x1: number, y1: number, color: [number, number, number], tolerance = 20) {
  let min = Infinity
  let max = -Infinity
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * frame.width + x) * 4
      if (Math.abs(frame.pixels[index] - color[0]) <= tolerance
        && Math.abs(frame.pixels[index + 1] - color[1]) <= tolerance
        && Math.abs(frame.pixels[index + 2] - color[2]) <= tolerance
        && frame.pixels[index + 3] > 150) {
        min = Math.min(min, x)
        max = Math.max(max, x)
      }
    }
  }
  return min === Infinity ? null : [min, max] as const
}

export async function render(options?: RenderToBufferOptions) {
  return renderToBufferAfterInteractions(
    () => <Scene />,
    width,
    height,
    async ({ frame }) => {
      // A real parser request is the readiness barrier. Component requests
      // are queued before this one; two actual render turns then deliver their
      // highlighted tokens to the scene.
      const client = getTreeSitterClient()
      try {
        const highlights = await new Promise<Awaited<ReturnType<typeof client.highlightOnce>>>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("syntax highlighter did not become ready within 5s")), 5000)
          client.highlightOnce(CODE, "typescript").then((result) => {
            clearTimeout(timer)
            resolve(result)
          }, (error) => {
            clearTimeout(timer)
            reject(error)
          })
        })
        if (highlights.length < 3) throw new Error("typescript syntax highlighter returned no meaningful captures")
        await frame()
        await frame()
      } finally {
        client.destroy()
      }
    },
    2,
    options,
  )
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)

  // The two columns retain their distinct public component surfaces.
  assertSurface(frame, 28, 112, [26, 26, 46], "headless code/diff")
  assertSurface(frame, 606, 112, [23, 23, 23], "styled code/diff")

  // One Dark keyword/string/function colors prove syntax tokens reached both
  // Code implementations instead of remaining the fallback foreground.
  assert.ok(countColor(frame, 38, 125, 570, 270, [198, 120, 221]) > 8, "headless syntax keyword color missing")
  assert.ok(countColor(frame, 616, 125, 1148, 270, [152, 195, 121]) > 8, "styled syntax string color missing")

  // Diff semantics have separate added/removed backgrounds and sign colors.
  assert.ok(countColor(frame, 28, 275, 570, 430, [26, 58, 26]) > 80, "headless added diff region missing")
  assert.ok(countColor(frame, 606, 275, 1148, 430, [58, 26, 26]) > 80, "styled removed diff region missing")
  // The plus glyph lives in the fixed 18px sign slot (x=73..91, y=390..407).
  // Linux's generic font can antialias every sample below the source RGB;
  // classify only blends on the added-sign-to-background color ray so a
  // blank background or a different hue cannot satisfy this check.
  assert.ok(countAntialiasedColor(frame, 73, 390, 91, 407, [78, 201, 78], [26, 58, 26]) > 2, "headless added sign color missing")
  // Small glyphs are antialiased against the removed-line background. Keep
  // this to the fixed sign slot instead of matching unrelated red pixels.
  assert.ok(countAntialiasedColor(frame, 651, 373, 669, 390, [224, 80, 80], [58, 26, 26]) > 2, "styled removed sign color missing")

  // Markdown headings use the headless cyan theme; VoidMarkdown maps heading
  // text to its foreground. These checks also catch a blank/overflow column.
  assert.ok(countColor(frame, 38, 450, 570, 780, [86, 212, 200]) > 10, "headless markdown heading color missing")
  assert.ok(countColor(frame, 616, 450, 1148, 780, [250, 250, 250]) > 10, "styled markdown foreground content missing")

  // Source-formatting spaces must survive the per-token text nodes. Code
  // indentation shifts `return` to the right in both public routes.
  const headlessCodeStart = firstInkX(frame, 54, 136, 570, 149, [26, 26, 46])
  const headlessIndentedCodeStart = firstInkX(frame, 54, 170, 570, 183, [26, 26, 46])
  const styledCodeStart = firstInkX(frame, 635, 136, 1148, 149, [23, 23, 23])
  const styledIndentedCodeStart = firstInkX(frame, 635, 170, 1148, 183, [23, 23, 23])
  assert.ok(headlessIndentedCodeStart - headlessCodeStart >= 6, "headless code indentation space collapsed")
  assert.ok(styledIndentedCodeStart - styledCodeStart >= 6, "styled code indentation space collapsed")

  // Inline Markdown spans must retain the spaces at token boundaries. The
  // gap between `The` and the following bold span is larger than a glyph's
  // natural antialiasing gap once its source space is preserved.
  for (const [x, label] of [[28, "headless"], [606, "styled"]] as const) {
    const runs = inkRuns(frame, x, 520, x + 350, 548, [17, 24, 39])
    assert.ok(runs.length >= 2, `${label} markdown paragraph did not render two token runs`)
    assert.ok(runs.length >= 7, `${label} markdown paragraph token geometry is incomplete`)
    for (const [before, after, boundary] of ([[0, 1, "before bold"], [1, 2, "after bold"]] as const)) {
      assert.ok(runs[after][0] - runs[before][1] - 1 >= 4, `${label} markdown ${boundary} space collapsed`)
    }
    const italic: [number, number, number] = label === "headless" ? [192, 160, 224] : [163, 163, 163]
    const italicBounds = colorBounds(frame, x, 520, x + 350, 548, italic, label === "styled" ? 2 : 20)
    assert.ok(italicBounds, `${label} markdown italic span is missing`)
    const beforeItalic = runs.slice().reverse().find((run) => run[1] < italicBounds![0])
    const afterItalic = runs.find((run) => run[0] > italicBounds![1])
    assert.ok(beforeItalic && afterItalic, `${label} markdown italic boundary geometry is incomplete`)
    assert.ok(italicBounds![0] - beforeItalic![1] - 1 >= 4, `${label} markdown before italic space collapsed`)
    assert.ok(afterItalic![0] - italicBounds![1] - 1 >= 4, `${label} markdown after italic space collapsed`)
  }

  // Diff code content also preserves leading indentation. The context line
  // intentionally contains two source-indent spaces; compare it with the
  // unindented removed line in each public route.
  const headlessContextX = firstInkX(frame, 92, 356, 570, 372, [26, 26, 46])
  const headlessRemovedX = firstInkX(frame, 92, 374, 570, 389, [58, 26, 26])
  const styledContextX = firstInkX(frame, 670, 356, 1148, 372, [23, 23, 23])
  const styledRemovedX = firstInkX(frame, 670, 374, 1148, 389, [58, 26, 26])
  assert.ok(headlessContextX - headlessRemovedX >= 5, "headless diff indentation space collapsed")
  assert.ok(styledContextX - styledRemovedX >= 5, "styled diff indentation space collapsed")

  // Gutter numbers are a horizontal pair on each line, not a column of
  // overflowed text fragments. The right half of the first context gutter
  // must contain its new-line number in the same 17px row.
  assert.ok(inkCount(frame, 48, 356, 72, 372, [13, 13, 20]) > 2, "headless diff gutter numbers stacked vertically")
  assert.ok(inkCount(frame, 626, 356, 650, 372, [38, 38, 38]) > 2, "styled diff gutter numbers stacked vertically")
  assert.equal(inkCount(frame, 28, 427, 72, 449, [17, 24, 39]), 0, "headless diff gutter overflowed its rows")
  assert.equal(inkCount(frame, 606, 427, 650, 449, [17, 24, 39]), 0, "styled diff gutter overflowed its rows")
}
