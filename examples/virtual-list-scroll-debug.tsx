import { createSignal, onCleanup } from "solid-js"
import { mount, onInput, onPostScroll, createParser, useTerminalDimensions } from "@vexart/engine"
import { Box, Text } from "@vexart/primitives"
import { ScrollView, VirtualList } from "@vexart/headless"
import { colors, radius, space } from "@vexart/styled"
import { createTerminal } from "@vexart/engine"
import { appendFileSync, writeFileSync } from "node:fs"

const ROW_H = 28
const PANE_H = 420
const PANE_W = 320
const LOG = "/tmp/vexart-virtual-list-scroll-debug.log"

function log(msg: string) {
  appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`)
}

const items = Array.from({ length: 300 }, (_, index) => ({
  id: index,
  label: `Row ${String(index + 1).padStart(3, "0")}`,
  value: index * 7,
}))

const baselineItems = items.slice(0, 80)

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const [selected, setSelected] = createSignal(-1)
  const [wheelCount, setWheelCount] = createSignal(0)
  const [postScrollCount, setPostScrollCount] = createSignal(0)
  const [lastWheel, setLastWheel] = createSignal("none")
  const dims = useTerminalDimensions(props.terminal)

  const unsubInput = onInput((event) => {
    if (event.type !== "mouse") return
    if (event.action !== "scroll") return

    setWheelCount((count) => count + 1)
    setLastWheel(event.button === 64 ? "up" : event.button === 65 ? "down" : `button:${String(event.button)}`)
  })

  const unsubPostScroll = onPostScroll(() => {
    setPostScrollCount((count) => count + 1)
  })

  onCleanup(() => {
    unsubInput()
    unsubPostScroll()
  })

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      padding={space[5]}
      direction="column"
      gap={space[4]}
    >
      <Box direction="column" gap={space[1]}>
        <Text color={colors.foreground} fontSize={16}>VirtualList Scroll Debug Demo</Text>
        <Text color={colors.mutedForeground} fontSize={12}>Move the pointer over a pane and use the mouse wheel. Q / Esc exits.</Text>
      </Box>

      <Box direction="row" gap={space[3]}>
        <InfoCard label="Wheel events seen" value={String(wheelCount())} />
        <InfoCard label="onPostScroll ticks" value={String(postScrollCount())} />
        <InfoCard label="Last wheel direction" value={lastWheel()} />
        <InfoCard label="Selected row" value={selected() >= 0 ? String(selected() + 1) : "none"} />
      </Box>

      <Box direction="row" gap={space[4]} height="grow">
        <Pane title="VirtualList">
          <VirtualList
            items={items}
            itemHeight={ROW_H}
            height={PANE_H}
            width={PANE_W}
            overscan={3}
            selectedIndex={selected()}
            onSelect={setSelected}
            renderItem={(item, index, ctx) => (
              <Row
                index={index}
                label={item.label}
                value={item.value}
                selected={ctx.selected}
                active={ctx.highlighted}
                hovered={ctx.hovered}
              />
            )}
          />
        </Pane>

        <Pane title="ScrollView baseline">
          <ScrollView
            width={PANE_W}
            height={PANE_H}
            scrollY
            scrollSpeed={1}
            backgroundColor={colors.card}
            cornerRadius={radius.lg}
            padding={0}
            gap={0}
          >
            {baselineItems.map((item, index) => (
              <Row
                index={index}
                label={item.label}
                value={item.value}
                selected={selected() === index}
                active={false}
                hovered={false}
              />
            ))}
          </ScrollView>
        </Pane>
      </Box>

      <Box direction="column" gap={space[1]}>
        <Text color={colors.mutedForeground} fontSize={12}>How to read this demo:</Text>
        <Text color={colors.mutedForeground} fontSize={12}>• If wheel count does not move, input is not reaching the app.</Text>
        <Text color={colors.mutedForeground} fontSize={12}>• If wheel count moves but onPostScroll stays flat, runtime scroll dispatch is broken.</Text>
        <Text color={colors.mutedForeground} fontSize={12}>• If ScrollView moves but VirtualList does not, the bug is isolated to VirtualList behavior.</Text>
      </Box>
    </Box>
  )
}

function InfoCard(props: { label: string; value: string }) {
  return (
    <Box
      backgroundColor={colors.card}
      borderColor={colors.border}
      borderWidth={1}
      cornerRadius={radius.lg}
      padding={space[3]}
      direction="column"
      gap={space[1]}
      width={150}
    >
      <Text color={colors.mutedForeground} fontSize={11}>{props.label}</Text>
      <Text color={colors.foreground} fontSize={14}>{props.value}</Text>
    </Box>
  )
}

function Pane(props: { title: string; children: any }) {
  return (
    <Box direction="column" gap={space[2]}>
      <Text color={colors.foreground} fontSize={13}>{props.title}</Text>
      {props.children}
    </Box>
  )
}

function Row(props: {
  index: number
  label: string
  value: number
  selected: boolean
  active: boolean
  hovered: boolean
}) {
  const bg = props.selected
    ? "#183247"
    : props.active
      ? "#20283b"
      : props.hovered
        ? "#1b2230"
        : props.index % 2 === 0
          ? "#11151d"
          : "#0d1117"

  return (
    <Box
      width={PANE_W}
      height={ROW_H}
      backgroundColor={bg}
      direction="row"
      alignY="center"
      paddingX={space[3]}
      gap={space[3]}
    >
      <Box width={56}>
        <Text color={colors.mutedForeground} fontSize={11}>{String(props.index + 1)}</Text>
      </Box>
      <Box width="grow">
        <Text color={colors.foreground} fontSize={12}>{props.label}</Text>
      </Box>
      <Box width={56} alignX="right">
        <Text color="#4fc4d4" fontSize={11}>{String(props.value)}</Text>
      </Box>
    </Box>
  )
}

async function main() {
  writeFileSync(LOG, "")
  log(`start TERM=${process.env.TERM ?? "none"} TMUX=${process.env.TMUX ?? "none"} KITTY_WINDOW_ID=${process.env.KITTY_WINDOW_ID ?? "none"}`)
  log(`demo rows virtual=${String(items.length)} baseline=${String(baselineItems.length)}`)

  const terminal = await createTerminal()
  log(`terminal caps kind=${terminal.caps.kind} kittyGraphics=${String(terminal.caps.kittyGraphics)} kittyPlaceholder=${String(terminal.caps.kittyPlaceholder)} tmux=${String(terminal.caps.tmux)}`)

  const handle = mount(() => <App terminal={terminal} />, terminal, {
    experimental: {
      nativeSceneLayout: false,
      nativeRenderGraph: false,
    },
  })
  log("mount ok")

  const parser = createParser((event) => {
    if (event.type !== "key") return
    if (event.key !== "q" && event.key !== "escape") return
    log(`quit key=${event.key}`)
    parser.destroy()
    handle.destroy()
    terminal.destroy()
    process.exit(0)
  })

  const unsubData = terminal.onData((data) => parser.feed(data))

  process.on("SIGINT", () => {
    log("SIGINT")
    unsubData()
    parser.destroy()
    handle.destroy()
    terminal.destroy()
    process.exit(0)
  })
}

process.on("uncaughtException", (error) => {
  log(`uncaughtException ${(error as Error).stack ?? String(error)}`)
  console.error(error)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason)
  log(`unhandledRejection ${message}`)
  console.error(reason)
  process.exit(1)
})

main().catch((error) => {
  log(`main catch ${(error as Error).stack ?? String(error)}`)
  console.error(error)
  process.exit(1)
})
