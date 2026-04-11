/**
 * Text wrap & multi-font demo — tests Pretext integration.
 *
 * Shows:
 * - Word wrapping within containers
 * - Multi-line text with automatic height
 * - Different container widths
 * - RichText with mixed Spans
 *
 * Run: bun --conditions=browser run examples/text-wrap.tsx
 */

import { mount, onInput, registerFont } from "@tge/renderer"
import { Box, Text, RichText, Span } from "@tge/components"
import { surface, text as textTokens, accent, border, radius, spacing, shadow } from "@tge/tokens"
import { createTerminal } from "@tge/terminal"
import { onCleanup } from "solid-js"

function App() {
  const unsub = onInput((e) => {
    if (e.type === "key" && (e.key === "q" || e.key === "escape")) process.exit(0)
  })
  onCleanup(unsub)

  const longText = "TGE is a pixel-native terminal rendering engine. Write JSX and get browser-quality UI in your terminal with anti-aliased corners, drop shadows, gradients, and glow effects. This text should wrap automatically within its container, demonstrating the Pretext layout engine integration."

  const features = "Features: word wrapping, multi-line layout, BiDi support, CJK line breaking, rich inline text with mixed fonts. Powered by @chenglou/pretext."

  return (
    <Box
      width="100%"
      height="100%"
      padding={spacing.xl}
      backgroundColor={surface.void}
      direction="column"
      gap={spacing.lg}
    >
      <Text color={textTokens.primary}>Pretext Integration Demo — press Q to quit</Text>

      <Box direction="row" gap={spacing.lg}>
        {/* Wide card with word wrap */}
        <Box direction="column" gap={spacing.sm}>
          <Text color={textTokens.muted}>Word wrap (400px):</Text>
          <Box
            width={400}
            padding={spacing.lg}
            backgroundColor={surface.card}
            cornerRadius={radius.lg}
            shadow={shadow.subtle}
          >
            <Text color={textTokens.secondary}>{longText}</Text>
          </Box>
        </Box>

        {/* Narrow card with word wrap */}
        <Box direction="column" gap={spacing.sm}>
          <Text color={textTokens.muted}>Narrow (200px):</Text>
          <Box
            width={200}
            padding={spacing.md}
            backgroundColor={surface.card}
            cornerRadius={radius.lg}
            shadow={shadow.subtle}
          >
            <Text color={accent.thread}>{features}</Text>
          </Box>
        </Box>
      </Box>

      {/* Rich text demo */}
      <Box direction="column" gap={spacing.sm}>
        <Text color={textTokens.muted}>Rich inline text:</Text>
        <Box
          width={500}
          padding={spacing.lg}
          backgroundColor={surface.card}
          cornerRadius={radius.lg}
          shadow={shadow.elevated}
          direction="column"
          gap={spacing.sm}
        >
          <RichText>
            <Span color={textTokens.primary}>TGE </Span>
            <Span color={accent.thread}>renders pixels </Span>
            <Span color={textTokens.primary}>in your </Span>
            <Span color={accent.signal}>terminal</Span>
          </RichText>
          <RichText>
            <Span color={textTokens.muted}>Powered by: </Span>
            <Span color={accent.anchor}>SolidJS</Span>
            <Span color={textTokens.muted}> + </Span>
            <Span color={accent.green}>Clay</Span>
            <Span color={textTokens.muted}> + </Span>
            <Span color={accent.purple}>Zig</Span>
            <Span color={textTokens.muted}> + </Span>
            <Span color={accent.drift}>Pretext</Span>
          </RichText>
        </Box>
      </Box>

      {/* Two columns with wrapping text */}
      <Box direction="row" gap={spacing.lg}>
        <Box
          width={300}
          padding={spacing.md}
          backgroundColor={surface.card}
          cornerRadius={radius.md}
          borderColor={border.normal}
          borderWidth={1}
          direction="column"
          gap={spacing.sm}
        >
          <Text color={textTokens.primary}>Column A</Text>
          <Text color={textTokens.secondary}>
            Clay provides CSS-like flexbox layout with microsecond performance. Each text element is measured by Pretext and positioned by Clay.
          </Text>
        </Box>
        <Box
          width={300}
          padding={spacing.md}
          backgroundColor={surface.card}
          cornerRadius={radius.md}
          borderColor={border.normal}
          borderWidth={1}
          direction="column"
          gap={spacing.sm}
        >
          <Text color={textTokens.primary}>Column B</Text>
          <Text color={accent.signal}>
            Zig handles the pixel painting with SDF anti-aliased primitives. Every shape is rendered with sub-pixel precision.
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
