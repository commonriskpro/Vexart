/**
 * Minimal click test — isolate whether onPress/onMouseDown work.
 * Run: bun --conditions=browser run examples/test-click.tsx 2> click.log
 */
import { createSignal } from "solid-js"
import { useFocus } from "@vexart/engine"
import { createApp, Box, Text } from "@vexart/app"
import { colors, radius, space, font } from "@vexart/styled"

const log = (msg: string) => process.stderr.write(`[click-test] ${msg}\n`)

function App() {
  const [count, setCount] = createSignal(0)
  const [val, setVal] = createSignal(50)

  log("App mounted")

  return (
    <Box width="100%" height="100%" backgroundColor="#121212"
      padding={space[6]} gap={space[6]} alignX="center" alignY="center">

      <Text color="#ffffff" fontSize={font.lg}>Click Test (monorepo)</Text>

      {/* Test 1: simple onPress */}
      <Box
        width="80%" height={50} backgroundColor="#333333" cornerRadius={8}
        focusable
        onPress={() => {
          log("onPress fired!")
          setCount(c => c + 1)
        }}
        hoverStyle={{ backgroundColor: "#444444" }}
      >
        <Text color="#ffffff" fontSize={font.sm} padding={space[3]}>
          Click me — count: {String(count())}
        </Text>
      </Box>

      {/* Test 2: onMouseDown with position */}
      <Box
        width="80%" height={40} backgroundColor="#333333" cornerRadius={8}
        onPress={() => {}}
        onMouseDown={(e) => {
          log(`onMouseDown x=${e.nodeX} w=${e.width}`)
          if (e.width > 0) setVal(Math.round(e.nodeX / e.width * 100))
        }}
      >
        <Box width={`${val()}%`} height={40} backgroundColor="#1db954" cornerRadius={8} />
      </Box>
      <Text color="#ffffff" fontSize={font.xs}>Slider val: {String(val())}%</Text>
    </Box>
  )
}

await createApp(() => <App />, { quit: ["q", "ctrl+c"] })
