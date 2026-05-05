/**
 * Font Family / Weight / Style Test
 *
 * Verifies that fontFamily, fontWeight, and fontStyle props flow from JSX
 * through the full pipeline to the Rust MSDF renderer.
 *
 * Each row should render visually distinct text based on its font properties.
 *
 * Run: bun --conditions=browser run examples/font-family-test.tsx
 */
import { createApp, Box, Text } from "@vexart/app"
import { useTerminalDimensions } from "@vexart/engine"
import { colors, radius, space, font } from "@vexart/styled"
import { useAppTerminal } from "@vexart/app"

function Label(props: { children: any }) {
  return (
    <Box width={180}>
      <Text color={colors.mutedForeground} fontSize={font.xs}>
        {props.children}
      </Text>
    </Box>
  )
}

function Section(props: { title: string; children: any }) {
  return (
    <Box direction="column" gap={space[2]} width="100%">
      <Text color="#56d4c8" fontSize={font.sm} fontWeight={700}>
        {props.title}
      </Text>
      <Box
        direction="column"
        gap={space[2]}
        paddingLeft={space[3]}
        width="100%"
      >
        {props.children}
      </Box>
    </Box>
  )
}

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const sample = "The quick brown fox jumps over the lazy dog"

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      padding={space[4]}
      gap={space[5]}
      scrollY
      scrollSpeed={3}
    >
      {/* Header */}
      <Box direction="column" gap={space[1]} width="100%">
        <Text color={colors.foreground} fontSize={font["2xl"]} fontWeight={700}>
          Font Family / Weight / Style Test
        </Text>
        <Text color={colors.mutedForeground} fontSize={font.sm}>
          Props flow: JSX → walk-tree → layout-adapter → render-graph → gpu-renderer → Rust MSDF
        </Text>
      </Box>

      {/* Font Family comparison */}
      <Section title="FONT FAMILY">
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontFamily="sans-serif"</Label>
          <Text color={colors.foreground} fontSize={16} fontFamily="sans-serif">
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontFamily="serif"</Label>
          <Text color={colors.foreground} fontSize={16} fontFamily="serif">
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontFamily="monospace"</Label>
          <Text color={colors.foreground} fontSize={16} fontFamily="monospace">
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontFamily="cursive"</Label>
          <Text color={colors.foreground} fontSize={16} fontFamily="cursive">
            {sample}
          </Text>
        </Box>
      </Section>

      {/* Font Weight comparison */}
      <Section title="FONT WEIGHT">
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontWeight=100 (thin)</Label>
          <Text color={colors.foreground} fontSize={18} fontWeight={100}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontWeight=300 (light)</Label>
          <Text color={colors.foreground} fontSize={18} fontWeight={300}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontWeight=400 (normal)</Label>
          <Text color={colors.foreground} fontSize={18} fontWeight={400}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontWeight=600 (semibold)</Label>
          <Text color={colors.foreground} fontSize={18} fontWeight={600}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontWeight=700 (bold)</Label>
          <Text color={colors.foreground} fontSize={18} fontWeight={700}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontWeight=900 (black)</Label>
          <Text color={colors.foreground} fontSize={18} fontWeight={900}>
            {sample}
          </Text>
        </Box>
      </Section>

      {/* Font Style comparison */}
      <Section title="FONT STYLE">
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontStyle="normal"</Label>
          <Text color={colors.foreground} fontSize={18} fontStyle="normal">
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>fontStyle="italic"</Label>
          <Text color={colors.foreground} fontSize={18} fontStyle="italic">
            {sample}
          </Text>
        </Box>
      </Section>

      {/* Combined props */}
      <Section title="COMBINATIONS">
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>serif + bold</Label>
          <Text color={colors.foreground} fontSize={18} fontFamily="serif" fontWeight={700}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>serif + italic</Label>
          <Text color={colors.foreground} fontSize={18} fontFamily="serif" fontStyle="italic">
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>serif + bold + italic</Label>
          <Text color={colors.foreground} fontSize={18} fontFamily="serif" fontWeight={700} fontStyle="italic">
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>monospace + bold</Label>
          <Text color={colors.foreground} fontSize={18} fontFamily="monospace" fontWeight={700}>
            {sample}
          </Text>
        </Box>
        <Box direction="row" gap={space[3]} alignY="center" width="100%">
          <Label>monospace + italic</Label>
          <Text color={colors.foreground} fontSize={18} fontFamily="monospace" fontStyle="italic">
            {sample}
          </Text>
        </Box>
      </Section>

      {/* Real-world card with mixed typography */}
      <Section title="REAL-WORLD CARD">
        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          padding={space[5]}
          gap={space[3]}
          width="grow"
          maxWidth={600}
          shadow={{ x: 0, y: 4, blur: 16, color: "#00000040" }}
        >
          <Text color={colors.foreground} fontSize={font.xl} fontFamily="serif" fontWeight={700}>
            Typography in the Terminal
          </Text>
          <Text color={colors.mutedForeground} fontSize={font.base} fontFamily="sans-serif">
            With MSDF rendering, we can mix serif headings with sans-serif body text — just like the web.
          </Text>
          <Box
            backgroundColor="#1e1e2e"
            cornerRadius={radius.md}
            padding={space[3]}
          >
            <Text color="#a6e3a1" fontSize={font.sm} fontFamily="monospace">
              {"const engine = await createApp(() => <App />)"}
            </Text>
          </Box>
          <Text color={colors.mutedForeground} fontSize={font.xs} fontStyle="italic">
            — Vexart GPU-accelerated terminal UI engine
          </Text>
        </Box>
      </Section>

      {/* Footer */}
      <Box paddingTop={space[2]} width="100%">
        <Text color="#404040" fontSize={font.xs}>
          {`Terminal: ${dims.width()}x${dims.height()}px | Press q to quit`}
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, { quit: ["q", "ctrl+c"] })
