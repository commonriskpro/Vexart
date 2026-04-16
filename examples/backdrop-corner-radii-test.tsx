/**
 * Backdrop + CornerRadii Test — validates E3-21.
 *
 * Goal:
 * - backdrop blur combined with real per-corner radii
 * - verify whether corners are respected or whether the case should remain fallback-only
 *
 * Run:
 *   TGE_RENDERER_BACKEND=gpu bun --conditions=browser run examples/backdrop-corner-radii-test.tsx
 */

import { mount, onInput } from "@tge/renderer"
import { createTerminal } from "@tge/terminal"
import { font, space } from "@tge/void"

function CornerCard(props: {
  title: string
  subtitle: string
  offsetX: number
  offsetY: number
  cornerRadii: { tl: number; tr: number; br: number; bl: number }
  backgroundColor: number
  borderColor: number
}) {
  return (
    <box
      width={220}
      height={90}
      backgroundColor={props.backgroundColor}
      backdropBlur={14}
      borderWidth={1}
      borderColor={props.borderColor}
      cornerRadii={props.cornerRadii}
      floating="parent"
      floatOffset={{ x: props.offsetX, y: props.offsetY }}
      padding={space[3]}
      gap={space[1]}
    >
      <text color={0xffffffff} fontSize={font.sm} fontWeight={700}>{props.title}</text>
      <text color={0xffffffcc} fontSize={font.xs}>{props.subtitle}</text>
    </box>
  )
}

function App() {
  return (
    <box width="grow" height="grow" backgroundColor={0x0a0a0aff} padding={space[5]} gap={space[5]}>
      <box gap={space[2]}>
        <text color={0xffffffff} fontSize={20} fontWeight={700}>Backdrop + CornerRadii Test</text>
        <text color={0xa3a3a3ff} fontSize={font.sm}>E3-21 — validate real per-corner radius on backdrop blur. Press q or Ctrl+C to exit.</text>
      </box>

      <box
        width={620}
        height={280}
        gradient={{ type: "linear", from: 0x22c55eff, to: 0x3b82f6ff, angle: 0 }}
      >
        <box direction="row" gap={space[6]} paddingTop={18} paddingLeft={24}>
          <text color={0x000000ff} fontSize={24} fontWeight={700}>CORNERS</text>
          <text color={0xffffffff} fontSize={24} fontWeight={700}>BLUR</text>
          <text color={0x000000ff} fontSize={24} fontWeight={700}>CHECK</text>
        </box>

        <box direction="column" gap={space[1]} paddingTop={84} paddingLeft={26}>
          <text color={0xffffffff} fontSize={font.xs}>Expected:</text>
          <text color={0xffffffcc} fontSize={font.xs}>Each card should clip blur correctly to its asymmetric corner shape with no square leaks.</text>
        </box>

        <CornerCard
          title="TL+BR"
          subtitle="top-left and bottom-right"
          offsetX={36}
          offsetY={120}
          cornerRadii={{ tl: 24, tr: 0, br: 24, bl: 0 }}
          backgroundColor={0x56d4c824}
          borderColor={0x56d4c866}
        />

        <CornerCard
          title="TR+BL"
          subtitle="top-right and bottom-left"
          offsetX={212}
          offsetY={120}
          cornerRadii={{ tl: 0, tr: 24, br: 0, bl: 24 }}
          backgroundColor={0xd946ef24}
          borderColor={0xd946ef66}
        />

        <CornerCard
          title="Top only"
          subtitle="rounded top corners only"
          offsetX={388}
          offsetY={120}
          cornerRadii={{ tl: 24, tr: 24, br: 0, bl: 0 }}
          backgroundColor={0xffffff20}
          borderColor={0xffffff40}
        />
      </box>
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
