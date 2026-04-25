import { createParser, createTerminal, mount, useTerminalDimensions } from "@vexart/engine"
import { LightcodeApp } from "./lightcode/lightcode-demo"

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)
  return <LightcodeApp width={dims.width()} height={dims.height()} />
}

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term)
  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
