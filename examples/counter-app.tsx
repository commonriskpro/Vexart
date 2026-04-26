/**
 * Vexart Counter — interactive app example.
 *
 * Run: bun --conditions=browser run examples/counter-app.tsx
 */
import { createApp, Box, Text } from "@vexart/app"
import { Button } from "@vexart/headless"
import { colors, radius, space } from "@vexart/styled"
import { createSignal } from "solid-js"

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      alignX="center"
      alignY="center"
      direction="column"
      gap={space[4]}
    >
      <Text color={colors.foreground} fontSize={20}>
        Count: {count()}
      </Text>

      <Box direction="row" gap={space[2]}>
        <Button
          onPress={() => setCount((c) => c + 1)}
          renderButton={(ctx) => (
            <Box
              {...ctx.buttonProps}
              backgroundColor={colors.primary}
              cornerRadius={radius.md}
              padding={space[3]}
              paddingX={space[5]}
            >
              <Text color={colors.background} fontSize={14}>+1</Text>
            </Box>
          )}
        />

        <Button
          onPress={() => setCount(0)}
          renderButton={(ctx) => (
            <Box
              {...ctx.buttonProps}
              backgroundColor={colors.secondary}
              cornerRadius={radius.md}
              padding={space[3]}
              paddingX={space[5]}
            >
              <Text color={colors.foreground} fontSize={14}>Reset</Text>
            </Box>
          )}
        />
      </Box>

      <Text color={colors.mutedForeground} fontSize={12}>
        Press q to exit
      </Text>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
})
