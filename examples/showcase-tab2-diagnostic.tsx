/**
 * Showcase Tab 2 — Diagnostic validator for backdrop filters.
 *
 * This scene is intentionally UGLIER than the showcase. That's the point.
 * It uses high-contrast backgrounds so brightness/contrast/grayscale/invert/
 * sepia/hue-rotate/blur can be verified visually without ambiguity.
 *
 * Run:
 *   bun --conditions=browser run examples/showcase-tab2-diagnostic.tsx
 *
 * Exit:
 *   q or Ctrl+C
 */

import { mount, onInput, useTerminalDimensions } from "@vexart/engine"
import { createTerminal } from "@vexart/engine"
import { font, radius, space, themeColors, weight } from "@vexart/styled"

function SectionTitle(props: { children: unknown }) {
  return <text color={themeColors.mutedForeground} fontSize={font.xs} fontWeight={weight.semibold}>{props.children}</text>
}

function SectionBox(props: { title: string; children: unknown }) {
  return (
    <box direction="column" gap={space[2]} paddingBottom={space[4]}>
      <SectionTitle>{props.title}</SectionTitle>
      <box height={1} width="100%" backgroundColor={themeColors.border} />
      <box paddingTop={space[1]}>{props.children}</box>
    </box>
  )
}

function DiagnosticPanel(props: {
  label: string
  note: string
  width?: number
  height?: number
  backgroundColor?: number
  borderColor?: number
  backdropBlur?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
}) {
  return (
    <box
      width={props.width ?? 132}
      height={props.height ?? 58}
      backgroundColor={props.backgroundColor ?? 0xffffff16}
      borderWidth={1}
      borderColor={props.borderColor ?? 0xffffff2a}
      cornerRadius={radius.md}
      backdropBlur={props.backdropBlur}
      backdropBrightness={props.backdropBrightness}
      backdropContrast={props.backdropContrast}
      backdropSaturate={props.backdropSaturate}
      backdropGrayscale={props.backdropGrayscale}
      backdropInvert={props.backdropInvert}
      backdropSepia={props.backdropSepia}
      backdropHueRotate={props.backdropHueRotate}
      floating="parent"
      floatOffset={{ x: 18, y: 48 }}
      padding={space[2]}
      gap={2}
      alignY="center"
    >
      <text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>{props.label}</text>
      <text color={0xffffffdd} fontSize={10}>{props.note}</text>
    </box>
  )
}

function BrightnessTile() {
  return (
    <box width={170} height={138} cornerRadius={radius.lg} backgroundColor={0x121212ff}>
      <box direction="row" height={138}>
        <box width={56} height={138} backgroundColor={0x111111ff}>
          <box width={56} height={44} backgroundColor={0x050505ff} />
          <box width={56} height={44} backgroundColor={0x181818ff} />
          <box width={56} height={50} backgroundColor={0x2b2b2bff} />
        </box>
        <box width={58} height={138} gradient={{ type: "linear", from: 0x1d4ed8ff, to: 0x22c55eff, angle: 90 }}>
          <box width={58} height={36} backgroundColor={0xffffff12} />
          <box width={58} height={18} backgroundColor={0x00000055} />
          <box width={58} height={24} backgroundColor={0xffffff18} />
        </box>
        <box width={56} height={138} gradient={{ type: "linear", from: 0xef4444ff, to: 0xf59e0bff, angle: 90 }}>
          <box width={56} height={20} backgroundColor={0x00000066} />
          <box width={56} height={20} backgroundColor={0xffffff18} />
        </box>
      </box>
      <box floating="parent" floatOffset={{ x: 10, y: 10 }}><text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>Brightness</text></box>
      <DiagnosticPanel label="brightness 180" note="dark zones should lift" backdropBrightness={180} />
    </box>
  )
}

function ContrastTile() {
  return (
    <box width={170} height={138} cornerRadius={radius.lg} backgroundColor={0x1a1a1aff}>
      <box direction="column">
        <box direction="row" width={170} height={18}>
          <box width={17} height={18} backgroundColor={0x383838ff} />
          <box width={17} height={18} backgroundColor={0x404040ff} />
          <box width={17} height={18} backgroundColor={0x484848ff} />
          <box width={17} height={18} backgroundColor={0x505050ff} />
          <box width={17} height={18} backgroundColor={0x585858ff} />
          <box width={17} height={18} backgroundColor={0x606060ff} />
          <box width={17} height={18} backgroundColor={0x686868ff} />
          <box width={17} height={18} backgroundColor={0x707070ff} />
          <box width={17} height={18} backgroundColor={0x787878ff} />
          <box width={17} height={18} backgroundColor={0x808080ff} />
        </box>
        <box direction="row" width={170} height={44}>
          <box width={85} height={44} backgroundColor={0x5a5a5aff}>
            <box width={85} height={11} backgroundColor={0x4f4f4fff} />
            <box width={85} height={11} backgroundColor={0x666666ff} />
            <box width={85} height={11} backgroundColor={0x5d5d5dff} />
            <box width={85} height={11} backgroundColor={0x747474ff} />
          </box>
          <box width={85} height={44}>
            <box direction="row" height={11}>
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
            </box>
            <box direction="row" height={11}>
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
            </box>
            <box direction="row" height={11}>
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
            </box>
            <box direction="row" height={11}>
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
              <box width={17} height={11} backgroundColor={0x5b5b5bff} />
              <box width={17} height={11} backgroundColor={0x6c6c6cff} />
            </box>
          </box>
        </box>
        <box width={170} height={2} backgroundColor={0x727272ff} />
        <box width={170} height={2} backgroundColor={0x7a7a7aff} />
        <box width={170} height={2} backgroundColor={0x828282ff} />
        <box width={170} height={2} backgroundColor={0x8a8a8aff} />
        <box width={170} height={2} backgroundColor={0x929292ff} />
        <box width={170} height={2} backgroundColor={0x9a9a9aff} />
        <box width={170} height={2} backgroundColor={0xa2a2a2ff} />
        <box width={170} height={2} backgroundColor={0xaaaaaaff} />
        <box width={170} height={2} backgroundColor={0xb2b2b2ff} />
        <box width={170} height={2} backgroundColor={0xbababaaff} />
        <box width={170} height={2} backgroundColor={0xc2c2c2ff} />
        <box width={170} height={2} backgroundColor={0xcacacaff} />
        <box width={170} height={2} backgroundColor={0xd2d2d2ff} />
        <box width={170} height={2} backgroundColor={0xdadadaff} />
        <box width={170} height={2} backgroundColor={0xe2e2e2ff} />
        <box width={170} height={2} backgroundColor={0xeaeaeaff} />
        <box width={170} height={2} backgroundColor={0xf2f2f2ff} />
        <box width={170} height={38} backgroundColor={0x111111ff}>
          <box width={154} height={10} backgroundColor={0x686868ff} floating="parent" floatOffset={{ x: 8, y: 14 }} />
          <box width={154} height={1} backgroundColor={0x767676ff} floating="parent" floatOffset={{ x: 8, y: 19 }} />
          <box width={154} height={1} backgroundColor={0x7a7a7aff} floating="parent" floatOffset={{ x: 8, y: 22 }} />
        </box>
      </box>
      <box floating="parent" floatOffset={{ x: 10, y: 10 }}><text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>Contrast</text></box>
      <DiagnosticPanel label="contrast 200" note="micro-steps + near-gray lines should pop more" backdropContrast={200} />
    </box>
  )
}

function GrayscaleTile() {
  return (
    <box width={170} height={138} cornerRadius={radius.lg}>
      <box direction="row" height={138}>
        <box width={28} height={138} backgroundColor={0xef4444ff} />
        <box width={28} height={138} backgroundColor={0xf59e0bff} />
        <box width={28} height={138} backgroundColor={0xeab308ff} />
        <box width={28} height={138} backgroundColor={0x22c55eff} />
        <box width={28} height={138} backgroundColor={0x06b6d4ff} />
        <box width={30} height={138} backgroundColor={0x8b5cf6ff} />
      </box>
      <box floating="parent" floatOffset={{ x: 10, y: 10 }}><text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>Grayscale</text></box>
      <DiagnosticPanel label="grayscale 100" note="all colors should go gray" backdropGrayscale={100} />
    </box>
  )
}

function InvertTile() {
  return (
    <box width={170} height={138} cornerRadius={radius.lg} backgroundColor={0x0b0b0bff}>
      <box direction="row">
        <box width={85} height={138} backgroundColor={0x101010ff}>
          <box width={85} height={34} backgroundColor={0xffffffff} />
          <box width={85} height={34} backgroundColor={0x000000ff} />
          <box width={85} height={34} backgroundColor={0x2563ebff} />
          <box width={85} height={36} backgroundColor={0xdc2626ff} />
        </box>
        <box width={85} height={138} backgroundColor={0xf5f5f5ff}>
          <box width={85} height={34} backgroundColor={0x000000ff} />
          <box width={85} height={34} backgroundColor={0xffffffff} />
          <box width={85} height={34} backgroundColor={0x16a34aff} />
          <box width={85} height={36} backgroundColor={0x9333eaff} />
        </box>
      </box>
      <box floating="parent" floatOffset={{ x: 10, y: 10 }}><text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>Invert</text></box>
      <DiagnosticPanel label="invert 100" note="black↔white, colors invert" backdropInvert={100} />
    </box>
  )
}

function SepiaTile() {
  return (
    <box width={170} height={138} cornerRadius={radius.lg}>
      <box direction="row" height={138}>
        <box width={42} height={138} backgroundColor={0x0f172aff}>
          <box width={42} height={18} backgroundColor={0xe0f2feff} />
          <box width={42} height={18} backgroundColor={0x22d3eeff} />
          <box width={42} height={18} backgroundColor={0x0891b2ff} />
          <box width={42} height={18} backgroundColor={0x0f766eff} />
          <box width={42} height={18} backgroundColor={0x1d4ed8ff} />
          <box width={42} height={18} backgroundColor={0x312e81ff} />
          <box width={42} height={30} backgroundColor={0x020617ff} />
        </box>
        <box width={42} height={138} backgroundColor={0x082f49ff}>
          <box width={42} height={24} backgroundColor={0x67e8f9ff} />
          <box width={42} height={10} backgroundColor={0xffffff20} />
          <box width={42} height={24} backgroundColor={0x60a5faff} />
          <box width={42} height={10} backgroundColor={0x00000055} />
          <box width={42} height={24} backgroundColor={0x4ade80ff} />
          <box width={42} height={10} backgroundColor={0xffffff16} />
          <box width={42} height={36} backgroundColor={0x1e293bff} />
        </box>
        <box width={42} height={138} backgroundColor={0x0c4a6eff}>
          <box width={42} height={18} backgroundColor={0x22d3eeff} />
          <box width={42} height={18} backgroundColor={0x38bdf8ff} />
          <box width={42} height={18} backgroundColor={0x2563ebff} />
          <box width={42} height={18} backgroundColor={0x06b6d4ff} />
          <box width={42} height={18} backgroundColor={0x14b8a6ff} />
          <box width={42} height={18} backgroundColor={0x0ea5e9ff} />
          <box width={42} height={30} backgroundColor={0x172554ff} />
        </box>
        <box width={44} height={138} backgroundColor={0x111827ff}>
          <box width={44} height={22} backgroundColor={0x93c5fdff} />
          <box width={44} height={22} backgroundColor={0xa5f3fcff} />
          <box width={44} height={22} backgroundColor={0x86efacff} />
          <box width={44} height={22} backgroundColor={0xe0f2feff} />
          <box width={44} height={22} backgroundColor={0x67e8f9ff} />
          <box width={44} height={28} backgroundColor={0x030712ff} />
        </box>
      </box>
      <box floating="parent" floatOffset={{ x: 10, y: 10 }}><text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>Sepia</text></box>
      <DiagnosticPanel
        label="sepia 100"
        note="background behind panel should warm up; chrome stays neutral"
        backdropSepia={100}
        backgroundColor={0x05050508}
        borderColor={0xffd28a66}
      />
    </box>
  )
}

function HueRotateTile() {
  return (
    <box width={170} height={138} cornerRadius={radius.lg}>
      <box direction="row" height={138}>
        <box width={24} height={138} backgroundColor={0xef4444ff} />
        <box width={24} height={138} backgroundColor={0xf97316ff} />
        <box width={24} height={138} backgroundColor={0xeab308ff} />
        <box width={24} height={138} backgroundColor={0x22c55eff} />
        <box width={24} height={138} backgroundColor={0x06b6d4ff} />
        <box width={24} height={138} backgroundColor={0x3b82f6ff} />
        <box width={26} height={138} backgroundColor={0xa855f7ff} />
      </box>
      <box floating="parent" floatOffset={{ x: 10, y: 10 }}><text color={0xffffffff} fontSize={font.xs} fontWeight={weight.semibold}>Hue Rotate</text></box>
      <DiagnosticPanel label="hue +180°" note="colors should shift strongly" backdropHueRotate={180} />
    </box>
  )
}

function BlurHero() {
  return (
    <box width={540} height={200} cornerRadius={radius.lg} backgroundColor={0x0f172aff}>
      <box direction="row">
        <box width={180} height={200} gradient={{ type: "linear", from: 0x0f766eff, to: 0x06b6d4ff, angle: 90 }}>
          <box width={180} height={40} backgroundColor={0xffffff18} />
          <box width={180} height={20} backgroundColor={0x00000055} />
          <box width={180} height={20} backgroundColor={0xffffff10} />
        </box>
        <box width={180} height={200} gradient={{ type: "linear", from: 0xe11d48ff, to: 0xf59e0bff, angle: 90 }}>
          <box width={180} height={30} backgroundColor={0x00000066} />
          <box width={180} height={26} backgroundColor={0xffffff12} />
          <box width={180} height={26} backgroundColor={0x00000055} />
        </box>
        <box width={180} height={200} gradient={{ type: "linear", from: 0x4338caff, to: 0x2563ebff, angle: 90 }}>
          <box width={180} height={48} backgroundColor={0xffffff18} />
          <box width={180} height={18} backgroundColor={0x00000055} />
        </box>
      </box>

      <box floating="parent" floatOffset={{ x: 16, y: 14 }} direction="row" gap={24}>
        <text color={0x000000ff} fontSize={24} fontWeight={700}>SHARP</text>
        <text color={0xffffffff} fontSize={24} fontWeight={700}>BLUR</text>
        <text color={0x000000ff} fontSize={24} fontWeight={700}>CHECK</text>
      </box>

      <box
        width={390}
        height={82}
        backgroundColor={0xffffff1a}
        backdropBlur={16}
        borderWidth={1}
        borderColor={0xffffff33}
        cornerRadius={radius.xl}
        floating="parent"
        floatOffset={{ x: 78, y: 88 }}
        padding={space[3]}
        gap={space[1]}
      >
        <text color={0xffffffff} fontSize={font.sm} fontWeight={weight.semibold}>blur 16</text>
        <text color={0xffffffdd} fontSize={font.xs}>Background bands and edges behind this panel should look softened.</text>
      </box>
    </box>
  )
}

export function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)

  return (
    <box width={dims.width()} height={dims.height()} backgroundColor={themeColors.background} padding={space[4]}>
      <box direction="column" gap={space[4]} width="grow" scrollY>
        <box direction="column" gap={space[1]}>
          <text color={themeColors.foreground} fontSize={20} fontWeight={700}>Showcase — Tab 2 Diagnostic</text>
          <text color={themeColors.mutedForeground} fontSize={font.sm}>Validator visual FEÍTO pero honesto. Acá no buscamos lindo: buscamos ver diferencias reales. Corré esto fuera de tmux. q para salir.</text>
        </box>

        <SectionBox title="HOW TO READ THIS">
          <box direction="column" gap={space[2]}>
            <text color={themeColors.foreground} fontSize={font.xs}>Compará cada panel translúcido con el fondo que lo rodea. Si el filtro funciona, el contenido detrás del panel se tiene que ver DISTINTO respecto al tile base.</text>
            <text color={themeColors.foreground} fontSize={font.xs}>OJO: esto es <text color={0xf59e0bff}>backdrop</text>, no self-filter. El panel/chrome puede seguir viéndose neutral; lo que cambia es el fondo que se ve A TRAVÉS del panel.</text>
            <text color={themeColors.mutedForeground} fontSize={font.xs}>Brightness → levanta sombras • Contrast → separa bandas grises • Grayscale → mata color • Invert → invierte • Sepia → el fondo detrás se vuelve cálido • Hue Rotate → cambia hue fuerte.</text>
          </box>
        </SectionBox>

        <SectionBox title="BLUR DIAGNOSTIC">
          <BlurHero />
        </SectionBox>

        <SectionBox title="COLOR FILTER DIAGNOSTIC">
          <box direction="column" gap={space[3]}>
            <box direction="row" gap={space[3]}>
              <BrightnessTile />
              <ContrastTile />
              <GrayscaleTile />
            </box>
            <box direction="row" gap={space[3]}>
              <InvertTile />
              <SepiaTile />
              <HueRotateTile />
            </box>
          </box>
        </SectionBox>
      </box>
    </box>
  )
}

async function main() {
  const term = await createTerminal()
  const app = mount(() => <App terminal={term} />, term, {
    experimental: {
    },
  })
  const exitAfterMs = Number(process.env.VEXART_EXIT_AFTER_MS ?? 0)

  const shutdown = () => {
    app.destroy()
    term.destroy()
    process.exit(0)
  }

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) shutdown()
  })

  if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) {
    setTimeout(shutdown, exitAfterMs)
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
