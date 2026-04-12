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
import { colors, radius, space } from "@tge/void"

function Card(props: { title: string; subtitle: string }) {
  return (
    <Box
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[2]}
    >
      <Text color={colors.foreground} fontSize={16}>
        {props.title}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {props.subtitle}
      </Text>
    </Box>
  )
}

function StatusDot(props: { color: string }) {
  return (
    <Box
      width={12}
      height={12}
      backgroundColor={props.color}
      cornerRadius={radius.full}
    />
  )
}

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      direction="column"
      alignX="center"
      alignY="center"
      gap={space[4]}
    >
      <Box direction="row" gap={space[1]}>
        <StatusDot color="#22c55e" />
        <StatusDot color="#f59e0b" />
        <StatusDot color="#a8483e" />
      </Box>

      <Card
        title="Hello from TGE"
        subtitle="Pixel-native terminal rendering"
      />

      <Box
        direction="row"
        gap={space[1]}
        padding={space[2]}
      >
        <Box width={32} height={8} backgroundColor={colors.primary} cornerRadius={radius.md} />
        <Box width={32} height={8} backgroundColor="#4eaed0" cornerRadius={radius.md} />
        <Box width={32} height={8} backgroundColor="#a78bfa" cornerRadius={radius.md} />
      </Box>

      <Text color={colors.mutedForeground} fontSize={12}>
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
