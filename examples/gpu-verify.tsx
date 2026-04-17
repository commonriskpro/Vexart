/**
 * GPU contract verification demo.
 *
 * Tests the new GPU-native path (kitty-payload, atlas expandido)
 * con efectos reales: gradients, glow, shadows, cornerRadius, text
 * con caracteres unicode (·, ·, ⚡, ◆, —).
 *
 * Si esto arranca y renderiza sin errores, el contrato GPU es correcto.
 *
 * Run:
 *   bun --conditions=browser run examples/gpu-verify.tsx
 *
 * Perf log:
 *   VEXART_LOG_PERF=1 bun --conditions=browser run examples/gpu-verify.tsx
 *   tail -f /tmp/gpu-verify-perf.log
 */

import { createSignal, onCleanup, For } from "solid-js"
import { appendFileSync } from "node:fs"
import { mount, debugState, setDebug, markDirty } from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { resetKittyTransportStats, getKittyTransportStats } from "@tge/output-kitty"
import { setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"
import { probeWgpuCanvasBridge } from "@tge/renderer-solid"

// ── Config ──────────────────────────────────────────────────────────────────

const LOG_PERF      = process.env.VEXART_LOG_PERF === "1"
const PERF_LOG      = "/tmp/gpu-verify-perf.log"
const EXIT_AFTER_MS = Number(process.env.VEXART_EXIT_AFTER_MS ?? 0)

// ── Palette ──────────────────────────────────────────────────────────────────

const BG      = 0x08090cff
const SURFACE = 0x111318f0
const BORDER  = 0xffffff14
const WARM    = 0xf3bf6bff
const WARM2   = 0xd4916aff
const BLUE    = 0x7ab4e8ff
const GREEN   = 0x6ec99aff
const PURPLE  = 0xa78bfaff
const TEXT    = 0xe8e4dbff
const MUTED   = 0x6b6760ff

// ── Live perf signal ─────────────────────────────────────────────────────────

function useLiveStats() {
  const [fps, setFps]           = createSignal(0)
  const [ms, setMs]             = createSignal("0.0")
  const [strategy, setStrategy] = createSignal("—")
  const [layers, setLayers]     = createSignal(0)
  const [txKb, setTxKb]         = createSignal("0.0")

  const timer = setInterval(() => {
    const s = getKittyTransportStats()
    setFps(debugState.fps ?? 0)
    setMs((debugState.frameTimeMs ?? 0).toFixed(1))
    setStrategy(debugState.rendererStrategy ?? "—")
    setLayers(debugState.layerCount ?? 0)
    setTxKb((s.payloadBytes / 1024).toFixed(1))

    if (LOG_PERF) {
      appendFileSync(PERF_LOG,
        `fps=${debugState.fps} ms=${debugState.frameTimeMs} ` +
        `strategy=${debugState.rendererStrategy ?? "none"} ` +
        `output=${debugState.rendererOutput ?? "none"} ` +
        `layers=${debugState.layerCount} repainted=${debugState.repaintedCount} ` +
        `tx=${s.payloadBytes}B\n`
      )
    }
  }, 250)

  onCleanup(() => clearInterval(timer))
  return { fps, ms, strategy, layers, txKb }
}

// ── Components ────────────────────────────────────────────────────────────────

/** Card con gradient + border + shadow — verifica el path de effectsQueue */
function GradientCard(props: { title: string; value: string; color: number; accent: number }) {
  return (
    <box
      direction="column"
      gap={6}
      padding={16}
      width="grow"
      cornerRadius={12}
      gradient={{ type: "linear", from: 0x111318ff, to: 0x1a1d24ff, angle: 135 }}
      borderColor={props.accent}
      borderWidth={1}
      shadow={{ x: 0, y: 8, blur: 20, color: 0x00000040 }}
    >
      <text color={props.color} fontSize={10}>{props.title}</text>
      <text color={TEXT} fontSize={16}>{props.value}</text>
    </box>
  )
}

/** Pill con glow — verifica glow effect */
function GlowPill(props: { label: string; color: number }) {
  return (
    <box
      direction="row"
      gap={6}
      paddingX={12}
      paddingY={6}
      cornerRadius={99}
      backgroundColor={0x00000000}
      borderColor={props.color}
      borderWidth={1}
      glow={{ radius: 12, color: props.color, intensity: 50 }}
    >
      <text color={props.color} fontSize={10}>{props.label}</text>
    </box>
  )
}

/** Badge de status */
function StatusBadge(props: { label: string; ok: boolean }) {
  const color = props.ok ? GREEN : 0xe06c75ff
  return (
    <box direction="row" gap={6} paddingX={10} paddingY={4} cornerRadius={6}
      backgroundColor={props.ok ? 0x1a3a2030 : 0x3a1a1a30}
      borderColor={color} borderWidth={1}>
      <box width={6} height={6} cornerRadius={99} backgroundColor={color}
        glow={{ radius: 6, color, intensity: 60 }} />
      <text color={color} fontSize={10}>{props.label}</text>
    </box>
  )
}

/** Sección de métricas con live data */
function StatsRow() {
  const { fps, ms, strategy, layers, txKb } = useLiveStats()

  return (
    <box direction="row" gap={8} width="grow">
      <GradientCard title="FPS" value={String(fps())} color={WARM} accent={0xf3bf6b40} />
      <GradientCard title="Frame ms" value={ms()} color={BLUE} accent={0x7ab4e840} />
      <GradientCard title="Layers" value={String(layers())} color={PURPLE} accent={0xa78bfa40} />
      <GradientCard title="TX KB/f" value={txKb()} color={GREEN} accent={0x6ec99a40} />
    </box>
  )
}

/** Panel con backdrop blur — verifica glassmorphism */
function GlassPanel(props: { title: string; children: any }) {
  return (
    <box
      direction="column"
      gap={10}
      padding={16}
      width="grow"
      cornerRadius={10}
      backgroundColor={0x0f1016c0}
      backdropBlur={8}
      borderColor={BORDER}
      borderWidth={1}
    >
      <box direction="row" gap={8} alignY="center">
        <box width={3} height={16} cornerRadius={2} backgroundColor={WARM}
          glow={{ radius: 8, color: WARM, intensity: 40 }} />
        <text color={TEXT} fontSize={12}>{props.title}</text>
      </box>
      {props.children}
    </box>
  )
}

/** Test de caracteres unicode del atlas expandido */
function UnicodeTest() {
  const chars = [
    { glyph: "·",  label: "U+00B7 middle dot",         cp: 0x00B7 },
    { glyph: "—",  label: "U+2014 em dash",             cp: 0x2014 },
    { glyph: "→",  label: "U+2192 arrow",               cp: 0x2192 },
    { glyph: "⌃",  label: "U+2303 ctrl",                cp: 0x2303 },
    { glyph: "◆",  label: "U+25C6 black diamond",       cp: 0x25C6 },
    { glyph: "●",  label: "U+25CF black circle",        cp: 0x25CF },
    { glyph: "☰",  label: "U+2630 trigram",             cp: 0x2630 },
    { glyph: "✓",  label: "U+2713 check mark",          cp: 0x2713 },
    { glyph: "✕",  label: "U+2715 cross mark",          cp: 0x2715 },
  ]

  return (
    <box direction="column" gap={6} width="grow">
      <For each={chars}>{(c) => (
        <box direction="row" gap={12} alignY="center">
          <box width={24} alignX="center">
            <text color={WARM} fontSize={14}>{c.glyph}</text>
          </box>
          <text color={MUTED} fontSize={9}>{c.label}</text>
          <box width="grow" />
          <text color={GREEN} fontSize={9}>U+{c.cp.toString(16).toUpperCase().padStart(4, "0")}</text>
        </box>
      )}</For>
    </box>
  )
}

/** Row de pills de estado del sistema */
function SystemStatus(props: { strategy: () => string }) {
  return (
    <box direction="row" gap={8} alignY="center" width="grow">
      <StatusBadge label="GPU native" ok={true} />
      <StatusBadge label="kitty-payload" ok={true} />
      <StatusBadge label="glyph atlas expanded" ok={true} />
      <StatusBadge label={`strategy: ${props.strategy()}`} ok={props.strategy() !== "—"} />
      <box width="grow" />
      <GlowPill label="SHM transport" color={GREEN} />
    </box>
  )
}

/** Per-corner radius test */
function CornerTest() {
  return (
    <box direction="column" gap={10} width="grow">
      <box direction="row" gap={12} alignY="center" width="grow">
        <box width={48} height={48} backgroundColor={0x1e2230ff}
          cornerRadii={{ tl: 20, tr: 4, br: 20, bl: 4 }}
          borderColor={BLUE} borderWidth={1} />
        <box width={48} height={48} backgroundColor={0x1e2230ff}
          cornerRadii={{ tl: 4, tr: 20, br: 4, bl: 20 }}
          borderColor={PURPLE} borderWidth={1} />
        <box width={48} height={48} backgroundColor={0x1e2230ff}
          cornerRadii={{ tl: 24, tr: 24, br: 0, bl: 0 }}
          borderColor={WARM} borderWidth={1} />
        <box width={48} height={48} backgroundColor={0x1e2230ff}
          cornerRadii={{ tl: 0, tr: 0, br: 24, bl: 24 }}
          borderColor={GREEN} borderWidth={1} />
      </box>
      <text color={MUTED} fontSize={9}>tl/br asymmetric · tr/bl asymmetric · top cap · bottom cap</text>
    </box>
  )
}

/** Multi-shadow test */
function ShadowTest() {
  return (
    <box direction="column" gap={10} width="grow">
      <box direction="row" gap={12} width="grow">
        <box width="grow" height={44} cornerRadius={8}
          backgroundColor={0x1a1d24ff}
          shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}
          alignX="center" alignY="center">
          <text color={TEXT} fontSize={9}>single shadow</text>
        </box>
        <box width="grow" height={44} cornerRadius={8}
          backgroundColor={0x1a1d24ff}
          shadow={[
            { x: -4, y: -4, blur: 8, color: 0x7ab4e830 },
            { x:  4, y:  4, blur: 8, color: 0x00000050 },
          ]}
          alignX="center" alignY="center">
          <text color={TEXT} fontSize={9}>multi shadow</text>
        </box>
        <box width="grow" height={44} cornerRadius={8}
          backgroundColor={0x0f1016c0}
          backdropBlur={6}
          borderColor={0xffffff20} borderWidth={1}
          alignX="center" alignY="center">
          <text color={TEXT} fontSize={9}>backdrop blur</text>
        </box>
      </box>
    </box>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────

function App() {
  const { strategy } = useLiveStats()

  return (
    <box width="100%" height="100%" backgroundColor={BG}
      direction="column" gap={12} padding={20}>

      {/* Header */}
      <box direction="row" gap={10} alignY="center">
        <box width={8} height={8} cornerRadius={99} backgroundColor={WARM}
          glow={{ radius: 10, color: WARM, intensity: 70 }} />
        <text color={TEXT} fontSize={14}>TGE · GPU verify</text>
        <box width={1} height={14} backgroundColor={BORDER} />
        <text color={MUTED} fontSize={10}>kitty-payload · wgpu · atlas ~890 glyphs</text>
        <box width="grow" />
        <text color={MUTED} fontSize={9}>q to exit</text>
      </box>

      {/* Live stats */}
      <StatsRow />

      {/* System status */}
      <SystemStatus strategy={strategy} />

      {/* Main panels row */}
      <box direction="row" gap={16} width="grow">
        <GlassPanel title="Unicode atlas coverage">
          <UnicodeTest />
        </GlassPanel>

        <box direction="column" gap={16} width="grow">
          <GlassPanel title="Per-corner radius">
            <CornerTest />
          </GlassPanel>
          <GlassPanel title="Shadows + backdrop">
            <ShadowTest />
          </GlassPanel>
        </box>
      </box>

      {/* Footer */}
      <box direction="row" gap={8} alignY="center">
        <text color={MUTED} fontSize={9}>renderer-backend.ts · output: kitty-payload · no ctx.buffer · no raw-layer</text>
      </box>
    </box>
  )
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main() {
  resetKittyTransportStats()

  const term  = await createTerminal()
  const bridge = probeWgpuCanvasBridge()
  setCanvasPainterBackend(bridge.available ? tryCreateWgpuCanvasPainterBackend() : null)
  setDebug(true)

  if (LOG_PERF) {
    try { appendFileSync(PERF_LOG, `\n--- gpu-verify [${new Date().toISOString()}] ---\n`) } catch {}
  }

  const cleanup = mount(() => <App />, term, { maxFps: 60 })

  let exitTimer: ReturnType<typeof setTimeout> | null = null
  if (EXIT_AFTER_MS > 0) {
    exitTimer = setTimeout(() => { shutdown(); process.exit(0) }, EXIT_AFTER_MS)
  }

  function shutdown() {
    if (exitTimer) clearTimeout(exitTimer)
    parser.destroy()
    setCanvasPainterBackend(null)
    cleanup.destroy()
    term.destroy()
  }

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      shutdown()
      process.exit(0)
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => { console.error(err); process.exit(1) })
