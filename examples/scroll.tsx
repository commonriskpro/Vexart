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
import { mount, onInput } from "@tge/renderer"
import { Box, Text, ScrollView } from "@tge/components"
import { createTerminal } from "@tge/terminal"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
} from "@tge/tokens"

// ── Generate sample items ──

const items = Array.from({ length: 30 }, (_, i) => ({
  label: `Item ${i + 1}`,
  color: [accent.thread, accent.anchor, accent.signal, accent.drift, accent.purple, accent.green][i % 6],
}))

// ── Item row ──

function ItemRow(props: { label: string; color: number; index: number }) {
  return (
    <Box
      backgroundColor={props.index % 2 === 0 ? surface.card : surface.panel}
      padding={spacing.md}
      direction="row"
      gap={spacing.md}
      alignY="center"
    >
      <Box
        width={8}
        height={8}
        backgroundColor={props.color}
        cornerRadius={radius.pill}
      />
      <Text color={textTokens.primary} fontSize={14}>
        {props.label}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
        {"Scroll to see more"}
      </Text>
    </Box>
  )
}

// ── App ──

function App() {
  const [precise, setPrecise] = createSignal(true)

  onInput((event) => {
    if (event.type === "key" && event.key === "tab") {
      setPrecise((p) => !p)
    }
  })

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
      <Box layer>
        <Text color={textTokens.primary} fontSize={16}>
          TGE Scroll Demo — 30 items in a scroll container
        </Text>
      </Box>

      <ScrollView
        width={400}
        height={300}
        scrollY
        scrollSpeed={precise() ? 1 : undefined}
        backgroundColor={surface.panel}
        cornerRadius={radius.xl}
        borderColor={border.normal}
        borderWidth={1}
        direction="column"
        gap={0}
      >
        {items.map((item, i) => (
          <ItemRow label={item.label} color={item.color} index={i} />
        ))}
      </ScrollView>

      <Box layer direction="column" gap={spacing.xs} alignX="center">
        <Text color={precise() ? accent.thread : textTokens.muted} fontSize={12}>
          {"Scroll: " + (precise() ? "Precise (1 line/tick)" : "Natural (momentum)")}
        </Text>
        <Text color={textTokens.muted} fontSize={12}>
          Tab: toggle mode | Mouse wheel: scroll | q: quit
        </Text>
      </Box>
    </Box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term)

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
