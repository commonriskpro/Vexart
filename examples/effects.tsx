/**
 * TGE Effects Demo — demo9.
 *
 * Showcases shadow and glow effects on Box components:
 *   - Drop shadows (subtle, elevated, floating)
 *   - Colored glows (thread, anchor, signal, green)
 *   - Combined shadow + glow
 *   - Interactive: focus changes glow intensity
 *
 * Run:  bun run demo9 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal } from "solid-js"
import { mount, useFocus, onInput, useTerminalDimensions } from "@vexart/engine"
import { Box, Text } from "@vexart/primitives"
import { createTerminal } from "@vexart/engine"
import { colors, radius, space, shadows } from "@vexart/styled"

// ── Shadow showcase ──

function ShadowSection() {
  return (
    <Box direction="column" gap={space[4]}>
      <Text color={colors.mutedForeground} fontSize={12}>
        Drop Shadows
      </Text>
      <Box direction="row" gap={space[8]}>
        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={shadows.sm}
        >
          <Text color={colors.foreground} fontSize={14}>
            Subtle
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={shadows.md}
        >
          <Text color={colors.foreground} fontSize={14}>
            Elevated
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={shadows.lg}
        >
          <Text color={colors.foreground} fontSize={14}>
            Floating
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={{ x: 4, y: 4, blur: 8, color: 0xa8483e60 }}
        >
          <Text color="#a8483e" fontSize={14}>
            Colored
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ── Glow showcase ──

function GlowSection() {
  return (
    <Box direction="column" gap={space[4]}>
      <Text color={colors.mutedForeground} fontSize={12}>
        Glow Effects
      </Text>
      <Box direction="row" gap={space[8]}>
        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          glow={{ radius: 20, color: 0x4fc4d4ff, intensity: 60 }}
        >
          <Text color="#4fc4d4" fontSize={14}>
            Thread
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          glow={{ radius: 20, color: 0x4eaed0ff, intensity: 60 }}
        >
          <Text color="#4eaed0" fontSize={14}>
            Anchor
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          glow={{ radius: 20, color: 0xf59e0bff, intensity: 60 }}
        >
          <Text color="#f59e0b" fontSize={14}>
            Signal
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          glow={{ radius: 20, color: "#22c55e", intensity: 60 }}
        >
          <Text color="#22c55e" fontSize={14}>
            Green
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ── Interactive: focus-driven glow ──

function InteractiveCard(props: { label: string; color: string }) {
  const { focused } = useFocus({
    onKeyDown() {},
  })

  return (
    <Box
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[1]}
      borderColor={focused() ? props.color : colors.border}
      borderWidth={focused() ? 2 : 1}
      glow={
        focused()
          ? { radius: 24, color: props.color, intensity: 80 }
          : undefined
      }
      shadow={focused() ? shadows.lg : shadows.sm}
    >
      <Text color={props.color} fontSize={14}>
        {props.label}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {focused() ? "Focused — glow on!" : "Tab to focus"}
      </Text>
    </Box>
  )
}

function InteractiveSection() {
  return (
    <Box direction="column" gap={space[4]}>
      <Text color={colors.mutedForeground} fontSize={12}>
        Interactive — Tab to cycle focus (glow follows)
      </Text>
      <Box direction="row" gap={space[8]}>
        <InteractiveCard label="Card A" color="#4fc4d4" />
        <InteractiveCard label="Card B" color="#4eaed0" />
        <InteractiveCard label="Card C" color="#a78bfa" />
        <InteractiveCard label="Card D" color="#22c55e" />
      </Box>
    </Box>
  )
}

// ── Combined shadow + glow ──

function CombinedSection() {
  return (
    <Box direction="column" gap={space[4]}>
      <Text color={colors.mutedForeground} fontSize={12}>
        Combined Shadow + Glow
      </Text>
      <Box direction="row" gap={space[8]}>
        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={shadows.md}
          glow={{ radius: 16, color: "#4fc4d4", intensity: 50 }}
        >
          <Text color="#4fc4d4" fontSize={14}>
            Shadow + Glow
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={{ x: 0, y: 6, blur: 16, color: 0x4eaed080 }}
          glow={{ radius: 24, color: "#4eaed0", intensity: 40 }}
        >
          <Text color="#4eaed0" fontSize={14}>
            Deep Blue
          </Text>
        </Box>

        <Box
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          shadow={{ x: 0, y: 4, blur: 12, color: 0xa8483e60 }}
          glow={{ radius: 20, color: "#a8483e", intensity: 50 }}
        >
          <Text color="#a8483e" fontSize={14}>
            Warm Drift
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ── App ──

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
      alignX="center"
      alignY="center"
      gap={space[8]}
    >
      <Text color={colors.foreground} fontSize={16}>
        TGE Effects — Shadow and Glow
      </Text>

      <ShadowSection />
      <GlowSection />
      <CombinedSection />
      <InteractiveSection />

      <Box direction="column" gap={space[0.5]} alignX="center">
        <Text color={colors.mutedForeground} fontSize={12}>
          Tab: cycle focus | q: quit
        </Text>
      </Box>
    </Box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term, {
    experimental: {
    },
  })

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
