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
import { colors, radius, space, shadows } from "@tge/void"
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
      padding={space[6]}
      backgroundColor={colors.background}
      direction="column"
      gap={space[2]}
    >
      <Text color={colors.foreground}>Selectable Text Demo — Shift+drag to copy — press Q to quit</Text>

      <Box direction="row" gap={space[4]}>
        <Box
          width={400}
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          shadow={shadows.md}
          direction="column"
          gap={space[1]}
        >
          <Text color={colors.foreground}>About TGE</Text>
          <Text color={colors.foreground}>
            TGE is a pixel-native terminal rendering engine. This text is rendered as real ANSI terminal text — you can select it with Shift+click and copy it to your clipboard.
          </Text>
          <Text color="#4fc4d4">
            The rounded corners, shadows, and backgrounds are pixel-perfect images rendered behind the text.
          </Text>
        </Box>

        <Box
          width={300}
          padding={space[4]}
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          shadow={shadows.md}
          direction="column"
          gap={space[1]}
        >
          <Text color={colors.foreground}>Features</Text>
          <Text color="#22c55e">Selectable text</Text>
          <Text color="#4eaed0">Pixel backgrounds</Text>
          <Text color="#f59e0b">Anti-aliased corners</Text>
          <Text color="#a78bfa">Drop shadows</Text>
          <Text color="#a8483e">Glow effects</Text>
        </Box>
      </Box>

      <Box
        padding={space[4]}
        backgroundColor={colors.card}
        cornerRadius={radius.lg}
        borderColor={colors.border}
        borderWidth={1}
        direction="column"
        gap={space[1]}
      >
        <Text color={colors.foreground}>How it works</Text>
        <Text color={colors.mutedForeground}>
          Images are sent to the terminal with z-index=-1 (behind text). Text is rendered as standard ANSI escape codes on top. The terminal natively supports selecting ANSI text with Shift+mouse drag.
        </Text>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal, { selectableText: true })
