/**
 * TGE Interactive Demo — Phase 5 milestone.
 *
 * Proves the full reactive pipeline:
 *   SolidJS signals → reconciler → dirty flag → render loop → pixels
 *
 * Features:
 *   - Counter: Enter/Space to increment
 *   - Color cycling: Arrow keys to change accent color
 *   - Focus system: Tab to cycle between counter and color picker
 *   - Focus ring: focused element shows a highlighted border
 *   - Auto input: mount() handles terminal.onData → parser → dispatch
 *
 * Run: bun run examples/interactive.tsx
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal } from "solid-js"
import { mount, useFocus, onInput } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { createTerminal } from "@tge/terminal"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
} from "@tge/tokens"

// ── Color options for the picker ──

const colors = [
  { name: "Thread", value: accent.thread },
  { name: "Anchor", value: accent.anchor },
  { name: "Signal", value: accent.signal },
  { name: "Drift", value: accent.drift },
  { name: "Purple", value: accent.purple },
  { name: "Green", value: accent.green },
] as const

// ── Counter component ──

function Counter(props: { accentColor: () => number }) {
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
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.md}
      borderColor={focused() ? props.accentColor() : border.subtle}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={textTokens.primary} fontSize={16}>
        Counter
      </Text>
      <Text color={props.accentColor()} fontSize={16}>
        {String(count())}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
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
      const len = colors.length
      if (e.key === "right" || e.key === "down") {
        props.onColorChange((props.colorIndex() + 1) % len)
      } else if (e.key === "left" || e.key === "up") {
        props.onColorChange((props.colorIndex() - 1 + len) % len)
      }
    },
  })

  const currentColor = () => colors[props.colorIndex()]

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.md}
      borderColor={focused() ? currentColor().value : border.subtle}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={textTokens.primary} fontSize={16}>
        Accent Color
      </Text>
      <Box direction="row" gap={spacing.sm} alignY="center">
        {colors.map((c, i) => (
          <Box
            width={props.colorIndex() === i ? 16 : 10}
            height={props.colorIndex() === i ? 16 : 10}
            backgroundColor={c.value}
            cornerRadius={radius.pill}
          />
        ))}
      </Box>
      <Text color={currentColor().value} fontSize={14}>
        {currentColor().name}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
        {focused() ? "Arrows to change color" : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── App ──

function App() {
  const [colorIndex, setColorIndex] = createSignal(0)
  const accentColor = () => colors[colorIndex()].value

  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={surface.void}
      direction="column"
      alignX="center"
      alignY="center"
      gap={spacing.lg}
    >
      <Text color={textTokens.primary} fontSize={16}>
        TGE Interactive Demo
      </Text>

      <Box direction="row" gap={spacing.lg}>
        <Counter accentColor={accentColor} />
        <ColorPicker colorIndex={colorIndex} onColorChange={setColorIndex} />
      </Box>

      <Box direction="column" gap={spacing.xs} alignX="center">
        <Text color={textTokens.muted} fontSize={12}>
          Tab: cycle focus | Enter/Space: increment | Arrows: change color
        </Text>
        <Text color={textTokens.muted} fontSize={12}>
          Press q or Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()

  // mount() now handles everything:
  //   - Creates render loop (Clay + Zig + output)
  //   - Mounts SolidJS component tree
  //   - Connects terminal stdin → input parser → event dispatch
  //   - Starts 30fps render loop with dirty-flag optimization
  const cleanup = mount(() => <App />, term)

  // Only thing left: global quit handler (not part of component tree)
  onInput((event) => {
    if (event.type === "key") {
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
        cleanup()
        term.destroy()
        process.exit(0)
      }
    }
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
