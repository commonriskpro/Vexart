/**
 * Text wrap & rich text demo — Pretext integration showcase.
 *
 * Shows:
 * - Word wrapping within containers of different widths
 * - Multi-line text with automatic height calculation
 * - Inline rich text (Spans in a row)
 * - Two-column layout with wrapping text
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

  const longText = "TGE is a pixel-native terminal rendering engine. Write JSX and get browser-quality UI in your terminal with anti-aliased corners, drop shadows, gradients, and glow effects. This text wraps automatically within its container using Pretext layout."

  const features = "Features: word wrapping, multi-line layout, BiDi support, CJK line breaking, rich inline text with mixed fonts. Powered by @chenglou/pretext."

  return (
    <Box
      width="100%"
      height="100%"
      padding={space[6]}
      backgroundColor={colors.background}
      direction="column"
      gap={space[2]}
    >
      <Text color={colors.foreground}>Pretext Integration Demo — press Q to quit</Text>

      <Box direction="row" gap={space[4]}>
        {/* Wide card with word wrap */}
        <Box direction="column" gap={space[0.5]}>
          <Text color={colors.mutedForeground}>Word wrap (400px):</Text>
          <Box
            width={400}
            padding={space[4]}
            backgroundColor={colors.card}
            cornerRadius={radius.lg}
            shadow={shadows.sm}
          >
            <Text color={colors.foreground}>{longText}</Text>
          </Box>
        </Box>

        {/* Narrow card with word wrap */}
        <Box direction="column" gap={space[0.5]}>
          <Text color={colors.mutedForeground}>Narrow (200px):</Text>
          <Box
            width={200}
            padding={space[2]}
            backgroundColor={colors.card}
            cornerRadius={radius.lg}
            shadow={shadows.sm}
          >
            <Text color="#4fc4d4">{features}</Text>
          </Box>
        </Box>
      </Box>

      {/* Inline rich text — spans flow horizontally */}
      <Box direction="column" gap={space[0.5]}>
        <Text color={colors.mutedForeground}>Inline spans (row flow):</Text>
        <Box
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          shadow={shadows.md}
          direction="column"
          gap={space[1]}
        >
          <RichText>
            <Span color={colors.foreground}>TGE </Span>
            <Span color="#4fc4d4">renders pixels </Span>
            <Span color={colors.foreground}>in your </Span>
            <Span color="#f59e0b">terminal</Span>
          </RichText>
          <RichText>
            <Span color={colors.mutedForeground}>Powered by: </Span>
            <Span color="#4eaed0">SolidJS </Span>
            <Span color={colors.mutedForeground}>+ </Span>
            <Span color="#22c55e">Clay </Span>
            <Span color={colors.mutedForeground}>+ </Span>
            <Span color="#a78bfa">Zig </Span>
            <Span color={colors.mutedForeground}>+ </Span>
            <Span color="#a8483e">Pretext</Span>
          </RichText>
        </Box>
      </Box>

      {/* Two columns with wrapping text */}
      <Box direction="row" gap={space[4]}>
        <Box
          width={300}
          padding={space[2]}
          backgroundColor={colors.card}
          cornerRadius={radius.md}
          borderColor={colors.border}
          borderWidth={1}
          direction="column"
          gap={space[1]}
        >
          <Text color={colors.foreground}>Column A</Text>
          <Text color={colors.foreground}>
            Clay provides CSS-like flexbox layout with microsecond performance. Each text element is measured by Pretext and positioned by Clay.
          </Text>
        </Box>
        <Box
          width={300}
          padding={space[2]}
          backgroundColor={colors.card}
          cornerRadius={radius.md}
          borderColor={colors.border}
          borderWidth={1}
          direction="column"
          gap={space[1]}
        >
          <Text color={colors.foreground}>Column B</Text>
          <Text color="#f59e0b">
            Zig handles the pixel painting with SDF anti-aliased primitives. Every shape is rendered with sub-pixel precision.
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
