/**
 * TGE Scroll Programmatic Demo — ScrollHandle API.
 *
 * Demonstrates programmatic scroll control:
 *   - scrollTo(0) — scroll to top
 *   - scrollBy(-50) — scroll up by 50px
 *   - scrollBy(50) — scroll down by 50px
 *   - Read scrollY, viewportHeight, contentHeight in real-time
 *
 * Controls:
 *   - Mouse wheel: scroll normally
 *   - T: scroll to top
 *   - B: scroll to bottom
 *   - Up/Down arrows: scroll by 50px
 *   - Q/Esc: quit
 *
 * Run:  bun run demo13 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal } from "solid-js"
import { mount, onInput, type ScrollHandle } from "@tge/renderer"
import { Box, Text, ScrollView } from "@tge/components"
import { createTerminal } from "@tge/terminal"

// ── Generate sample items ──

const items = Array.from({ length: 50 }, (_, i) => ({
  label: `Item ${i + 1} — This is a scrollable item`,
  hue: Math.floor((i / 50) * 360),
}))

function hslToHex(h: number): number {
  const s = 0.6, l = 0.5
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return ((f(0) << 24) | (f(8) << 16) | (f(4) << 8) | 0xff) >>> 0
}

// ── App ──

function App() {
  let scrollRef: ScrollHandle | undefined
  const [info, setInfo] = createSignal("Scroll with mouse wheel, T=top, B=bottom, Up/Down=50px")

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "q" || event.key === "escape") process.exit(0)

    if (!scrollRef) return

    if (event.key === "t") {
      scrollRef.scrollTo(0)
      setInfo(`Scrolled to top | Y=${scrollRef.scrollY.toFixed(0)}`)
    } else if (event.key === "b") {
      const bottom = -(scrollRef.contentHeight - scrollRef.viewportHeight)
      scrollRef.scrollTo(bottom)
      setInfo(`Scrolled to bottom | Y=${scrollRef.scrollY.toFixed(0)}`)
    } else if (event.key === "up") {
      scrollRef.scrollBy(50) // positive = scroll up (Clay uses negative Y)
      setInfo(`Scrolled up | Y=${scrollRef.scrollY.toFixed(0)}`)
    } else if (event.key === "down") {
      scrollRef.scrollBy(-50) // negative = scroll down
      setInfo(`Scrolled down | Y=${scrollRef.scrollY.toFixed(0)}`)
    }
  })

  return (
    <box direction="column" width="100%" height="100%" backgroundColor="#0a0a14" padding={20} gap={12}>
      {/* Header */}
      <box direction="column" gap={4}>
        <text color="#e0e0e0" fontSize={14}>Scroll Programmatic Demo (demo13)</text>
        <text color="#888888" fontSize={14}>{info()}</text>
      </box>

      {/* Scroll container */}
      <ScrollView
        ref={(h: ScrollHandle) => { scrollRef = h }}
        width="100%"
        height={400}
        scrollY
        scrollSpeed={1}
        backgroundColor="#12121a"
        cornerRadius={8}
        padding={8}
        gap={6}
      >
        {items.map((item) => (
          <box
            backgroundColor={hslToHex(item.hue)}
            cornerRadius={6}
            padding={10}
            width="100%"
            height={36}
          >
            <text color="#ffffff" fontSize={14}>{item.label}</text>
          </box>
        ))}
      </ScrollView>

      {/* Footer with scroll info */}
      <box direction="row" gap={20}>
        <text color="#666666" fontSize={14}>T=top  B=bottom  ↑↓=50px  Q=quit</text>
      </box>
    </box>
  )
}

// ── Main ──

const terminal = await createTerminal()
const handle = mount(() => <App />, terminal)

process.on("SIGINT", () => {
  handle.destroy()
  process.exit(0)
})
