/**
 * Showcase Tab 2 — Backdrop Filters + Opacity.
 *
 * Minimal repro/verification scene extracted from the main showcase so it can
 * be validated visually in a real Kitty-compatible terminal.
 *
 * Run:
 *   bun --conditions=browser run examples/showcase-tab2.tsx
 *
 * IMPORTANT:
 *   Run this directly in Kitty / Ghostty / WezTerm.
 *   tmux is NOT authoritative-supported in v0.9 (docs/PRD.md §7.4).
 *
 * Exit:
 *   q or Ctrl+C
 */

import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
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

export function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <box width={dims.width()} height={dims.height()} backgroundColor={themeColors.background} padding={space[4]}>
      <box direction="column" gap={space[4]} width="grow" scrollY>
        <box direction="column" gap={space[1]}>
          <text color={themeColors.foreground} fontSize={20} fontWeight={700}>Showcase — Tab 2 Visual Check</text>
          <text color={themeColors.mutedForeground} fontSize={font.sm}>Backdrop filters + glassmorphism + opacity. Corré esto FUERA de tmux. q para salir.</text>
        </box>

        <SectionBox title="BACKDROP FILTERS (same components as showcase tab 2)">
          <box direction="column" gap={space[4]}>
            <box width={540} height={170} gradient={{ type: "linear", from: 0x56d4c8ff, to: 0xdc2626ff, angle: 0 }} cornerRadius={radius.lg}>
              <box direction="row" gap={40} paddingTop={14} paddingLeft={24}>
                <text color={0x000000ff} fontSize={24} fontWeight={700}>BLUR</text>
                <text color={0xffffffff} fontSize={24} fontWeight={700}>TEST</text>
                <text color={0x000000ff} fontSize={24} fontWeight={700}>SHARP</text>
              </box>
              <box
                width={380}
                height={72}
                backgroundColor={0xffffff20}
                backdropBlur={16}
                cornerRadius={radius.xl}
                borderWidth={1}
                borderColor={0xffffff30}
                floating="parent"
                floatOffset={{ x: 80, y: 74 }}
                alignX="center"
                alignY="center"
              >
                <text color={themeColors.foreground} fontSize={font.sm}>glass panel — content behind is blurred</text>
              </box>
            </box>

            <box direction="row" gap={space[3]}>
              <box width={160} height={120} gradient={{ type: "linear", from: 0x4488ccff, to: 0x22c55eff, angle: 45 }} cornerRadius={radius.lg}>
                <box width={120} height={48} backdropBrightness={180} backgroundColor={0xffffff08} cornerRadius={radius.md} floating="parent" floatOffset={{ x: 20, y: 48 }} alignX="center" alignY="center">
                  <text color="#fff" fontSize={font.xs}>brightness 180</text>
                </box>
                <box paddingTop={10} paddingLeft={12}><text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Brightness</text></box>
              </box>

              <box width={160} height={120} gradient={{ type: "linear", from: 0x4488ccff, to: 0x22c55eff, angle: 45 }} cornerRadius={radius.lg}>
                <box width={120} height={48} backdropContrast={200} backgroundColor={0xffffff08} cornerRadius={radius.md} floating="parent" floatOffset={{ x: 20, y: 48 }} alignX="center" alignY="center">
                  <text color="#fff" fontSize={font.xs}>contrast 200</text>
                </box>
                <box paddingTop={10} paddingLeft={12}><text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Contrast</text></box>
              </box>

              <box width={160} height={120} gradient={{ type: "linear", from: 0xdc2626ff, to: 0xf59e0bff, angle: 0 }} cornerRadius={radius.lg}>
                <box width={120} height={48} backdropGrayscale={100} backgroundColor={0xffffff08} cornerRadius={radius.md} floating="parent" floatOffset={{ x: 20, y: 48 }} alignX="center" alignY="center">
                  <text color="#fff" fontSize={font.xs}>grayscale 100</text>
                </box>
                <box paddingTop={10} paddingLeft={12}><text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Grayscale</text></box>
              </box>
            </box>

            <box direction="row" gap={space[3]}>
              <box width={160} height={120} gradient={{ type: "linear", from: 0x4488ccff, to: 0xa855f7ff, angle: 0 }} cornerRadius={radius.lg}>
                <box width={120} height={48} backdropInvert={100} backgroundColor={0xffffff08} cornerRadius={radius.md} floating="parent" floatOffset={{ x: 20, y: 48 }} alignX="center" alignY="center">
                  <text color="#000" fontSize={font.xs}>invert 100</text>
                </box>
                <box paddingTop={10} paddingLeft={12}><text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Invert</text></box>
              </box>

              <box width={160} height={120} gradient={{ type: "linear", from: 0x4488ccff, to: 0x22c55eff, angle: 90 }} cornerRadius={radius.lg}>
                <box width={120} height={48} backdropSepia={100} backgroundColor={0xffffff08} cornerRadius={radius.md} floating="parent" floatOffset={{ x: 20, y: 48 }} alignX="center" alignY="center">
                  <text color="#fff" fontSize={font.xs}>sepia 100</text>
                </box>
                <box paddingTop={10} paddingLeft={12}><text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Sepia</text></box>
              </box>

              <box width={160} height={120} gradient={{ type: "linear", from: 0xdc2626ff, to: 0x4488ccff, angle: 0 }} cornerRadius={radius.lg}>
                <box width={120} height={48} backdropHueRotate={180} backgroundColor={0xffffff08} cornerRadius={radius.md} floating="parent" floatOffset={{ x: 20, y: 48 }} alignX="center" alignY="center">
                  <text color="#fff" fontSize={font.xs}>hue +180°</text>
                </box>
                <box paddingTop={10} paddingLeft={12}><text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Hue Rotate</text></box>
              </box>
            </box>

            <box width={300} height={120} gradient={{ type: "linear", from: 0x22c55eff, to: 0x3b82f6ff, angle: 0 }} cornerRadius={radius.lg}>
              <box direction="row" gap={30} paddingTop={10} paddingLeft={14}>
                <text color={0x000000ff} fontSize={20} fontWeight={700}>VEXART</text>
                <text color={0xffffffff} fontSize={20} fontWeight={700}>ENGINE</text>
              </box>
              <box width={250} height={50} backdropBlur={12} backdropBrightness={130} backdropSaturate={160} backgroundColor={0xffffff15} cornerRadius={radius.lg} borderWidth={1} borderColor={0xffffff20} floating="parent" floatOffset={{ x: 24, y: 54 }} alignX="center" alignY="center">
                <text color="#fff" fontSize={font.xs}>blur + bright + saturate combined</text>
              </box>
            </box>
          </box>
        </SectionBox>

        <SectionBox title="ELEMENT OPACITY (0.2 / 0.5 / 0.8 / 1.0) — over gradient background">
          <box
            gradient={{ type: "linear", from: 0xff6b35ff, to: 0x00b4d8ff, angle: 0 }}
            cornerRadius={radius.lg}
            padding={space[4]}
            direction="row"
            gap={space[3]}
            alignY="center"
          >
            <box width={100} height={50} backgroundColor="#1a1a2eff" cornerRadius={radius.md} opacity={0.2} alignX="center" alignY="center">
              <text color="#fff" fontSize={font.xs}>0.2</text>
            </box>
            <box width={100} height={50} backgroundColor="#1a1a2eff" cornerRadius={radius.md} opacity={0.5} alignX="center" alignY="center">
              <text color="#fff" fontSize={font.xs}>0.5</text>
            </box>
            <box width={100} height={50} backgroundColor="#1a1a2eff" cornerRadius={radius.md} opacity={0.8} alignX="center" alignY="center">
              <text color="#fff" fontSize={font.xs}>0.8</text>
            </box>
            <box width={100} height={50} backgroundColor="#1a1a2eff" cornerRadius={radius.md} opacity={1.0} alignX="center" alignY="center">
              <text color="#fff" fontSize={font.xs}>1.0</text>
            </box>
          </box>
        </SectionBox>
      </box>
    </box>
  )
}

const app = await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: {
    experimental: {
    },
  },
})
const exitAfterMs = Number(process.env.VEXART_EXIT_AFTER_MS ?? 0)

if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) {
  setTimeout(() => {
    app.destroy()
    process.exit(0)
  }, exitAfterMs)
}
