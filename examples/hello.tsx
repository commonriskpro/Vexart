/**
 * TGE Hello World — Phase 3 milestone.
 *
 * Real JSX rendering: SolidJS components → Clay layout → Zig paint → terminal.
 * This is the first example that uses actual JSX compilation through
 * babel-preset-solid with generate: "universal" targeting @tge/renderer.
 *
 * Run: bun run examples/hello.tsx
 * Requires: bun zig:build && bun run clay:build
 */

import { mount } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { palette, surface, accent, text as textTokens, radius, spacing } from "@tge/tokens"

function Card(props: { title: string; subtitle: string }) {
  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.md}
    >
      <Text color={textTokens.primary} fontSize={16}>
        {props.title}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
        {props.subtitle}
      </Text>
    </Box>
  )
}

function StatusDot(props: { color: number }) {
  return (
    <Box
      width={12}
      height={12}
      backgroundColor={props.color}
      cornerRadius={radius.pill}
    />
  )
}

function App() {
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
      <Box direction="row" gap={spacing.sm}>
        <StatusDot color={accent.green} />
        <StatusDot color={accent.signal} />
        <StatusDot color={accent.drift} />
      </Box>

      <Card
        title="Hello from TGE"
        subtitle="Pixel-native terminal rendering"
      />

      <Box
        direction="row"
        gap={spacing.sm}
        padding={spacing.md}
      >
        <Box width={32} height={8} backgroundColor={accent.thread} cornerRadius={radius.md} />
        <Box width={32} height={8} backgroundColor={accent.anchor} cornerRadius={radius.md} />
        <Box width={32} height={8} backgroundColor={accent.purple} cornerRadius={radius.md} />
      </Box>

      <Text color={textTokens.muted} fontSize={12}>
        Press q to exit
      </Text>
    </Box>
  )
}

async function main() {
  const term = await createTerminal()

  const cleanup = mount(() => <App />, term)

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      cleanup()
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
