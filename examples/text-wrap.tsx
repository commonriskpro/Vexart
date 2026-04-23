/**
 * Text & rich text demo — typography showcase.
 *
 * Shows:
 * - Multiple text sizes and colors
 * - Inline rich text (Spans in a row)
 * - Two-column layout with short text
 * - SF Pro font rendering quality
 *
 * NOTE: Automatic text wrapping within fixed-width containers is not yet
 * supported — Taffy computes layout before text measurement, so long text
 * renders as a single line. Use short text or manual line breaks for now.
 *
 * Run: bun --conditions=browser run examples/text-wrap.tsx
 */

import { mount, onInput } from "@vexart/engine"
import { Box, Text, RichText, Span } from "@vexart/primitives"
import { colors, radius, space, shadows } from "@vexart/styled"
import { createTerminal } from "@vexart/engine"
import { onCleanup } from "solid-js"

function App() {
  const unsub = onInput((e) => {
    if (e.type === "key" && (e.key === "q" || e.key === "escape")) process.exit(0)
  })
  onCleanup(unsub)

  return (
    <Box
      width="100%"
      height="100%"
      padding={space[6]}
      backgroundColor={colors.background}
      direction="column"
      gap={space[4]}
    >
      <Text color={colors.foreground} fontSize={16}>Typography Demo — press Q to quit</Text>

      {/* Text sizes */}
      <Box direction="column" gap={space[2]}>
        <Text color={colors.mutedForeground} fontSize={12}>Text sizes:</Text>
        <Box
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          shadow={shadows.sm}
          direction="column"
          gap={space[2]}
        >
          <Text color={colors.foreground} fontSize={12}>12px — Small body text</Text>
          <Text color={colors.foreground} fontSize={14}>14px — Default body text</Text>
          <Text color={colors.foreground} fontSize={16}>16px — Large body text</Text>
          <Text color={colors.foreground} fontSize={20}>20px — Heading text</Text>
        </Box>
      </Box>

      {/* Inline rich text — spans flow horizontally */}
      <Box direction="column" gap={space[2]}>
        <Text color={colors.mutedForeground} fontSize={12}>Inline spans (row flow):</Text>
        <Box
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          shadow={shadows.md}
          direction="column"
          gap={space[1]}
        >
          <RichText>
            <Span color={colors.foreground}>Vexart </Span>
            <Span color="#4fc4d4">renders pixels </Span>
            <Span color={colors.foreground}>in your </Span>
            <Span color="#f59e0b">terminal</Span>
          </RichText>
          <RichText>
            <Span color={colors.mutedForeground}>Powered by: </Span>
            <Span color="#4eaed0">SolidJS </Span>
            <Span color={colors.mutedForeground}>+ </Span>
            <Span color="#22c55e">Taffy </Span>
            <Span color={colors.mutedForeground}>+ </Span>
            <Span color="#a78bfa">Rust/WGPU </Span>
            <Span color={colors.mutedForeground}>+ </Span>
            <Span color="#a8483e">Pretext</Span>
          </RichText>
        </Box>
      </Box>

      {/* Two columns with short text */}
      <Box direction="row" gap={space[4]}>
        <Box
          width={300}
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.md}
          borderColor={colors.border}
          borderWidth={1}
          direction="column"
          gap={space[2]}
        >
          <Text color={colors.foreground} fontSize={14}>Layout Engine</Text>
          <Text color={colors.mutedForeground} fontSize={12}>Taffy — CSS flexbox in Rust</Text>
          <Text color={colors.mutedForeground} fontSize={12}>Microsecond performance</Text>
          <Text color={colors.mutedForeground} fontSize={12}>Per-frame full rebuild</Text>
        </Box>
        <Box
          width={300}
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.md}
          borderColor={colors.border}
          borderWidth={1}
          direction="column"
          gap={space[2]}
        >
          <Text color="#f59e0b" fontSize={14}>Paint Engine</Text>
          <Text color={colors.mutedForeground} fontSize={12}>WGPU — GPU-accelerated rendering</Text>
          <Text color={colors.mutedForeground} fontSize={12}>SDF anti-aliased primitives</Text>
          <Text color={colors.mutedForeground} fontSize={12}>Sub-pixel precision</Text>
        </Box>
      </Box>

      {/* Color palette */}
      <Box direction="column" gap={space[2]}>
        <Text color={colors.mutedForeground} fontSize={12}>Color palette:</Text>
        <Box direction="row" gap={space[2]}>
          <Text color="#4fc4d4">Cyan</Text>
          <Text color="#4eaed0">Blue</Text>
          <Text color="#f59e0b">Amber</Text>
          <Text color="#a78bfa">Purple</Text>
          <Text color="#22c55e">Green</Text>
          <Text color="#a8483e">Red</Text>
          <Text color={colors.foreground}>White</Text>
          <Text color={colors.mutedForeground}>Muted</Text>
        </Box>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
