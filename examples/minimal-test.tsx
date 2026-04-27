/**
 * Minimal rendering test — just a colored box.
 * If this renders, the dylib works.
 *
 * Run: bun --conditions=browser run examples/minimal-test.tsx
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
        width={300}
        height={120}
        backgroundColor={0xff4444ff}
        cornerRadius={radius.xl}
        alignX="center"
        alignY="center"
        direction="column"
        gap={space[2]}
      >
        <Text color={0xffffffff} fontSize={20}>
          DYLIB WORKS
        </Text>
        <Text color={0xffffffaa} fontSize={12}>
          Press q to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
})
