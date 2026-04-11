/**
 * TGE Text Input Demo — demo10.
 *
 * Showcases the Input component:
 *   - Basic text input with placeholder
 *   - Multiple inputs with Tab navigation
 *   - Live display of typed values
 *   - Paste support (Ctrl+V / bracketed paste)
 *   - Selection with Shift+arrows, Ctrl+A
 *
 * Run:  bun run demo10 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal } from "solid-js"
import { mount, onInput } from "@tge/renderer"
import {
  Box,
  Text,
  Input,
  Button,
} from "@tge/components"
import { createTerminal } from "@tge/terminal"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
  shadow,
} from "@tge/tokens"

function App() {
  const [name, setName] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [message, setMessage] = createSignal("")
  const [submitted, setSubmitted] = createSignal(false)

  function handleSubmit() {
    if (name() && email()) setSubmitted(true)
  }

  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={surface.void}
      direction="column"
      alignX="center"
      alignY="center"
      gap={spacing.xl}
    >
      <Text color={textTokens.primary} fontSize={16}>
        TGE Text Input Demo
      </Text>

      {/* Form */}
      <Box
        backgroundColor={surface.card}
        cornerRadius={radius.xl}
        padding={spacing.xl}
        direction="column"
        gap={spacing.lg}
        shadow={shadow.elevated}
        width={400}
      >
        <Text color={textTokens.muted} fontSize={12}>
          Contact Form
        </Text>

        {/* Name field */}
        <Box direction="column" gap={spacing.xs}>
          <Text color={textTokens.secondary} fontSize={12}>
            Name
          </Text>
          <Input
            value={name()}
            onChange={setName}
            onSubmit={handleSubmit}
            placeholder="John Doe"
            color={accent.thread}
            width={360}
          />
        </Box>

        {/* Email field */}
        <Box direction="column" gap={spacing.xs}>
          <Text color={textTokens.secondary} fontSize={12}>
            Email
          </Text>
          <Input
            value={email()}
            onChange={setEmail}
            onSubmit={handleSubmit}
            placeholder="john@example.com"
            color={accent.anchor}
            width={360}
          />
        </Box>

        {/* Message field */}
        <Box direction="column" gap={spacing.xs}>
          <Text color={textTokens.secondary} fontSize={12}>
            Message
          </Text>
          <Input
            value={message()}
            onChange={setMessage}
            onSubmit={handleSubmit}
            placeholder="Your message here..."
            color={accent.signal}
            width={360}
          />
        </Box>

        {/* Submit button */}
        <Button
          onPress={handleSubmit}
          color={accent.green}
        >
          Submit
        </Button>
      </Box>

      {/* Live preview */}
      <Box
        backgroundColor={surface.card}
        cornerRadius={radius.lg}
        padding={spacing.lg}
        direction="column"
        gap={spacing.sm}
        width={400}
        borderColor={border.subtle}
        borderWidth={1}
      >
        <Text color={textTokens.muted} fontSize={12}>
          Live Preview
        </Text>
        <Text color={textTokens.secondary} fontSize={14}>
          {"Name: " + (name() || "-")}
        </Text>
        <Text color={textTokens.secondary} fontSize={14}>
          {"Email: " + (email() || "-")}
        </Text>
        <Text color={textTokens.secondary} fontSize={14}>
          {"Message: " + (message() || "-")}
        </Text>
        {submitted() ? (
          <Text color={accent.green} fontSize={14}>
            Submitted!
          </Text>
        ) : null}
      </Box>

      <Box direction="column" gap={spacing.xs} alignX="center">
        <Text color={textTokens.muted} fontSize={12}>
          Tab: next field | Shift+Arrows: select | Ctrl+A: select all | Enter: submit
        </Text>
        <Text color={textTokens.muted} fontSize={12}>
          Press q with no input focused, or Ctrl+C to exit
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
      if ((event.key === "c" && event.mods.ctrl)) {
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
