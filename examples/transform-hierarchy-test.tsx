/**
 * Transform HIERARCHY Test — Parent transforms propagate to children.
 *
 * Run: bun --conditions=browser run examples/transform-hierarchy-test.tsx
 *
 * Tests:
 * 1. Parent with perspective → children inherit the tilt (hit-testing)
 * 2. Animated parent rotation → children follow
 * 3. Parent rotate + child scale (composed transforms, hit-testing)
 * 4. Deep nesting (3 levels) — parent rotate + child rotate + grandchild scale
 * 5. 2-level hierarchy — parent rotate(30) + child rotate(15)
 */

import { createSignal } from "solid-js"
import { mount, markDirty } from "@vexart/engine"
import { createTerminal } from "@vexart/engine"
import { createParser } from "@vexart/engine"
// import { colors, radius, space, font } from "@vexart/styled"

function App() {
  const [angle, setAngle] = createSignal(0)
  const [clicks, setClicks] = createSignal<string[]>([])

  // Animate rotation
  setInterval(() => {
    setAngle(a => (a + 1) % 360)
    markDirty()
  }, 33)

  function handleClick(name: string) {
    setClicks(c => [...c.slice(-4), name])
    markDirty()
  }

  return (
    <box
      width="grow"
      height="grow"
      backgroundColor={0x0a0a14ff}
      padding={30}
      gap={20}
    >
      {/* Title */}
      <box direction="row" gap={10} alignY="center">
        <text color={0xffffffff} fontSize={20} fontWeight={700}>
          Transform Hierarchy
        </text>
        <text color={0x888888ff} fontSize={13}>
          {`angle: ${angle()}° | clicks: [${clicks().join(", ")}]`}
        </text>
      </box>

      {/* Test cases row */}
      <box direction="row" gap={30} alignY="top" width="grow">

        {/* ─── Test 1: Perspective parent, children inherit ─── */}
        <box gap={8}>
          <text color={0xaaaaaaff} fontSize={12}>1. Perspective parent</text>
          <box
            transform={{ perspective: 600, rotateY: 20 }}
            backgroundColor={0x1a1a2eff}
            cornerRadius={12}
            padding={16}
            gap={10}
            width={200}
          >
            <text color={0xffffffff} fontSize={14} fontWeight={600}>Parent (perspective)</text>
            <box
              backgroundColor={0x56d4c8cc}
              cornerRadius={8}
              padding={10}
              focusable
              onPress={() => handleClick("child-A")}
              hoverStyle={{ backgroundColor: 0x56d4c8ff }}
            >
              <text color={0x000000ff} fontSize={12}>Child A (clickable)</text>
            </box>
            <box
              backgroundColor={0xd456c8cc}
              cornerRadius={8}
              padding={10}
              focusable
              onPress={() => handleClick("child-B")}
              hoverStyle={{ backgroundColor: 0xd456c8ff }}
            >
              <text color={0x000000ff} fontSize={12}>Child B (clickable)</text>
            </box>
          </box>
        </box>

        {/* ─── Test 2: Rotating parent, children follow ─── */}
        <box gap={8}>
          <text color={0xaaaaaaff} fontSize={12}>2. Animated rotation</text>
          <box
            transform={{ rotate: angle() }}
            transformOrigin="center"
            backgroundColor={0x1e1a2eff}
            cornerRadius={12}
            padding={16}
            gap={8}
            width={160}
            height={120}
            alignX="center"
            alignY="center"
          >
            <box
              backgroundColor={0x44aa66cc}
              cornerRadius={6}
              padding={8}
              focusable
              onPress={() => handleClick("rotating-child")}
              hoverStyle={{ backgroundColor: 0x44aa66ff }}
            >
              <text color={0xffffffff} fontSize={11}>I rotate with parent</text>
            </box>
          </box>
        </box>

        {/* ─── Test 3: Parent rotate + child scale (composed) ─── */}
        <box gap={8}>
          <text color={0xaaaaaaff} fontSize={12}>3. Parent rotate + child scale</text>
          <box
            transform={{ rotate: 15 }}
            backgroundColor={0x2e1a1aff}
            cornerRadius={12}
            padding={16}
            gap={10}
            width={200}
          >
            <text color={0xffffffff} fontSize={13} fontWeight={600}>Parent (15° tilt)</text>
            <box
              transform={{ scale: 1.15 }}
              backgroundColor={0xcc6633cc}
              cornerRadius={8}
              padding={10}
              focusable
              onPress={() => handleClick("scaled-child")}
              hoverStyle={{ backgroundColor: 0xcc6633ff }}
            >
              <text color={0xffffffff} fontSize={11}>Scaled 1.15x + parent tilt</text>
            </box>
            <box
              backgroundColor={0x6633cccc}
              cornerRadius={8}
              padding={10}
              focusable
              onPress={() => handleClick("plain-child")}
              hoverStyle={{ backgroundColor: 0x6633ccff }}
            >
              <text color={0xffffffff} fontSize={11}>No own transform (inherits)</text>
            </box>
          </box>
        </box>

        {/* ─── Test 4: Deep nesting (3 levels) ─── */}
        <box gap={8}>
          <text color={0xaaaaaaff} fontSize={12}>4. Deep nesting (3 levels)</text>
          <box
            transform={{ rotate: 20 }}
            backgroundColor={0x1a2e1aff}
            cornerRadius={12}
            padding={12}
            gap={8}
            width={200}
          >
            <text color={0xffffffff} fontSize={12}>Level 1 (rotate 20)</text>
            <box
              transform={{ rotate: 10 }}
              backgroundColor={0x2a4e2aff}
              cornerRadius={8}
              padding={10}
              gap={6}
            >
              <text color={0xccffccff} fontSize={11}>Level 2 (rotate 10)</text>
              <box
                transform={{ scale: 1.15 }}
                backgroundColor={0x3a6e3aff}
                cornerRadius={6}
                padding={8}
                focusable
                onPress={() => handleClick("deep-child")}
                hoverStyle={{ backgroundColor: 0x4a8e4aff }}
              >
                <text color={0xffffffff} fontSize={10}>Level 3 (scale 1.15)</text>
              </box>
            </box>
          </box>
        </box>

        {/* ─── Test 5: Aggressive 2-level ─── */}
        <box gap={8}>
          <text color={0xaaaaaaff} fontSize={12}>5. 2-level (rotate 30)</text>
          <box
            transform={{ rotate: 30 }}
            backgroundColor={0x1a2e1aff}
            cornerRadius={12}
            padding={12}
            gap={8}
            width={200}
          >
            <text color={0xffffffff} fontSize={12}>L1 (rotate 30)</text>
            <box
              transform={{ rotate: 15 }}
              backgroundColor={0x2a4e2aff}
              cornerRadius={8}
              padding={10}
              gap={6}
            >
              <text color={0xccffccff} fontSize={11}>L2 (rotate 15)</text>
            </box>
          </box>
        </box>

      </box>

      {/* Status */}
      <box direction="row" gap={6}>
        <text color={0x666666ff} fontSize={11}>
          Press q to quit | Click children to test hit-testing through hierarchy
        </text>
      </box>
    </box>
  )
}

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term)

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
