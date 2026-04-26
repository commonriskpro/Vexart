/**
 * Vexart Layer + Scroll Container Test — verifies layer compositing
 * works correctly with scroll containers.
 *
 * Tests:
 *   1. Two columns with `layer` + `scrollY` → independent scroll
 *   2. Each column's content stays in its own layer buffer
 *   3. No cross-contamination between layers
 *
 * Run: bun run examples/layer-scroll.tsx
 */

import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
import {
  Button, Card, CardHeader, CardTitle, CardContent,
  Badge, H3, P, Muted,
  colors, radius, space, font, weight,
} from "@vexart/styled"

function ItemCard(props: { title: string; color: number; index: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title} #{String(props.index)}</CardTitle>
      </CardHeader>
      <CardContent>
        <box direction="row" gap={space[2]} alignY="center">
          <Badge>{String(props.index)}</Badge>
          <P>Content for item {String(props.index)}</P>
        </box>
        <box
          height={40}
          backgroundColor={props.color}
          cornerRadius={radius.md}
          alignX="center" alignY="center"
        >
          <text color={0xffffffff} fontSize={font.xs}>Color block</text>
        </box>
      </CardContent>
    </Card>
  )
}

const leftItems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const rightItems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

function LeftColumn() {
  return (
    <box direction="column" gap={space[3]}>
      <H3>Left Panel (Layer + Scroll)</H3>
      <Muted>Scroll this independently from the right panel</Muted>
      {leftItems.map(i => (
        <ItemCard title="Left" color={0x3b82f6ff} index={i} />
      ))}
    </box>
  )
}

function RightColumn() {
  return (
    <box direction="column" gap={space[3]}>
      <H3>Right Panel (Layer + Scroll)</H3>
      <Muted>Scroll this independently from the left panel</Muted>
      {rightItems.map(i => (
        <ItemCard title="Right" color={0xdc2626ff} index={i} />
      ))}
    </box>
  )
}

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="row"
      padding={space[4]}
      gap={space[4]}
    >
      {/* Left column — LAYER + SCROLL on same node */}
      <box
        layer
        direction="column"
        width="grow"
        scrollY={true}
        backgroundColor={colors.card}
        cornerRadius={radius.lg}
        padding={space[3]}
      >
        <LeftColumn />
      </box>

      {/* Right column — LAYER + SCROLL on same node */}
      <box
        layer
        direction="column"
        width="grow"
        scrollY={true}
        backgroundColor={colors.card}
        cornerRadius={radius.lg}
        padding={space[3]}
      >
        <RightColumn />
      </box>
    </box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: {
    experimental: {
    },
  },
})
