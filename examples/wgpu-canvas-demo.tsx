/**
 * WGPU Canvas Demo — visual validator for the hybrid canvas backend.
 *
 * Run:
 *   bun --conditions=browser run examples/wgpu-canvas-demo.tsx
 *
 * Keys:
 *   g — toggle WGPU backend on/off
 *   q — quit
 */

import { createSignal } from "solid-js"
import { mount, markDirty, probeWgpuCanvasBridge } from "@tge/renderer-solid"
import { setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import type { CanvasContext } from "@tge/renderer-solid"

const probe = probeWgpuCanvasBridge()
const wgpuBackend = probe.available ? tryCreateWgpuCanvasPainterBackend() : null
const [gpuEnabled, setGpuEnabled] = createSignal(Boolean(wgpuBackend))

function applyBackend(enabled: boolean) {
  setCanvasPainterBackend(enabled && wgpuBackend ? wgpuBackend : null)
  setGpuEnabled(enabled && Boolean(wgpuBackend))
  markDirty()
}

const imagePixels = new Uint8Array([
  255, 0, 0, 255,   255, 180, 0, 255,   255, 255, 255, 255,   255, 255, 255, 255,
  255, 0, 0, 255,   255, 180, 0, 255,   255, 255, 255, 255,   255, 255, 255, 255,
  40, 160, 255, 255,  40, 160, 255, 255,  255, 255, 255, 255,  255, 255, 255, 255,
  40, 160, 255, 255,  40, 160, 255, 255,  255, 255, 255, 255,  255, 255, 255, 255,
])

function drawSupportedScene(ctx: CanvasContext) {
  ctx.rect(0, 0, 440, 180, { fill: 0x10151fff })
  ctx.rect(12, 12, 416, 156, { fill: 0x141c2aff })
  ctx.rect(28, 28, 140, 48, { fill: 0xff7a18ff })
  ctx.rect(182, 28, 110, 48, { fill: 0x4fd1c5ff })
  ctx.rect(306, 28, 92, 48, { fill: 0xa78bfaFF })
  ctx.drawImage(34, 92, 128, 64, imagePixels, 4, 4, 1)
  ctx.drawImage(184, 92, 96, 64, imagePixels, 4, 4, 0.9)
  ctx.rect(300, 92, 98, 64, { fill: 0x0f172aff })
  ctx.drawImage(312, 104, 72, 40, imagePixels, 4, 4, 1)
}

function drawUnsupportedScene(ctx: CanvasContext) {
  ctx.rect(0, 0, 440, 180, { fill: 0x0f1117ff, radius: 16 })
  ctx.rect(14, 14, 412, 152, { fill: 0x141824ff, stroke: 0xffffff20, strokeWidth: 1, radius: 16 })
  ctx.linearGradient(28, 28, 160, 80, 0x56d4c8cc, 0xa78bfacc, 0)
  ctx.glow(220, 96, 120, 44, 0xf3bf6b66, 20)
  ctx.rect(170, 72, 100, 52, { fill: 0x1f2937ff, radius: 12, stroke: 0xf3bf6b88, strokeWidth: 1 })
  ctx.text(44, 36, "CPU fallback scene", 0xffffffff)
  ctx.text(44, 58, "rounded rect + gradient + glow + text", 0x94a3b8ff)
}

function App() {
  const backendLabel = () => {
    if (!probe.available) return "CPU only (WGPU bridge unavailable)"
    return gpuEnabled() ? "Hybrid backend ON (GPU for supported canvas commands)" : "CPU only (hybrid backend OFF)"
  }

  return (
    <box width="100%" height="100%" backgroundColor={0x090b10ff} padding={16} gap={12}>
      <box gap={4}>
        <text color={0xf8fafcff} fontSize={18}>WGPU Canvas Demo</text>
        <text color={0x94a3b8ff} fontSize={11}>Press g to toggle the hybrid WGPU backend. Press q to quit.</text>
        <text color={probe.available ? 0x4ade80ff : 0xf87171ff} fontSize={11}>{backendLabel()}</text>
        <text color={0x64748bff} fontSize={10}>{`Bridge: ${probe.reason}${probe.libraryPath ? ` • ${probe.libraryPath}` : ""}`}</text>
      </box>

      <box gap={8}>
        <text color={0xe2e8f0ff} fontSize={12}>Supported scene — rect + image only (eligible for GPU)</text>
        <surface width={440} height={180} onDraw={drawSupportedScene} />
      </box>

      <box gap={8}>
        <text color={0xe2e8f0ff} fontSize={12}>Fallback scene — unsupported commands force CPU path</text>
        <surface width={440} height={180} onDraw={drawUnsupportedScene} />
      </box>
    </box>
  )
}

async function main() {
  const term = await createTerminal()
  applyBackend(Boolean(wgpuBackend))
  const cleanup = mount(() => <App />, term)

  const parser = createParser((event) => {
    if (event.type !== "key") return
    if (event.key === "g") {
      applyBackend(!gpuEnabled())
      return
    }
    if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
      setCanvasPainterBackend(null)
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
