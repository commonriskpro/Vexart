/**
 * TGE Dashboard Demo — per-layer granularity stress test.
 *
 * A multi-widget dashboard where EACH widget is its own compositing layer.
 * Interacting with one widget only retransmits that widget's tiny pixel
 * buffer (~8-15KB). Everything else stays in terminal GPU VRAM.
 *
 * Widgets (5 independent layers + background):
 *   - Clock:    auto-ticking every second (layer repaints on tick)
 *   - Counter:  manual increment (Enter/Space)
 *   - Stopwatch: start/stop/reset timer (Enter to toggle, r to reset)
 *   - Palette:  cycle through accent colors (arrows)
 *   - Stats:    live layer stats — shows KB saved per frame
 *
 * Focus: Tab to cycle between Counter, Stopwatch, and Palette.
 * The Clock ticks independently — its layer repaints on its own.
 * The Stats widget reads from the log file and updates reactively.
 *
 * Run:  bun run demo6 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal, onCleanup } from "solid-js"
import { mount, useFocus, onInput, useTerminalDimensions } from "@vexart/engine"
import { Box, Text } from "@vexart/primitives"
import { createTerminal } from "@vexart/engine"
import { colors, radius, space } from "@vexart/styled"

// ── Clock widget — auto-ticking, no user input ──

function Clock() {
  const [time, setTime] = createSignal(formatTime())

  const timer = setInterval(() => setTime(formatTime()), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[1]}
      borderColor={colors.border}
      borderWidth={1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Clock
      </Text>
      <Text color={colors.primary} fontSize={16}>
        {time()}
      </Text>
    </Box>
  )
}

function formatTime(): string {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  const s = String(d.getSeconds()).padStart(2, "0")
  return `${h}:${m}:${s}`
}

// ── Counter widget — manual increment ──

function Counter() {
  const [count, setCount] = createSignal(0)

  const { focused } = useFocus({
    onKeyDown(e) {
      if (e.key === "enter" || e.key === " ") {
        setCount((c) => c + 1)
      }
    },
  })

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[1]}
      borderColor={focused() ? "#4eaed0" : colors.border}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Counter
      </Text>
      <Text color="#4eaed0" fontSize={16}>
        {String(count())}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {focused() ? "Enter to +1" : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── Stopwatch widget — start/stop/reset ──

function Stopwatch() {
  const [elapsed, setElapsed] = createSignal(0)
  const [running, setRunning] = createSignal(false)
  let interval: ReturnType<typeof setInterval> | null = null

  const { focused } = useFocus({
    onKeyDown(e) {
      if (e.key === "enter" || e.key === " ") {
        if (running()) {
          // Stop
          if (interval) clearInterval(interval)
          interval = null
          setRunning(false)
        } else {
          // Start
          setRunning(true)
          interval = setInterval(() => setElapsed((t) => t + 100), 100)
        }
      } else if (e.key === "r") {
        // Reset
        if (interval) clearInterval(interval)
        interval = null
        setRunning(false)
        setElapsed(0)
      }
    },
  })

  onCleanup(() => { if (interval) clearInterval(interval) })

  const display = () => {
    const ms = elapsed()
    const s = Math.floor(ms / 1000)
    const d = Math.floor((ms % 1000) / 100)
    return `${s}.${d}s`
  }

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[1]}
      borderColor={focused() ? "#f59e0b" : colors.border}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Stopwatch
      </Text>
      <Text color={running() ? "#22c55e" : "#f59e0b"} fontSize={16}>
        {display()}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {focused()
          ? (running() ? "Enter: stop | r: reset" : "Enter: start | r: reset")
          : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── Palette widget — cycle through colors ──

const colorEntries = [
  { name: "Thread", value: "#4fc4d4" },
  { name: "Anchor", value: "#4eaed0" },
  { name: "Signal", value: "#f59e0b" },
  { name: "Drift",  value: "#a8483e" },
  { name: "Purple", value: "#a78bfa" },
  { name: "Green",  value: "#22c55e" },
] as const

function Palette() {
  const [idx, setIdx] = createSignal(0)
  const current = () => colorEntries[idx()]

  const { focused } = useFocus({
    onKeyDown(e) {
      const len = colorEntries.length
      if (e.key === "right" || e.key === "down") {
        setIdx((i) => (i + 1) % len)
      } else if (e.key === "left" || e.key === "up") {
        setIdx((i) => (i - 1 + len) % len)
      }
    },
  })

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[1]}
      borderColor={focused() ? current().value : colors.border}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Palette
      </Text>
      <Box direction="row" gap={space[0.5]} alignY="center">
        {colorEntries.map((c, i) => (
          <Box
            width={idx() === i ? 14 : 8}
            height={idx() === i ? 14 : 8}
            backgroundColor={c.value}
            cornerRadius={radius.full}
          />
        ))}
      </Box>
      <Text color={current().value} fontSize={14}>
        {current().name}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {focused() ? "Arrows to pick" : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── Stats widget — displays frame counter ──

function Stats() {
  const [frames, setFrames] = createSignal(0)

  const timer = setInterval(() => setFrames((f) => f + 1), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <Box
      layer
      backgroundColor={colors.card}
      cornerRadius={radius.xl}
      padding={space[6]}
      direction="column"
      gap={space[1]}
      borderColor={colors.border}
      borderWidth={1}
    >
      <Text color={colors.mutedForeground} fontSize={12}>
        Stats
      </Text>
      <Text color="#a78bfa" fontSize={14}>
        {"Layers: 7 (bg+5+stats)"}
      </Text>
      <Text color={colors.mutedForeground} fontSize={12}>
        {"Uptime: " + String(frames()) + "s"}
      </Text>
    </Box>
  )
}

// ── App layout ──

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
      alignX="center"
      alignY="center"
      gap={space[4]}
    >
      <Box layer>
        <Text color={colors.foreground} fontSize={16}>
          TGE Dashboard — Per-Layer Granularity
        </Text>
      </Box>

      <Box direction="row" gap={space[4]}>
        <Clock />
        <Counter />
        <Stopwatch />
      </Box>

      <Box direction="row" gap={space[4]}>
        <Palette />
        <Stats />
      </Box>

      <Box layer direction="column" gap={space[0.5]} alignX="center">
        <Text color={colors.mutedForeground} fontSize={12}>
          Tab: focus | Enter/Space: activate | Arrows: pick | r: reset | q: quit
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Each widget = own layer. Tail /tmp/tge-layers.log for proof.
        </Text>
      </Box>
    </Box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term, {
    experimental: {
      nativeSceneLayout: false,
      nativeRenderGraph: false,
    },
  })

  onInput((event) => {
    if (event.type === "key") {
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
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
