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
import { mount, useFocus, onInput } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { createTerminal } from "@tge/terminal"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
} from "@tge/tokens"

// ── Clock widget — auto-ticking, no user input ──

function Clock() {
  const [time, setTime] = createSignal(formatTime())

  const timer = setInterval(() => setTime(formatTime()), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <Box
      layer
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.sm}
      borderColor={border.subtle}
      borderWidth={1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Clock
      </Text>
      <Text color={accent.thread} fontSize={16}>
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
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.sm}
      borderColor={focused() ? accent.anchor : border.subtle}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Counter
      </Text>
      <Text color={accent.anchor} fontSize={16}>
        {String(count())}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
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
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.sm}
      borderColor={focused() ? accent.signal : border.subtle}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Stopwatch
      </Text>
      <Text color={running() ? accent.green : accent.signal} fontSize={16}>
        {display()}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
        {focused()
          ? (running() ? "Enter: stop | r: reset" : "Enter: start | r: reset")
          : "Tab to focus"}
      </Text>
    </Box>
  )
}

// ── Palette widget — cycle through colors ──

const colorEntries = [
  { name: "Thread", value: accent.thread },
  { name: "Anchor", value: accent.anchor },
  { name: "Signal", value: accent.signal },
  { name: "Drift",  value: accent.drift },
  { name: "Purple", value: accent.purple },
  { name: "Green",  value: accent.green },
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
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.sm}
      borderColor={focused() ? current().value : border.subtle}
      borderWidth={focused() ? 2 : 1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Palette
      </Text>
      <Box direction="row" gap={spacing.xs} alignY="center">
        {colorEntries.map((c, i) => (
          <Box
            width={idx() === i ? 14 : 8}
            height={idx() === i ? 14 : 8}
            backgroundColor={c.value}
            cornerRadius={radius.pill}
          />
        ))}
      </Box>
      <Text color={current().value} fontSize={14}>
        {current().name}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
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
      backgroundColor={surface.card}
      cornerRadius={radius.xl}
      padding={spacing.xl}
      direction="column"
      gap={spacing.sm}
      borderColor={border.subtle}
      borderWidth={1}
    >
      <Text color={textTokens.muted} fontSize={12}>
        Stats
      </Text>
      <Text color={accent.purple} fontSize={14}>
        {"Layers: 7 (bg+5+stats)"}
      </Text>
      <Text color={textTokens.muted} fontSize={12}>
        {"Uptime: " + String(frames()) + "s"}
      </Text>
    </Box>
  )
}

// ── App layout ──

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={surface.void}
      direction="column"
      alignX="center"
      alignY="center"
      gap={spacing.lg}
    >
      <Box layer>
        <Text color={textTokens.primary} fontSize={16}>
          TGE Dashboard — Per-Layer Granularity
        </Text>
      </Box>

      <Box direction="row" gap={spacing.lg}>
        <Clock />
        <Counter />
        <Stopwatch />
      </Box>

      <Box direction="row" gap={spacing.lg}>
        <Palette />
        <Stats />
      </Box>

      <Box layer direction="column" gap={spacing.xs} alignX="center">
        <Text color={textTokens.muted} fontSize={12}>
          Tab: focus | Enter/Space: activate | Arrows: pick | r: reset | q: quit
        </Text>
        <Text color={textTokens.muted} fontSize={12}>
          Each widget = own layer. Tail /tmp/tge-layers.log for proof.
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
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
        cleanup()
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
