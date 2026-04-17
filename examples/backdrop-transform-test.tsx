/**
 * Backdrop + Transform Test — validates E3-20.
 *
 * Goal:
 * - backdrop blur combined with transforms
 * - verify whether the result is visually correct
 * - confirm whether the current path is true GPU support or explicit fallback
 *
 * Run:
 *   TGE_RENDERER_BACKEND=gpu bun --conditions=browser run examples/backdrop-transform-test.tsx
 */

import { mount, onInput } from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { font, radius, space } from "@tge/void"

function BackdropTransformCard(props: {
  title: string
  subtitle: string
  offsetX: number
  offsetY: number
  transform: {
    rotate?: number
    scale?: number
    translateX?: number
    translateY?: number
    perspective?: number
    rotateY?: number
  }
}) {
  return (
    <box
      width={210}
      height={90}
      backgroundColor={0xffffff1c}
      backdropBlur={14}
      borderWidth={1}
      borderColor={0xffffff33}
      cornerRadius={radius.xl}
      transform={props.transform}
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
        <text color={0xffffffff} fontSize={20} fontWeight={700}>Backdrop + Transform Test</text>
        <text color={0xa3a3a3ff} fontSize={font.sm}>E3-20 — validate correctness and classify whether this path is supported or explicit fallback. Press q or Ctrl+C to exit.</text>
      </box>

      <box
        width={620}
        height={280}
        gradient={{ type: "linear", from: 0x22c55eff, to: 0x3b82f6ff, angle: 0 }}
        cornerRadius={radius.lg}
      >
        <box direction="row" gap={space[6]} paddingTop={18} paddingLeft={24}>
          <text color={0x000000ff} fontSize={24} fontWeight={700}>TRANSFORM</text>
          <text color={0xffffffff} fontSize={24} fontWeight={700}>BLUR</text>
          <text color={0x000000ff} fontSize={24} fontWeight={700}>CHECK</text>
        </box>

        <box direction="column" gap={space[1]} paddingTop={84} paddingLeft={26}>
          <text color={0xffffffff} fontSize={font.xs}>Expected:</text>
          <text color={0xffffffcc} fontSize={font.xs}>Cards should blur the background behind their transformed shape without obvious crop/geometry corruption.</text>
        </box>

        <BackdropTransformCard
          title="Rotate"
          subtitle="rotate(12°)"
          offsetX={34}
          offsetY={120}
          transform={{ rotate: 12 }}
        />

        <BackdropTransformCard
          title="Scale"
          subtitle="scale(1.08)"
          offsetX={255}
          offsetY={116}
          transform={{ scale: 1.08 }}
        />

        <BackdropTransformCard
          title="Perspective"
          subtitle="perspective + rotateY"
          offsetX={430}
          offsetY={122}
          transform={{ perspective: 450, rotateY: 18 }}
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
