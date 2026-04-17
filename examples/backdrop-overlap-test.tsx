/**
 * Backdrop Overlap Test — validates E3-19.
 *
 * Goal:
 * - two overlapping backdrop panels
 * - strong gradient background
 * - sharp text behind panels
 * - distinct panel tints to catch source contamination/reuse bugs
 *
 * Run:
 *   TGE_RENDERER_BACKEND=gpu bun --conditions=browser run examples/backdrop-overlap-test.tsx
 */

import { mount, onInput } from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { font, radius, space } from "@tge/void"

function GlassPanel(props: {
  title: string
  subtitle: string
  width: number
  height: number
  offsetX: number
  offsetY: number
  backgroundColor: number
  borderColor: number
  zIndex: number
}) {
  return (
    <box
      width={props.width}
      height={props.height}
      backgroundColor={props.backgroundColor}
      backdropBlur={14}
      cornerRadius={radius.xl}
      borderWidth={1}
      borderColor={props.borderColor}
      floating="parent"
      floatOffset={{ x: props.offsetX, y: props.offsetY }}
      zIndex={props.zIndex}
      padding={space[3]}
      gap={space[2]}
    >
      <text color={0xffffffff} fontSize={font.sm} fontWeight={700}>{props.title}</text>
      <text color={0xffffffcc} fontSize={font.xs}>{props.subtitle}</text>
    </box>
  )
}

function OverlapStage(props: {
  title: string
  subtitle: string
  width: number
  height: number
  backgroundFrom: number
  backgroundTo: number
  labelA: string
  labelB: string
}) {
  return (
    <box direction="column" gap={space[2]}>
      <text color={0xa3a3a3ff} fontSize={font.xs} fontWeight={600}>{props.title}</text>
      <box
        width={props.width}
        height={props.height}
        gradient={{ type: "linear", from: props.backgroundFrom, to: props.backgroundTo, angle: 0 }}
        cornerRadius={radius.lg}
      >
        <box direction="row" gap={space[6]} paddingTop={12} paddingLeft={20}>
          <text color={0x000000ff} fontSize={22} fontWeight={700}>{props.labelA}</text>
          <text color={0xffffffff} fontSize={22} fontWeight={700}>{props.labelB}</text>
          <text color={0x000000ff} fontSize={22} fontWeight={700}>OVERLAP</text>
        </box>

        <box direction="column" gap={space[1]} paddingTop={78} paddingLeft={22}>
          <text color={0xffffffff} fontSize={font.xs}>Expected:</text>
          <text color={0xffffffcc} fontSize={font.xs}>{props.subtitle}</text>
        </box>

        <GlassPanel
          title="Panel A"
          subtitle="cyan tint — should only sample background behind itself"
          width={250}
          height={96}
          offsetX={34}
          offsetY={52}
          backgroundColor={0x56d4c824}
          borderColor={0x56d4c866}
          zIndex={10}
        />

        <GlassPanel
          title="Panel B"
          subtitle="magenta tint — overlap should not contaminate the other panel"
          width={250}
          height={96}
          offsetX={170}
          offsetY={96}
          backgroundColor={0xd946ef24}
          borderColor={0xd946ef66}
          zIndex={20}
        />
      </box>
    </box>
  )
}

function App() {
  return (
    <box width="grow" height="grow" backgroundColor={0x0a0a0aff} padding={space[5]} gap={space[5]}>
      <box gap={space[2]}>
        <text color={0xffffffff} fontSize={20} fontWeight={700}>Backdrop Overlap Test</text>
        <text color={0xa3a3a3ff} fontSize={font.sm}>E3-19 — validate overlap, source identity and backdrop sampling correctness. Press q or Ctrl+C to exit.</text>
      </box>

      <OverlapStage
        title="CASE 1 — strong gradient + sharp text"
        subtitle="Both panels should blur only what is behind them. Overlap zone should look spatially consistent, not duplicated or stale."
        width={540}
        height={240}
        backgroundFrom={0x22c55eff}
        backgroundTo={0x3b82f6ff}
        labelA="ALPHA"
        labelB="BETA"
      />

      <OverlapStage
        title="CASE 2 — warm/cool split contrast"
        subtitle="Panel colors must remain distinct. If source reuse is wrong, one panel may sample the other or show mismatched blur."
        width={540}
        height={240}
        backgroundFrom={0xdc2626ff}
        backgroundTo={0xf59e0bff}
        labelA="HOT"
        labelB="COLD"
      />
    </box>
  )
}

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term)
  const exitAfterMs = Number(process.env.TGE_EXIT_AFTER_MS ?? process.env.LIGHTCODE_EXIT_AFTER_MS ?? 0)

  const shutdown = () => {
    cleanup.destroy()
    term.destroy()
    process.exit(0)
  }

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
      shutdown()
    }
  })

  if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) {
    setTimeout(shutdown, exitAfterMs)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
