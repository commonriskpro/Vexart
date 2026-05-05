/**
 * Rapid click test — reproduce the dist segfault in monorepo.
 * Run: bun --conditions=browser run examples/test-click-rapid.tsx 2> rapid.log
 */
import { createSignal } from "solid-js"
import { createApp, Box, Text } from "@vexart/app"
import { space, font } from "@vexart/styled"

const log = (msg: string) => process.stderr.write(`[RAPID] ${msg}\n`)

function App() {
  const [val, setVal] = createSignal(50)
  const [clicks, setClicks] = createSignal(0)

  log("App mounted — click the bar rapidly 10+ times")

  return (
    <Box width="100%" height="100%" backgroundColor="#121212" padding={space[6]} gap={space[6]}
      alignX="center" alignY="center">
      <Text color="#ffffff" fontSize={font.lg}>Rapid Click Test (monorepo)</Text>
      <Box direction="column" gap={space[2]} width="80%">
        <Box
          width="100%" height={40} backgroundColor="#333333" cornerRadius={8}
          onPress={() => {
            const c = clicks() + 1
            log(`CLICK ${c} val=${val()}`)
            setClicks(c)
          }}
          onMouseDown={(e) => {
            if (e.width > 0) {
              const newVal = Math.round(e.nodeX / e.width * 100)
              log(`mouseDown setVal(${newVal})`)
              setVal(newVal)
            }
          }}
        >
          <Box width={`${val()}%`} height={40} backgroundColor="#1db954" cornerRadius={8} />
        </Box>
        <Text color="#ffffff" fontSize={font.sm}>Value: {String(val())}% | Clicks: {String(clicks())}</Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, { quit: ["q", "ctrl+c"] })
