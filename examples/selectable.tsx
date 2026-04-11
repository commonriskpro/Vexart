/**
 * Selectable text demo — text rendered as ANSI (copiable with Shift+click).
 * Backgrounds rendered as pixel images at z=-1.
 *
 * Run: bun --conditions=browser run examples/selectable.tsx
 *
 * Hold Shift + drag mouse to select and copy text.
 */

import { mount, onInput } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { surface, text as textTokens, accent, border, radius, spacing, shadow } from "@tge/tokens"
import { createTerminal } from "@tge/terminal"
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
      padding={spacing.xl}
      backgroundColor={surface.void}
      direction="column"
      gap={spacing.md}
    >
      <Text color={textTokens.primary}>Selectable Text Demo — Shift+drag to copy — press Q to quit</Text>

      <Box direction="row" gap={spacing.lg}>
        <Box
          width={400}
          padding={spacing.lg}
          backgroundColor={surface.card}
          cornerRadius={radius.lg}
          shadow={shadow.elevated}
          direction="column"
          gap={spacing.sm}
        >
          <Text color={textTokens.primary}>About TGE</Text>
          <Text color={textTokens.secondary}>
            TGE is a pixel-native terminal rendering engine. This text is rendered as real ANSI terminal text — you can select it with Shift+click and copy it to your clipboard.
          </Text>
          <Text color={accent.thread}>
            The rounded corners, shadows, and backgrounds are pixel-perfect images rendered behind the text.
          </Text>
        </Box>

        <Box
          width={300}
          padding={spacing.lg}
          backgroundColor={surface.card}
          cornerRadius={radius.lg}
          shadow={shadow.elevated}
          direction="column"
          gap={spacing.sm}
        >
          <Text color={textTokens.primary}>Features</Text>
          <Text color={accent.green}>Selectable text</Text>
          <Text color={accent.anchor}>Pixel backgrounds</Text>
          <Text color={accent.signal}>Anti-aliased corners</Text>
          <Text color={accent.purple}>Drop shadows</Text>
          <Text color={accent.drift}>Glow effects</Text>
        </Box>
      </Box>

      <Box
        padding={spacing.lg}
        backgroundColor={surface.card}
        cornerRadius={radius.lg}
        borderColor={border.normal}
        borderWidth={1}
        direction="column"
        gap={spacing.sm}
      >
        <Text color={textTokens.primary}>How it works</Text>
        <Text color={textTokens.muted}>
          Images are sent to the terminal with z-index=-1 (behind text). Text is rendered as standard ANSI escape codes on top. The terminal natively supports selecting ANSI text with Shift+mouse drag.
        </Text>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal, { selectableText: true })
