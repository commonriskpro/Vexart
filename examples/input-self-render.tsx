/**
 * Input Self-Rendering Mode Test
 *
 * Tests the Input component's built-in cursor rendering (theme mode)
 * side by side with the headless renderInput mode.
 *
 * Checks:
 *   1. Self-rendering: cursor visible, blinks, click-to-focus, typing works
 *   2. Headless: pipe cursor for comparison
 *   3. Tab navigation between inputs
 *   4. VoidInput (uses self-rendering internally)
 *
 * Run: bun --conditions=browser run examples/input-self-render.tsx
 */

import { createSignal } from "solid-js"
import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import { Input } from "@vexart/headless"
import { VoidInput, colors, radius, space, shadows } from "@vexart/styled"

function App() {
  const [selfVal, setSelfVal] = createSignal("")
  const [headlessVal, setHeadlessVal] = createSignal("")
  const [voidVal, setVoidVal] = createSignal("")
  const [customVal, setCustomVal] = createSignal("")
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
      gap={space[6]}
    >
      <Text color={colors.foreground} fontSize={18}>
        Input Self-Rendering Test
      </Text>

      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.xl}
        padding={space[6]}
        direction="column"
        gap={space[5]}
        shadow={shadows.md}
        width={500}
      >
        {/* Test 1: Self-rendering mode (default theme) */}
        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground} fontSize={11}>
            1. Self-rendering (default theme) — click + type + cursor blink
          </Text>
          <Input
            value={selfVal()}
            onChange={setSelfVal}
            placeholder="Click me and type..."
          />
          <Text color={colors.mutedForeground} fontSize={10}>
            {"value: " + JSON.stringify(selfVal())}
          </Text>
        </Box>

        {/* Test 2: Self-rendering with custom theme */}
        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground} fontSize={11}>
            2. Self-rendering (custom purple theme)
          </Text>
          <Input
            value={customVal()}
            onChange={setCustomVal}
            placeholder="Purple accent input..."
            theme={{
              accent: 0x8b5cf6ff,
              fg: 0xe8ecffff,
              muted: 0x8b96adff,
              bg: 0x1a1a2eff,
              border: 0xffffff26,
              radius: 10,
              paddingX: 14,
              paddingY: 8,
              fontSize: 14,
            }}
          />
          <Text color={colors.mutedForeground} fontSize={10}>
            {"value: " + JSON.stringify(customVal())}
          </Text>
        </Box>

        {/* Test 3: Headless mode (renderInput with pipe cursor) */}
        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground} fontSize={11}>
            3. Headless (renderInput + pipe cursor)
          </Text>
          <Input
            value={headlessVal()}
            onChange={setHeadlessVal}
            placeholder="Headless with pipe cursor..."
            renderInput={(ctx) => (
              <Box
                {...ctx.inputProps}
                width="grow"
                height={34}
                backgroundColor={0x1e1e2eff}
                cornerRadius={radius.md}
                borderColor={ctx.focused ? 0x56d4c8ff : 0xffffff26}
                borderWidth={1}
                padding={6}
                paddingX={10}
                alignY="center"
              >
                <Text color={ctx.showPlaceholder ? 0x888888ff : 0xe0e0e0ff} fontSize={14}>
                  {ctx.showPlaceholder
                    ? ctx.displayText
                    : ctx.value.slice(0, ctx.cursor) + (ctx.focused ? (ctx.blink ? "│" : " ") : "") + ctx.value.slice(ctx.cursor)}
                </Text>
              </Box>
            )}
          />
          <Text color={colors.mutedForeground} fontSize={10}>
            {"value: " + JSON.stringify(headlessVal())}
          </Text>
        </Box>

        {/* Test 4: VoidInput (styled, uses self-rendering) */}
        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground} fontSize={11}>
            4. VoidInput (styled component)
          </Text>
          <VoidInput
            value={voidVal()}
            onChange={setVoidVal}
            placeholder="VoidInput component..."
          />
          <Text color={colors.mutedForeground} fontSize={10}>
            {"value: " + JSON.stringify(voidVal())}
          </Text>
        </Box>
      </Box>

      <Text color={colors.mutedForeground} fontSize={11}>
        Tab: switch inputs | Click: focus | Type: insert | Ctrl+C: exit
      </Text>
    </Box>
  )
}

await createApp(() => <App />, {
  mount: {
    experimental: {},
  },
})
