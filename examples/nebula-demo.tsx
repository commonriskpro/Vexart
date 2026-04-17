/**
 * Procedural Nebula Demo — standalone inspector for the Zig nebula primitive.
 *
 * Run: bun --conditions=browser run examples/nebula-demo.tsx
 */

import { createSignal } from "solid-js"
import { mount, markDirty, useDrag, useMouse } from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { hasNebulaSupport } from "@tge/pixel"
import { createSpaceBackground, type SpaceBackground } from "@tge/components"
import { space } from "@tge/void"
import type { CanvasContext, NodeHandle, NodeMouseEvent } from "@tge/renderer-solid"

type NebulaSample = {
  name: string
  note: string
  bg: SpaceBackground
  accent: number
}

let samples: NebulaSample[] = []
const [debugEnabled, setDebugEnabled] = createSignal(true)

function bakeNebula(
  name: string,
  note: string,
  accent: number,
  stops: { color: number; position: number }[],
  options: { seed: number; scale: number; octaves: number; gain: number; lacunarity: number; warp: number; detail?: number; dust?: number },
) {
  const bg = createSpaceBackground({
    width: 640,
    height: 360,
    seed: options.seed,
    backgroundColor: 0x040507ff,
    nebula: { stops, noise: options },
    starfield: {
      count: accent === 0x90a8d0ff ? 420 : 520,
      clusterCount: accent === 0xff9b54ff ? 5 : 7,
      clusterStars: accent === 0xece7ddff ? 46 : 72,
      warmColor: 0xf3d7a1d8,
      coolColor: 0xc1d7ffe0,
      neutralColor: 0xffffffd8,
    },
    sparkles: {
      count: accent === 0xece7ddff ? 2 : 3,
      color: accent === 0xff9b54ff ? 0xffcf87ff : accent === 0x90a8d0ff ? 0xdfe8ffff : 0xfff2d8ff,
    },
    atmosphere: {
      count: 4,
      colors: accent === 0xff9b54ff
        ? [0xff9b5418, 0xf3bf6b12, 0xffffff08]
        : accent === 0x90a8d0ff
          ? [0x8fb7ff16, 0x7d69a914, 0xffffff08]
          : [0x7db6ff16, 0xf3bf6b14, 0xffffff08],
    },
  })

  return {
    name,
    note,
    bg,
    accent,
  }
}

function buildSamples() {
  if (!hasNebulaSupport()) {
    samples = []
    return
  }

  samples = [
    bakeNebula(
      "Cinematic Gold",
      "balanced warp • amber core • teal dust",
      0xf3bf6bff,
      [
        { color: 0x04050700, position: 0 },
        { color: 0x13273aaa, position: 0.28 },
        { color: 0x295369b8, position: 0.58 },
        { color: 0x8f5d37b0, position: 0.82 },
        { color: 0xf3bf6b84, position: 1 },
      ],
      { seed: 1337, scale: 176, octaves: 5, gain: 60, lacunarity: 212, warp: 54, detail: 96, dust: 66 },
    ),
    bakeNebula(
      "Cold Rift",
      "wide wisps • lower gain • blue-violet field",
      0x90a8d0ff,
      [
        { color: 0x04050700, position: 0 },
        { color: 0x101b30a0, position: 0.3 },
        { color: 0x354a7cb8, position: 0.6 },
        { color: 0x7d69a9a2, position: 0.83 },
        { color: 0xd6dcff70, position: 1 },
      ],
      { seed: 412, scale: 212, octaves: 5, gain: 54, lacunarity: 214, warp: 40, detail: 88, dust: 58 },
    ),
    bakeNebula(
      "Ember Storm",
      "aggressive warp • hotter palette • dense bloom",
      0xff9b54ff,
      [
        { color: 0x05050700, position: 0 },
        { color: 0x24130ca0, position: 0.22 },
        { color: 0x5d2d17bc, position: 0.56 },
        { color: 0xa35a2ac0, position: 0.82 },
        { color: 0xffcf87a2, position: 1 },
      ],
      { seed: 8128, scale: 164, octaves: 5, gain: 64, lacunarity: 218, warp: 64, detail: 100, dust: 72 },
    ),
    bakeNebula(
      "Ghost Veil",
      "soft warp • airy field • pale rim light",
      0xece7ddff,
      [
        { color: 0x04050700, position: 0 },
        { color: 0x14202fa0, position: 0.25 },
        { color: 0x3b6076ac, position: 0.56 },
        { color: 0x8d9aa9a4, position: 0.82 },
        { color: 0xf6efe07c, position: 1 },
      ],
      { seed: 72, scale: 228, octaves: 5, gain: 50, lacunarity: 206, warp: 30, detail: 82, dust: 54 },
    ),
  ]
}

function Preview(props: { sample: NebulaSample; width: number; height: number; onDebug: (msg: string) => void }) {
  const frameW = props.width - 24
  const frameH = props.height
  const zoom = frameW >= 900 ? 1.34 : 1.5
  const drawW = Math.round(frameW * zoom)
  const drawH = Math.round(frameH * zoom)
  const minX = frameW - drawW
  const minY = frameH - drawH
  const [offsetX, setOffsetX] = createSignal(Math.round((frameW - drawW) * 0.5))
  const [offsetY, setOffsetY] = createSignal(Math.round((frameH - drawH) * 0.5))
  const [surfaceId, setSurfaceId] = createSignal(0)
  const [hovered, setHovered] = createSignal(false)
  const [lastEvent, setLastEvent] = createSignal("idle")
  const [handleRefState, setHandleRefState] = createSignal<NodeHandle | null>(null)
  const [layoutDebug, setLayoutDebug] = createSignal("layout: pending")
  let startMouseX = 0
  let startMouseY = 0
  let startOffsetX = 0
  let startOffsetY = 0

  function clampOffset(v: number, min: number) {
    if (v < min) return min
    if (v > 0) return 0
    return v
  }

  function debug(msg: string) {
    const full = `${props.sample.name}#${surfaceId()} ${msg}`
    setLastEvent(msg)
    props.onDebug(full)
    markDirty()
  }

  function captureLayoutFromEvent(evt: NodeMouseEvent) {
    const x = evt.x - evt.nodeX
    const y = evt.y - evt.nodeY
    setLayoutDebug(`layout:${x},${y},${evt.width},${evt.height}`)
  }

  const layoutLine = () => {
    const h = handleRefState()
    if (!h) return layoutDebug()
    return `${layoutDebug()} handle:${h.layout.x},${h.layout.y},${h.layout.width},${h.layout.height}`
  }

  const { dragProps, dragging } = useDrag({
    onDragStart: (evt: NodeMouseEvent) => {
      startMouseX = evt.x
      startMouseY = evt.y
      startOffsetX = offsetX()
      startOffsetY = offsetY()
      debug(`drag-start abs(${evt.x},${evt.y}) rel(${evt.nodeX},${evt.nodeY}) off(${startOffsetX},${startOffsetY})`)
    },
    onDrag: (evt: NodeMouseEvent) => {
      const dx = Math.round(evt.x - startMouseX)
      const dy = Math.round(evt.y - startMouseY)
      const nextX = clampOffset(startOffsetX + dx, minX)
      const nextY = clampOffset(startOffsetY + dy, minY)
      setOffsetX(nextX)
      setOffsetY(nextY)
      setLastEvent(`drag abs(${evt.x},${evt.y}) rel(${evt.nodeX},${evt.nodeY}) off(${nextX},${nextY})`)
      markDirty()
    },
    onDragEnd: (evt: NodeMouseEvent) => {
      debug(`drag-end abs(${evt.x},${evt.y}) rel(${evt.nodeX},${evt.nodeY}) off(${offsetX()},${offsetY()})`)
    },
  })

  function handleRef(handle: NodeHandle) {
    dragProps.ref(handle)
    setHandleRefState(handle)
    setSurfaceId(handle.id)
    setLayoutDebug(`layout:${handle.layout.x},${handle.layout.y},${handle.layout.width},${handle.layout.height}`)
    setLastEvent(`ref node-${handle.id}`)
  }

  function handleMouseDown(evt: NodeMouseEvent) {
    captureLayoutFromEvent(evt)
    debug(`down abs(${evt.x},${evt.y}) rel(${evt.nodeX},${evt.nodeY})`)
    dragProps.onMouseDown(evt)
  }

  function handleMouseMove(evt: NodeMouseEvent) {
    captureLayoutFromEvent(evt)
    if (!dragging()) {
      setLastEvent(`move abs(${evt.x},${evt.y}) rel(${evt.nodeX},${evt.nodeY})`)
    }
    dragProps.onMouseMove(evt)
  }

  function handleMouseUp(evt: NodeMouseEvent) {
    captureLayoutFromEvent(evt)
    debug(`up abs(${evt.x},${evt.y}) rel(${evt.nodeX},${evt.nodeY}) off(${offsetX()},${offsetY()})`)
    dragProps.onMouseUp(evt)
  }

  return (
    <box
      width={props.width}
      backgroundColor={0x111317ee}
      gradient={{ type: "linear", from: 0x171a20f2, to: 0x0d0f14f0, angle: 90 }}
      cornerRadius={12}
      borderColor={0xffffff12}
      borderWidth={1}
      padding={space[3]}
      gap={space[2]}
      shadow={{ x: 0, y: 10, blur: 18, color: 0x00000030 }}
    >
      <box direction="row" alignY="center">
        <text color={0xf2eee6ff} fontSize={13}>{props.sample.name}</text>
        <box width="grow" />
        <text color={dragging() ? 0xf2eee6ff : 0x7b7469ff} fontSize={10}>{dragging() ? "dragging" : "drag to pan"}</text>
        <box width={12} />
        <text color={props.sample.accent} fontSize={10}>nebula</text>
      </box>
      <text color={0x8e877aff} fontSize={10}>{props.sample.note}</text>
      {debugEnabled() ? (
        <>
          <text color={hovered() ? 0xf3bf6bff : 0x746d63ff} fontSize={9}>{`node:${surfaceId()} hover:${hovered() ? "yes" : "no"} drag:${dragging() ? "yes" : "no"} off:${offsetX()},${offsetY()}`}</text>
          <text color={0x5d6877ff} fontSize={9}>{layoutLine()}</text>
          <text color={0x666057ff} fontSize={9}>{lastEvent()}</text>
        </>
      ) : null}
      <surface
        ref={handleRef}
        width={frameW}
        height={props.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseOver={() => {
          setHovered(true)
          setLastEvent("over")
          markDirty()
        }}
        onMouseOut={() => {
          setHovered(false)
          setLastEvent("out")
          markDirty()
        }}
        onDraw={(ctx: CanvasContext) => {
          ctx.rect(0, 0, frameW, frameH, { fill: 0x06070aff, radius: 10 })
          props.sample.bg.draw(ctx, {
            x: offsetX(),
            y: offsetY(),
            w: drawW,
            h: drawH,
            opacity: 1,
          })
          ctx.linearGradient(0, 0, frameW, 24, 0x00000044, 0x00000000, 90)
          ctx.linearGradient(0, frameH - 26, frameW, 26, 0x00000000, 0x00000055, 90)
          ctx.rect(0, 0, frameW, frameH, { stroke: dragging() ? props.sample.accent : 0xffffff10, strokeWidth: 1, radius: 10 })
        }}
      />
    </box>
  )
}

function SupportFallback() {
  return (
    <box width="100%" height="100%" backgroundColor={0x050507ff} alignX="center" alignY="center">
      <box
        width={720}
        backgroundColor={0x111317f4}
        gradient={{ type: "linear", from: 0x171a20f8, to: 0x0d0f14f0, angle: 90 }}
        borderColor={0xffffff12}
        borderWidth={1}
        cornerRadius={14}
        padding={space[5]}
        gap={space[3]}
      >
        <text color={0xf3ede2ff} fontSize={18}>Procedural Nebula Demo</text>
        <text color={0xc6bcaeff} fontSize={12}>La primitive existe en TypeScript, pero la lib Zig cargada todavía no expone `tge_nebula`.</text>
        <text color={0x918779ff} fontSize={11}>Recompilá la shared lib nativa y volvé a correr este example. Ahí sí vas a ver las variantes bakeadas con noise procedural real.</text>
        <box padding={space[3]} backgroundColor={0xffffff05} borderColor={0xffffff10} borderWidth={1} cornerRadius={10}>
          <text color={0xf3bf6bff} fontSize={11}>Run: bun --conditions=browser run examples/nebula-demo.tsx</text>
        </box>
      </box>
    </box>
  )
}

function App(props: { transmissionMode: string }) {
  const [debugLine, setDebugLine] = createSignal("ready")
  const ms = useMouse()

  if (samples.length === 0) return <SupportFallback />

  const raw = () => ms.mouse()

  return (
    <box width="100%" height="100%" backgroundColor={0x050507ff} padding={space[4]} gap={space[4]}>
      <box gap={space[1]}>
        <text color={0xf3ede2ff} fontSize={18}>Procedural Nebula Demo</text>
        <text color={0x9b9387ff} fontSize={11}>Inspector visual para la primitive reusable del engine. Arrastrá dentro de cada preview para pan. `d` toggle debug. `q` para salir.</text>
        <text color={0xc6bcaeff} fontSize={10}>{`Kitty transmission: ${props.transmissionMode}`}</text>
        {debugEnabled() ? <text color={0x7fa6d8ff} fontSize={10}>{`rawPointer cells: (${ms.pos().x}, ${ms.pos().y}) action:${raw()?.action ?? "none"} button:${raw()?.button ?? -1}`}</text> : null}
        {debugEnabled() ? <text color={0xf3bf6bff} fontSize={10}>{debugLine()}</text> : null}
      </box>

      <Preview sample={samples[0]} width={980} height={360} onDebug={setDebugLine} />

      <box direction="row" gap={space[3]}>
        <Preview sample={samples[1]} width={320} height={180} onDebug={setDebugLine} />
        <Preview sample={samples[2]} width={320} height={180} onDebug={setDebugLine} />
        <Preview sample={samples[3]} width={320} height={180} onDebug={setDebugLine} />
      </box>
    </box>
  )
}

async function main() {
  buildSamples()
  const term = await createTerminal()
  const cleanup = mount(() => <App transmissionMode={term.caps.transmissionMode} />, term)

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
      parser.destroy()
      cleanup.destroy()
      term.destroy()
      process.exit(0)
    }
    if (event.type === "key" && event.key === "d") {
      setDebugEnabled((v) => !v)
      markDirty()
    }
  })

  term.onData((data) => parser.feed(data))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
