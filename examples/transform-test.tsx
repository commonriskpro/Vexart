/**
 * Transform System Test — Visual verification of 2D affine transforms.
 *
 * Run: bun --conditions=browser run examples/transform-test.tsx
 */

import { createSignal } from "solid-js"
import { mount, markDirty, useTerminalDimensions } from "@vexart/engine"
import { createTerminal } from "@vexart/engine"
import { createParser } from "@vexart/engine"
import { colors, radius, space, font } from "@vexart/styled"

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const [angle, setAngle] = createSignal(0)
  const [clicks, setClicks] = createSignal(0)
  const [lastClicked, setLastClicked] = createSignal("")
  const dims = useTerminalDimensions(props.terminal)

  // Animate rotation
  const interval = setInterval(() => {
    setAngle(a => (a + 2) % 360)
    markDirty()
  }, 50)

  function handleClick(name: string) {
    setClicks(c => c + 1)
    setLastClicked(name)
    markDirty()
  }

  return (
    <box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={0x0a0a14ff}
      padding={40}
      gap={40}
      alignX="center"
      alignY="center"
    >
      {/* Title */}
      <box direction="row" gap={10} alignY="center">
        <text color={0xffffffff} fontSize={20} fontWeight={700}>
          TGE Transform System
        </text>
        <text color={0x888888ff} fontSize={14}>
          {`angle: ${angle()}° | clicks: ${clicks()} | last: ${lastClicked() || "none"}`}
        </text>
      </box>

      {/* Test grid */}
      <box direction="row" gap={60} alignX="center" alignY="center">

        {/* 1. Static rotation — CLICKABLE */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>rotate(15°) click me!</text>
          <box
            width={120}
            height={80}
            backgroundColor={0x4488ccff}
            cornerRadius={12}
            transform={{ rotate: 15 }}
            padding={12}
            alignX="center"
            alignY="center"
            focusable
            onPress={() => handleClick("rotated")}
            hoverStyle={{ backgroundColor: 0x66aaEEff }}
            activeStyle={{ backgroundColor: 0x2266aaff }}
          >
            <text color={0xffffffff} fontSize={14}>Rotated</text>
          </box>
        </box>

        {/* 2. Scale — CLICKABLE */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>scale(1.3) click me!</text>
          <box
            width={120}
            height={80}
            backgroundColor={0xcc4488ff}
            cornerRadius={12}
            transform={{ scale: 1.3 }}
            padding={12}
            alignX="center"
            alignY="center"
            focusable
            onPress={() => handleClick("scaled")}
            hoverStyle={{ backgroundColor: 0xee66aaff }}
            activeStyle={{ backgroundColor: 0xaa2266ff }}
          >
            <text color={0xffffffff} fontSize={14}>Scaled</text>
          </box>
        </box>

        {/* 3. Animated rotation */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>rotate(animated)</text>
          <box
            width={120}
            height={80}
            backgroundColor={0x44cc88ff}
            cornerRadius={12}
            transform={{ rotate: angle() }}
            padding={12}
            alignX="center"
            alignY="center"
          >
            <text color={0xffffffff} fontSize={14}>Spinning</text>
          </box>
        </box>

        {/* 4. Perspective — CLICKABLE */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>perspective click!</text>
          <box
            width={120}
            height={80}
            backgroundColor={0xcc8844ff}
            cornerRadius={12}
            transform={{ perspective: 400, rotateY: 30 }}
            padding={12}
            alignX="center"
            alignY="center"
            focusable
            onPress={() => handleClick("perspective")}
            hoverStyle={{ backgroundColor: 0xeeaa66ff }}
            activeStyle={{ backgroundColor: 0xaa6622ff }}
          >
            <text color={0xffffffff} fontSize={14}>3D Tilt</text>
          </box>
        </box>
      </box>

      {/* Second row */}
      <box direction="row" gap={60} alignX="center" alignY="center">

        {/* 5. Skew — CLICKABLE */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>skewX(15°) click!</text>
          <box
            width={120}
            height={80}
            backgroundColor={0x8844ccff}
            cornerRadius={8}
            transform={{ skewX: 15 }}
            padding={12}
            alignX="center"
            alignY="center"
            focusable
            onPress={() => handleClick("skewed")}
            hoverStyle={{ backgroundColor: 0xaa66eeff }}
            activeStyle={{ backgroundColor: 0x6622aaff }}
          >
            <text color={0xffffffff} fontSize={14}>Skewed</text>
          </box>
        </box>

        {/* 6. Combined */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>rotate + scale + opacity</text>
          <box
            width={120}
            height={80}
            backgroundColor={0x56d4c8ff}
            cornerRadius={12}
            transform={{ rotate: -10, scale: 1.1 }}
            opacity={0.7}
            padding={12}
            alignX="center"
            alignY="center"
          >
            <text color={0xffffffff} fontSize={14}>Combined</text>
          </box>
        </box>

        {/* 7. Translate */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>translate(20, -10)</text>
          <box
            width={120}
            height={80}
            backgroundColor={0xd4c856ff}
            cornerRadius={12}
            transform={{ translateX: 20, translateY: -10 }}
            padding={12}
            alignX="center"
            alignY="center"
          >
            <text color={0xffffffff} fontSize={14}>Moved</text>
          </box>
        </box>

        {/* 8. Heavy perspective */}
        <box gap={10} alignX="center">
          <text color={0x888888ff} fontSize={12}>perspective + rotateX</text>
          <box
            width={120}
            height={80}
            backgroundColor={0xd45656ff}
            cornerRadius={12}
            transform={{ perspective: 300, rotateX: 25, rotateY: -15 }}
            padding={12}
            alignX="center"
            alignY="center"
          >
            <text color={0xffffffff} fontSize={14}>Depth</text>
          </box>
        </box>
      </box>

      <text color={0x555555ff} fontSize={11}>Press Ctrl+C to exit</text>
    </box>
  )
}

// ── Bootstrap ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term, {
    experimental: {
    },
  })
  const exitAfterMs = Number(process.env.TGE_EXIT_AFTER_MS ?? process.env.LIGHTCODE_EXIT_AFTER_MS ?? 0)

  const shutdown = () => {
    parser.destroy()
    cleanup.destroy()
    term.destroy()
    process.exit(0)
  }

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      shutdown()
    }
  })

  term.onData((data) => parser.feed(data))

  if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) {
    setTimeout(shutdown, exitAfterMs)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
