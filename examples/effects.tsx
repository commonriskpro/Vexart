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
import { mount, useFocus, onInput } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { createTerminal } from "@tge/terminal"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
  alpha,
  shadow,
} from "@tge/tokens"

// ── Shadow showcase ──

function ShadowSection() {
  return (
    <Box direction="column" gap={spacing.lg}>
      <Text color={textTokens.muted} fontSize={12}>
        Drop Shadows
      </Text>
      <Box direction="row" gap={spacing.xxl}>
        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={shadow.subtle}
        >
          <Text color={textTokens.secondary} fontSize={14}>
            Subtle
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={shadow.elevated}
        >
          <Text color={textTokens.secondary} fontSize={14}>
            Elevated
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={shadow.floating}
        >
          <Text color={textTokens.secondary} fontSize={14}>
            Floating
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={{ x: 4, y: 4, blur: 8, color: alpha(accent.drift, 0x60) }}
        >
          <Text color={accent.drift} fontSize={14}>
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
    <Box direction="column" gap={spacing.lg}>
      <Text color={textTokens.muted} fontSize={12}>
        Glow Effects
      </Text>
      <Box direction="row" gap={spacing.xxl}>
        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          glow={{ radius: 20, color: accent.thread, intensity: 60 }}
        >
          <Text color={accent.thread} fontSize={14}>
            Thread
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          glow={{ radius: 20, color: accent.anchor, intensity: 60 }}
        >
          <Text color={accent.anchor} fontSize={14}>
            Anchor
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          glow={{ radius: 20, color: accent.signal, intensity: 60 }}
        >
          <Text color={accent.signal} fontSize={14}>
            Signal
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          glow={{ radius: 20, color: accent.green, intensity: 60 }}
        >
          <Text color={accent.green} fontSize={14}>
            Green
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ── Interactive: focus-driven glow ──

function InteractiveCard(props: { label: string; color: number }) {
  const { focused } = useFocus({
    onKeyDown() {},
  })

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.sm}
      borderColor={focused() ? props.color : border.subtle}
      borderWidth={focused() ? 2 : 1}
      glow={
        focused()
          ? { radius: 24, color: props.color, intensity: 80 }
          : undefined
      }
      shadow={focused() ? shadow.floating : shadow.subtle}
    >
      <Text color={props.color} fontSize={14}>
        {props.label}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
        {focused() ? "Focused — glow on!" : "Tab to focus"}
      </Text>
    </Box>
  )
}

function InteractiveSection() {
  return (
    <Box direction="column" gap={spacing.lg}>
      <Text color={textTokens.muted} fontSize={12}>
        Interactive — Tab to cycle focus (glow follows)
      </Text>
      <Box direction="row" gap={spacing.xxl}>
        <InteractiveCard label="Card A" color={accent.thread} />
        <InteractiveCard label="Card B" color={accent.anchor} />
        <InteractiveCard label="Card C" color={accent.purple} />
        <InteractiveCard label="Card D" color={accent.green} />
      </Box>
    </Box>
  )
}

// ── Combined shadow + glow ──

function CombinedSection() {
  return (
    <Box direction="column" gap={spacing.lg}>
      <Text color={textTokens.muted} fontSize={12}>
        Combined Shadow + Glow
      </Text>
      <Box direction="row" gap={spacing.xxl}>
        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={shadow.elevated}
          glow={{ radius: 16, color: accent.thread, intensity: 50 }}
        >
          <Text color={accent.thread} fontSize={14}>
            Shadow + Glow
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={{ x: 0, y: 6, blur: 16, color: alpha(accent.anchor, 0x80) }}
          glow={{ radius: 24, color: accent.anchor, intensity: 40 }}
        >
          <Text color={accent.anchor} fontSize={14}>
            Deep Blue
          </Text>
        </Box>

        <Box
          backgroundColor={surface.card}
          cornerRadius={radius.xl}
          padding={spacing.xl}
          shadow={{ x: 0, y: 4, blur: 12, color: alpha(accent.drift, 0x60) }}
          glow={{ radius: 20, color: accent.drift, intensity: 50 }}
        >
          <Text color={accent.drift} fontSize={14}>
            Warm Drift
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ── App ──

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={surface.void}
      direction="column"
      alignX="center"
      alignY="center"
      gap={spacing.xxl}
    >
      <Text color={textTokens.primary} fontSize={16}>
        TGE Effects — Shadow and Glow
      </Text>

      <ShadowSection />
      <GlowSection />
      <CombinedSection />
      <InteractiveSection />

      <Box direction="column" gap={spacing.xs} alignX="center">
        <Text color={textTokens.muted} fontSize={12}>
          Tab: cycle focus | q: quit
        </Text>
      </Box>
    </Box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term)

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
