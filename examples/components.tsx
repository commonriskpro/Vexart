/**
 * Vexart Component Showcase — demo8.
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
 * Requires: bun install && cargo build
 */

import { createSignal, onCleanup } from "solid-js"
import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import { Button, ProgressBar, Checkbox, Tabs, List } from "@vexart/headless"
import { colors, radius, space } from "@vexart/styled"

// ── Button showcase ──

function ButtonSection() {
  const [clicks, setClicks] = createSignal(0)

  return (
    <Box
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[4]}
      direction="column"
      gap={space[2]}
      borderColor={colors.border}
      borderWidth={1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Buttons
      </Text>
      <Box direction="row" gap={space[2]} alignY="center">
        <Button
          onPress={() => setClicks((c) => c + 1)}
          renderButton={({ focused, pressed }) => (
            <Box
              backgroundColor={pressed ? "#3a8a9a" : "#4fc4d4"}
              cornerRadius={radius.md}
              padding={space[2]}
            >
              <Text color={colors.foreground} fontSize={14}>
                {"Solid (" + String(clicks()) + ")"}
              </Text>
            </Box>
          )}
        />
        <Button
          onPress={() => setClicks((c) => c + 1)}
          renderButton={({ focused, pressed }) => (
            <Box
              backgroundColor={pressed ? "#3a6a8a" : colors.transparent}
              cornerRadius={radius.md}
              padding={space[2]}
              borderColor="#4eaed0"
              borderWidth={1}
            >
              <Text color="#4eaed0" fontSize={14}>
                Outline
              </Text>
            </Box>
          )}
        />
        <Button
          onPress={() => setClicks((c) => c + 1)}
          renderButton={({ focused, pressed }) => (
            <Box
              backgroundColor={pressed ? colors.accent : colors.transparent}
              cornerRadius={radius.md}
              padding={space[2]}
            >
              <Text color="#f59e0b" fontSize={14}>
                Ghost
              </Text>
            </Box>
          )}
        />
        <Button
          disabled
          renderButton={({ disabled }) => (
            <Box
              backgroundColor={colors.muted}
              cornerRadius={radius.md}
              padding={space[2]}
            >
              <Text color={colors.mutedForeground} fontSize={14}>
                Disabled
              </Text>
            </Box>
          )}
        />
      </Box>
      <Text color={colors.mutedForeground} fontSize={12}>
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
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[4]}
      direction="column"
      gap={space[2]}
      borderColor={colors.border}
      borderWidth={1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Progress Bars
      </Text>
      <Box direction="column" gap={space[1]}>
        <Box direction="row" gap={space[2]} alignY="center">
          <Text color={colors.foreground} fontSize={12}>
            Thread
          </Text>
          <ProgressBar
            value={value()}
            width={160}
            renderBar={({ fillWidth, width, height }) => (
              <Box width={width} height={height} backgroundColor={colors.muted} cornerRadius={radius.sm}>
                <Box width={fillWidth} height={height} backgroundColor="#4fc4d4" cornerRadius={radius.sm} />
              </Box>
            )}
          />
          <Text color={colors.mutedForeground} fontSize={12}>
            {String(value()) + "%"}
          </Text>
        </Box>
        <Box direction="row" gap={space[2]} alignY="center">
          <Text color={colors.foreground} fontSize={12}>
            Green
          </Text>
          <ProgressBar
            value={75}
            width={160}
            renderBar={({ fillWidth, width, height }) => (
              <Box width={width} height={height} backgroundColor={colors.muted} cornerRadius={radius.sm}>
                <Box width={fillWidth} height={height} backgroundColor="#22c55e" cornerRadius={radius.sm} />
              </Box>
            )}
          />
          <Text color={colors.mutedForeground} fontSize={12}>
            75%
          </Text>
        </Box>
        <Box direction="row" gap={space[2]} alignY="center">
          <Text color={colors.foreground} fontSize={12}>
            Signal
          </Text>
          <ProgressBar
            value={30}
            max={50}
            width={160}
            height={8}
            renderBar={({ fillWidth, width, height }) => (
              <Box width={width} height={height} backgroundColor={colors.muted} cornerRadius={radius.sm}>
                <Box width={fillWidth} height={height} backgroundColor="#f59e0b" cornerRadius={radius.sm} />
              </Box>
            )}
          />
          <Text color={colors.mutedForeground} fontSize={12}>
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
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[4]}
      direction="column"
      gap={space[2]}
      borderColor={colors.border}
      borderWidth={1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Checkboxes
      </Text>
      <Box direction="column" gap={space[1]}>
        <Checkbox
          checked={dark()}
          onChange={setDark}
          renderCheckbox={({ checked, focused }) => (
            <Box direction="row" gap={space[2]} alignY="center">
              <Box
                width={16}
                height={16}
                backgroundColor={checked ? "#4fc4d4" : colors.muted}
                cornerRadius={radius.sm}
                borderColor={focused ? "#4fc4d4" : colors.border}
                borderWidth={1}
              />
              <Text color={colors.foreground} fontSize={14}>Dark mode</Text>
            </Box>
          )}
        />
        <Checkbox
          checked={sound()}
          onChange={setSound}
          renderCheckbox={({ checked, focused }) => (
            <Box direction="row" gap={space[2]} alignY="center">
              <Box
                width={16}
                height={16}
                backgroundColor={checked ? "#4eaed0" : colors.muted}
                cornerRadius={radius.sm}
                borderColor={focused ? "#4eaed0" : colors.border}
                borderWidth={1}
              />
              <Text color={colors.foreground} fontSize={14}>Sound effects</Text>
            </Box>
          )}
        />
        <Checkbox
          checked={notif()}
          onChange={setNotif}
          renderCheckbox={({ checked, focused }) => (
            <Box direction="row" gap={space[2]} alignY="center">
              <Box
                width={16}
                height={16}
                backgroundColor={checked ? "#22c55e" : colors.muted}
                cornerRadius={radius.sm}
                borderColor={focused ? "#22c55e" : colors.border}
                borderWidth={1}
              />
              <Text color={colors.foreground} fontSize={14}>Notifications</Text>
            </Box>
          )}
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
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[4]}
      direction="column"
      gap={space[2]}
      borderColor={colors.border}
      borderWidth={1}
      width={300}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Tabs
      </Text>
      <Tabs
        activeTab={activeTab()}
        onTabChange={setActiveTab}
        tabs={[
          {
            label: "General",
            content: () => (
              <Box direction="column" gap={space[1]}>
                <Text color={colors.foreground} fontSize={14}>
                  General Settings
                </Text>
                <Text color={colors.mutedForeground} fontSize={12}>
                  Configure basic options here.
                </Text>
              </Box>
            ),
          },
          {
            label: "Display",
            content: () => (
              <Box direction="column" gap={space[1]}>
                <Text color="#4eaed0" fontSize={14}>
                  Display Settings
                </Text>
                <Text color={colors.mutedForeground} fontSize={12}>
                  Colors, fonts, and layout.
                </Text>
              </Box>
            ),
          },
          {
            label: "Keys",
            content: () => (
              <Box direction="column" gap={space[1]}>
                <Text color="#f59e0b" fontSize={14}>
                  Keybindings
                </Text>
                <Text color={colors.mutedForeground} fontSize={12}>
                  Customize keyboard shortcuts.
                </Text>
              </Box>
            ),
          },
        ]}
        renderTab={(tab, ctx) => (
          <Box
            backgroundColor={ctx.active ? colors.accent : colors.transparent}
            cornerRadius={radius.md}
            padding={space[2]}
          >
            <Text color={ctx.active ? colors.foreground : colors.mutedForeground} fontSize={14}>
              {tab.label}
            </Text>
          </Box>
        )}
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
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[4]}
      direction="column"
      gap={space[2]}
      borderColor={colors.border}
      borderWidth={1}
      width={250}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        List
      </Text>
      <List
        items={items}
        selectedIndex={idx()}
        onSelectedChange={setIdx}
        onSelect={(i) => setSelected(items[i])}
        renderItem={(item, ctx) => (
          <Box
            backgroundColor={ctx.selected ? "#a78bfa22" : colors.transparent}
            padding={space[1]}
            cornerRadius={radius.sm}
          >
            <Text color={ctx.selected ? "#a78bfa" : colors.mutedForeground} fontSize={14}>
              {item}
            </Text>
          </Box>
        )}
      />
      <Text color={colors.mutedForeground} fontSize={12}>
        {selected() ? "Selected: " + selected() : "Press Enter to select"}
      </Text>
    </Box>
  )
}

// ── App ──

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
      alignX="center"
      alignY="center"
      gap={space[4]}
    >
      <Text color={colors.foreground} fontSize={16}>
        Vexart Component Showcase
      </Text>

      {/* Row 1: Buttons + Progress */}
      <Box direction="row" gap={space[4]}>
        <ButtonSection />
        <ProgressSection />
      </Box>

      {/* Row 2: Checkboxes + Tabs + List */}
      <Box direction="row" gap={space[4]}>
        <CheckboxSection />
        <TabsSection />
        <ListSection />
      </Box>

      <Box direction="column" gap={space[0.5]} alignX="center">
        <Text color={colors.mutedForeground} fontSize={12}>
          Tab: cycle focus | Enter/Space: activate | Arrows: navigate
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Press q or Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: {
    experimental: {
    },
  },
})
