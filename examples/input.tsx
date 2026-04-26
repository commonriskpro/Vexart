/**
 * Vexart Text Input Demo — demo10.
 *
 * Showcases the Input component:
 *   - Basic text input with placeholder
 *   - Multiple inputs with Tab navigation
 *   - Live display of typed values
 *   - Paste support (Ctrl+V / bracketed paste)
 *   - Selection with Shift+arrows, Ctrl+A
 *
 * Run:  bun run demo10 (requires Ghostty WITHOUT tmux)
 * Requires: bun install && cargo build
 */

import { createSignal } from "solid-js"
import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import { Input, Button } from "@vexart/headless"
import { colors, radius, space, shadows } from "@vexart/styled"

function App() {
  const [name, setName] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [message, setMessage] = createSignal("")
  const [submitted, setSubmitted] = createSignal(false)
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  function handleSubmit() {
    if (name() && email()) setSubmitted(true)
  }

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
      <Text color={colors.foreground} fontSize={16}>
        Vexart Text Input Demo
      </Text>

      {/* Form */}
      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.xl}
        padding={space[6]}
        direction="column"
        gap={space[4]}
        shadow={shadows.md}
        width={400}
      >
        <Text color={colors.mutedForeground} fontSize={12}>
          Contact Form
        </Text>

        {/* Name field */}
        <Box direction="column" gap={space[0.5]}>
          <Text color={colors.foreground} fontSize={12}>
            Name
          </Text>
          <Input
            value={name()}
            onChange={setName}
            onSubmit={handleSubmit}
            placeholder="John Doe"
            renderInput={(ctx) => (
              <Box
                width={360}
                height={24}
                backgroundColor={colors.secondary}
                cornerRadius={radius.md}
                borderColor={ctx.focused ? "#4fc4d4" : colors.input}
                borderWidth={1}
                padding={space[1]}
              >
                <Text color={ctx.showPlaceholder ? colors.mutedForeground : colors.foreground} fontSize={14}>
                  {ctx.displayText}
                </Text>
              </Box>
            )}
          />
        </Box>

        {/* Email field */}
        <Box direction="column" gap={space[0.5]}>
          <Text color={colors.foreground} fontSize={12}>
            Email
          </Text>
          <Input
            value={email()}
            onChange={setEmail}
            onSubmit={handleSubmit}
            placeholder="john@example.com"
            renderInput={(ctx) => (
              <Box
                width={360}
                height={24}
                backgroundColor={colors.secondary}
                cornerRadius={radius.md}
                borderColor={ctx.focused ? "#4eaed0" : colors.input}
                borderWidth={1}
                padding={space[1]}
              >
                <Text color={ctx.showPlaceholder ? colors.mutedForeground : colors.foreground} fontSize={14}>
                  {ctx.displayText}
                </Text>
              </Box>
            )}
          />
        </Box>

        {/* Message field */}
        <Box direction="column" gap={space[0.5]}>
          <Text color={colors.foreground} fontSize={12}>
            Message
          </Text>
          <Input
            value={message()}
            onChange={setMessage}
            onSubmit={handleSubmit}
            placeholder="Your message here..."
            renderInput={(ctx) => (
              <Box
                width={360}
                height={24}
                backgroundColor={colors.secondary}
                cornerRadius={radius.md}
                borderColor={ctx.focused ? "#f59e0b" : colors.input}
                borderWidth={1}
                padding={space[1]}
              >
                <Text color={ctx.showPlaceholder ? colors.mutedForeground : colors.foreground} fontSize={14}>
                  {ctx.displayText}
                </Text>
              </Box>
            )}
          />
        </Box>

        {/* Submit button */}
        <Button
          onPress={handleSubmit}
          renderButton={({ focused, pressed }) => (
            <Box
              backgroundColor={pressed ? "#16a34a" : "#22c55e"}
              cornerRadius={radius.md}
              padding={space[2]}
            >
              <Text color={colors.foreground} fontSize={14}>
                Submit
              </Text>
            </Box>
          )}
        />
      </Box>

      {/* Live preview */}
      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.lg}
        padding={space[4]}
        direction="column"
        gap={space[1]}
        width={400}
        borderColor={colors.border}
        borderWidth={1}
      >
        <Text color={colors.mutedForeground} fontSize={12}>
          Live Preview
        </Text>
        <Text color={colors.foreground} fontSize={14}>
          {"Name: " + (name() || "-")}
        </Text>
        <Text color={colors.foreground} fontSize={14}>
          {"Email: " + (email() || "-")}
        </Text>
        <Text color={colors.foreground} fontSize={14}>
          {"Message: " + (message() || "-")}
        </Text>
        {submitted() ? (
          <Text color="#22c55e" fontSize={14}>
            Submitted!
          </Text>
        ) : null}
      </Box>

      <Box direction="column" gap={space[0.5]} alignX="center">
        <Text color={colors.mutedForeground} fontSize={12}>
          Tab: next field | Shift+Arrows: select | Ctrl+A: select all | Enter: submit
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Press q with no input focused, or Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, {
  mount: {
    experimental: {
    },
  },
})
