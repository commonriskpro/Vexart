/**
 * Vexart Hello World — the simplest possible app.
 *
 * Run: bun --conditions=browser run examples/hello-app.tsx
 */
import { createApp, Box, Text } from "@vexart/app"
import { colors, radius, space } from "@vexart/styled"

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      alignX="center"
      alignY="center"
    >
      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.xl}
        padding={space[6]}
        direction="column"
        gap={space[2]}
      >
        <Text color={colors.foreground} fontSize={16}>
          Hello from Vexart
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Press Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />)
