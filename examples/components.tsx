/**
 * TGE Component Showcase — demo8.
 *
 * Shows all new interactive components in action:
 *   - Button (solid, outline, ghost variants)
 *   - ProgressBar (animated fill)
 *   - Checkbox (toggle on/off)
 *   - Tabs (left/right switch)
 *   - List (up/down selection)
 *
 * Tab cycles through all focusable components.
 * Each component demonstrates its keyboard interaction.
 *
 * Run:  bun run demo8 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal, onCleanup } from "solid-js"
import { mount, onInput } from "@tge/renderer"
import {
  Box,
  Text,
  Button,
  ProgressBar,
  Checkbox,
  Tabs,
  List,
} from "@tge/components"
import { createTerminal } from "@tge/terminal"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
} from "@tge/tokens"

// ── Button showcase ──

function ButtonSection() {
  const [clicks, setClicks] = createSignal(0)

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.lg}
      direction="column"
      gap={spacing.md}
      borderColor={border.subtle}
      borderWidth={1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Buttons
      </Text>
      <Box direction="row" gap={spacing.md} alignY="center">
        <Button
          onPress={() => setClicks((c) => c + 1)}
          color={accent.thread}
        >
          {"Solid (" + String(clicks()) + ")"}
        </Button>
        <Button
          variant="outline"
          onPress={() => setClicks((c) => c + 1)}
          color={accent.anchor}
        >
          Outline
        </Button>
        <Button
          variant="ghost"
          onPress={() => setClicks((c) => c + 1)}
          color={accent.signal}
        >
          Ghost
        </Button>
        <Button disabled>
          Disabled
        </Button>
      </Box>
      <Text color={textTokens.muted} fontSize={12}>
        {"Total clicks: " + String(clicks())}
      </Text>
    </Box>
  )
}

// ── ProgressBar showcase ──

function ProgressSection() {
  const [value, setValue] = createSignal(0)

  const timer = setInterval(() => {
    setValue((v) => (v >= 100 ? 0 : v + 2))
  }, 100)
  onCleanup(() => clearInterval(timer))

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.lg}
      direction="column"
      gap={spacing.md}
      borderColor={border.subtle}
      borderWidth={1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Progress Bars
      </Text>
      <Box direction="column" gap={spacing.sm}>
        <Box direction="row" gap={spacing.md} alignY="center">
          <Text color={textTokens.secondary} fontSize={12}>
            Thread
          </Text>
          <ProgressBar value={value()} color={accent.thread} width={160} />
          <Text color={textTokens.muted} fontSize={12}>
            {String(value()) + "%"}
          </Text>
        </Box>
        <Box direction="row" gap={spacing.md} alignY="center">
          <Text color={textTokens.secondary} fontSize={12}>
            Green
          </Text>
          <ProgressBar value={75} color={accent.green} width={160} />
          <Text color={textTokens.muted} fontSize={12}>
            75%
          </Text>
        </Box>
        <Box direction="row" gap={spacing.md} alignY="center">
          <Text color={textTokens.secondary} fontSize={12}>
            Signal
          </Text>
          <ProgressBar value={30} max={50} color={accent.signal} width={160} height={8} />
          <Text color={textTokens.muted} fontSize={12}>
            30/50
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ── Checkbox showcase ──

function CheckboxSection() {
  const [dark, setDark] = createSignal(true)
  const [sound, setSound] = createSignal(false)
  const [notif, setNotif] = createSignal(true)

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.lg}
      direction="column"
      gap={spacing.md}
      borderColor={border.subtle}
      borderWidth={1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Checkboxes
      </Text>
      <Box direction="column" gap={spacing.sm}>
        <Checkbox
          checked={dark()}
          onChange={setDark}
          label="Dark mode"
          color={accent.thread}
        />
        <Checkbox
          checked={sound()}
          onChange={setSound}
          label="Sound effects"
          color={accent.anchor}
        />
        <Checkbox
          checked={notif()}
          onChange={setNotif}
          label="Notifications"
          color={accent.green}
        />
      </Box>
    </Box>
  )
}

// ── Tabs showcase ──

function TabsSection() {
  const [activeTab, setActiveTab] = createSignal(0)

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.lg}
      direction="column"
      gap={spacing.md}
      borderColor={border.subtle}
      borderWidth={1}
      width={300}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Tabs
      </Text>
      <Tabs
        activeTab={activeTab()}
        onTabChange={setActiveTab}
        color={accent.thread}
        tabs={[
          {
            label: "General",
            content: () => (
              <Box direction="column" gap={spacing.sm}>
                <Text color={textTokens.primary} fontSize={14}>
                  General Settings
                </Text>
                <Text color={textTokens.muted} fontSize={12}>
                  Configure basic options here.
                </Text>
              </Box>
            ),
          },
          {
            label: "Display",
            content: () => (
              <Box direction="column" gap={spacing.sm}>
                <Text color={accent.anchor} fontSize={14}>
                  Display Settings
                </Text>
                <Text color={textTokens.muted} fontSize={12}>
                  Colors, fonts, and layout.
                </Text>
              </Box>
            ),
          },
          {
            label: "Keys",
            content: () => (
              <Box direction="column" gap={spacing.sm}>
                <Text color={accent.signal} fontSize={14}>
                  Keybindings
                </Text>
                <Text color={textTokens.muted} fontSize={12}>
                  Customize keyboard shortcuts.
                </Text>
              </Box>
            ),
          },
        ]}
      />
    </Box>
  )
}

// ── List showcase ──

function ListSection() {
  const [idx, setIdx] = createSignal(0)
  const [selected, setSelected] = createSignal("")
  const items = [
    "Neovim",
    "Zellij",
    "Ghostty",
    "Fish Shell",
    "Starship",
    "Lazygit",
  ]

  return (
    <Box
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.lg}
      direction="column"
      gap={spacing.md}
      borderColor={border.subtle}
      borderWidth={1}
      width={250}
    >
      <Text color={textTokens.muted} fontSize={12}>
        List
      </Text>
      <List
        items={items}
        selectedIndex={idx()}
        onSelectedChange={setIdx}
        onSelect={(i) => setSelected(items[i])}
        color={accent.purple}
      />
      <Text color={textTokens.muted} fontSize={12}>
        {selected() ? "Selected: " + selected() : "Press Enter to select"}
      </Text>
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
      gap={spacing.lg}
    >
      <Text color={textTokens.primary} fontSize={16}>
        TGE Component Showcase
      </Text>

      {/* Row 1: Buttons + Progress */}
      <Box direction="row" gap={spacing.lg}>
        <ButtonSection />
        <ProgressSection />
      </Box>

      {/* Row 2: Checkboxes + Tabs + List */}
      <Box direction="row" gap={spacing.lg}>
        <CheckboxSection />
        <TabsSection />
        <ListSection />
      </Box>

      <Box direction="column" gap={spacing.xs} alignX="center">
        <Text color={textTokens.muted} fontSize={12}>
          Tab: cycle focus | Enter/Space: activate | Arrows: navigate
        </Text>
        <Text color={textTokens.muted} fontSize={12}>
          Press q or Ctrl+C to exit
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
