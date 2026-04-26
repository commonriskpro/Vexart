/**
 * Vexart Layer Compositing Demo — per-component layer granularity.
 *
 * Each component with `layer` prop gets its own Kitty image with z-index.
 * When the counter increments, ONLY the counter card (~12KB) retransmits.
 * The color picker, title, hints, and background stay in terminal GPU VRAM.
 *
 * Features:
 *   - Counter: Enter/Space to increment (only counter layer repaints)
 *   - Color cycling: Arrow keys to change accent color
 *   - Focus system: Tab to cycle between counter and color picker
 *   - Per-card layers: each card is its own compositing layer
 *
 * Run: bun run examples/layers.tsx (requires Ghostty WITHOUT tmux)
 * Requires: bun install && cargo build
 */

import { createSignal } from "solid-js"
import { useFocus, useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import { colors, radius, space } from "@vexart/styled"

// ── Color options for the picker ──

const accentColors = [
  { name: "Thread", value: "#4fc4d4" },
  { name: "Anchor", value: "#4eaed0" },
  { name: "Signal", value: "#f59e0b" },
  { name: "Drift", value: "#a8483e" },
  { name: "Purple", value: "#a78bfa" },
  { name: "Green", value: "#22c55e" },
] as const

// ── Counter component ──

function Counter(props: { accentColor: () => string }) {
  const [count, setCount] = createSignal(0)

  const { focused } = useFocus({
    onKeyDown(e) {
      if (e.key === "enter" || e.key === " ") {
        setCount((c) => c + 1)
      }
    },
  })

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[2]}
      borderColor={focused() ? props.accentColor() : colors.border}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={colors.foreground} fontSize={16}>
        Counter
      </Text>
      <Text color={props.accentColor()} fontSize={16}>
        {String(count())}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {focused() ? "Enter/Space to increment" : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── Color picker component ──

function ColorPicker(props: {
  colorIndex: () => number
  onColorChange: (index: number) => void
}) {
  const { focused } = useFocus({
    onKeyDown(e) {
      const len = accentColors.length
      if (e.key === "right" || e.key === "down") {
        props.onColorChange((props.colorIndex() + 1) % len)
      } else if (e.key === "left" || e.key === "up") {
        props.onColorChange((props.colorIndex() - 1 + len) % len)
      }
    },
  })

  const currentColor = () => accentColors[props.colorIndex()]

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[2]}
      borderColor={focused() ? currentColor().value : colors.border}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={colors.foreground} fontSize={16}>
        Accent Color
      </Text>
      <Box direction="row" gap={space[1]} alignY="center">
        {accentColors.map((c, i) => (
          <Box
            width={props.colorIndex() === i ? 16 : 10}
            height={props.colorIndex() === i ? 16 : 10}
            backgroundColor={c.value}
            cornerRadius={radius.full}
          />
        ))}
      </Box>
      <Text color={currentColor().value} fontSize={14}>
        {currentColor().name}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {focused() ? "Arrows to change color" : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── App ──

function App() {
  const [colorIndex, setColorIndex] = createSignal(0)
  const accentColor = () => accentColors[colorIndex()].value
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
      alignX="center"
      alignY="center"
      gap={space[4]}
    >
      <Box layer>
        <Text color={colors.foreground} fontSize={16}>
          Vexart Per-Layer Granularity Demo
        </Text>
      </Box>

      <Box direction="row" gap={space[4]}>
        <Counter accentColor={accentColor} />
        <ColorPicker colorIndex={colorIndex} onColorChange={setColorIndex} />
      </Box>

      <Box layer direction="column" gap={space[0.5]} alignX="center">
        <Text color={colors.mutedForeground} fontSize={12}>
          Tab: cycle focus | Enter/Space: increment | Arrows: change color
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Press q or Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: {
    experimental: {
    },
  },
})
