/**
 * TGE Scroll Demo — browser-style scroll containers.
 *
 * A fixed-height ScrollView containing more items than fit on screen.
 * Mouse wheel scrolls the list. Tab toggles between precise (1-line)
 * and natural (momentum) scroll modes.
 *
 * Architecture (same as browsers):
 *   - ScrollView is its own compositing layer
 *   - Clay tracks scroll offset internally
 *   - SCISSOR_START/END clip the rendered content
 *   - Content painted outside the layer buffer is bounds-checked by Zig
 *
 * Run:  bun run demo7 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal } from "solid-js"
import { mount, onInput, useTerminalDimensions } from "@vexart/engine"
import { Box, Text } from "@vexart/primitives"
import { ScrollView } from "@vexart/headless"
import { createTerminal } from "@vexart/engine"
import { colors, radius, space } from "@vexart/styled"

// ── Generate sample items ──

const items = Array.from({ length: 30 }, (_, i) => ({
  label: `Item ${i + 1}`,
  color: ["#4fc4d4", "#4eaed0", "#f59e0b", "#a8483e", "#a78bfa", "#22c55e"][i % 6],
}))

// ── Item row ──

function ItemRow(props: { label: string; color: string; index: number }) {
  return (
    <Box
      backgroundColor={props.index % 2 === 0 ? colors.card : colors.secondary}
      padding={space[2]}
      direction="row"
      gap={space[2]}
      alignY="center"
    >
      <Box
        width={8}
        height={8}
        backgroundColor={props.color}
        cornerRadius={radius.full}
      />
      <Text color={colors.foreground} fontSize={14}>
        {props.label}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {"Scroll to see more"}
      </Text>
    </Box>
  )
}

// ── App ──

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const [precise, setPrecise] = createSignal(true)
  const dims = useTerminalDimensions(props.terminal)

  onInput((event) => {
    if (event.type === "key" && event.key === "tab") {
      setPrecise((p) => !p)
    }
  })

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
          TGE Scroll Demo — 30 items in a scroll container
        </Text>
      </Box>

      <ScrollView
        width={400}
        height={300}
        scrollY
        scrollSpeed={precise() ? 1 : undefined}
        backgroundColor={colors.secondary}
        cornerRadius={radius.xl}
        borderColor={colors.border}
        borderWidth={1}
        direction="column"
        gap={0}
      >
        {items.map((item, i) => (
          <ItemRow label={item.label} color={item.color} index={i} />
        ))}
      </ScrollView>

      <Box layer direction="column" gap={space[0.5]} alignX="center">
        <Text color={precise() ? "#4fc4d4" : colors.mutedForeground} fontSize={12}>
          {"Scroll: " + (precise() ? "Precise (1 line/tick)" : "Natural (momentum)")}
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Tab: toggle mode | Mouse wheel: scroll | q: quit
        </Text>
      </Box>
    </Box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term, {
    experimental: {
    },
  })

  onInput((event) => {
    if (event.type === "key") {
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
        cleanup.destroy()
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
