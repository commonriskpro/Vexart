/**
 * SceneCanvas Test — declarative scene graph demo.
 *
 * Run: bun --conditions=browser run examples/scene-test.tsx
 */

import { createSignal } from "solid-js"
import { mount, markDirty } from "@tge/renderer-solid"
import { createTerminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { SceneCanvas, SceneNode, SceneEdge, SceneParticles, SceneOverlay } from "@tge/components"
import { For } from "solid-js"
import type { CanvasContext } from "@tge/renderer-solid"

// ── Data ──

type NodeData = {
  id: string; label: string; sublabel?: string
  x: number; y: number; radius: number
  fill: number; stroke: number; glowColor: number
  shape: "hexagon" | "diamond" | "octagon" | "circle"
  status: "active" | "idle"
}

const initialNodes: NodeData[] = [
  { id: "core", label: "Core", x: 500, y: 350, radius: 55, fill: 0x2a1a10ff, stroke: 0xf0a050ff, glowColor: 0xf0a05080, shape: "diamond", status: "active" },
  { id: "shaders", label: "Shaders", sublabel: "3 files", x: 280, y: 200, radius: 46, fill: 0x141430ff, stroke: 0x56d4c8ff, glowColor: 0x56d4c860, shape: "hexagon", status: "idle" },
  { id: "memory", label: "Memory", sublabel: "12 items", x: 720, y: 230, radius: 48, fill: 0x141430ff, stroke: 0x56d4c8ff, glowColor: 0x56d4c860, shape: "hexagon", status: "idle" },
  { id: "pipeline", label: "Pipeline", sublabel: "8 stages", x: 730, y: 490, radius: 46, fill: 0x141430ff, stroke: 0x56d4c8ff, glowColor: 0x56d4c860, shape: "hexagon", status: "idle" },
  { id: "camera", label: "Camera", sublabel: "matrix", x: 260, y: 500, radius: 44, fill: 0x141430ff, stroke: 0x56d4c8ff, glowColor: 0x56d4c860, shape: "hexagon", status: "idle" },
  { id: "tests", label: "Tests", sublabel: "24 passed", x: 500, y: 600, radius: 42, fill: 0x141430ff, stroke: 0x22c55eff, glowColor: 0x22c55e50, shape: "hexagon", status: "idle" },
]

const edgeData = [
  { id: "e1", from: "core", to: "shaders", color: 0xf0a05040 },
  { id: "e2", from: "core", to: "memory", color: 0xf0a05040 },
  { id: "e3", from: "core", to: "pipeline", color: 0xf0a05035 },
  { id: "e4", from: "core", to: "camera", color: 0xf0a05035 },
  { id: "e5", from: "core", to: "tests", color: 0xf0a05028 },
  { id: "e6", from: "shaders", to: "memory", color: 0x56d4c820 },
]

function App() {
  // Reactive node positions
  const [positions, setPositions] = createSignal(
    Object.fromEntries(initialNodes.map(n => [n.id, { x: n.x, y: n.y }]))
  )
  const [selected, setSelected] = createSignal("core")
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, zoom: 1 })

  function getPos(id: string) {
    return () => positions()[id] ?? { x: 0, y: 0 }
  }

  function handleDrag(id: string, x: number, y: number) {
    setPositions(prev => ({ ...prev, [id]: { x, y } }))
    markDirty()
  }

  return (
    <box width="grow" height="grow" backgroundColor={0x080812ff}>
      {/* Header */}
      <box direction="row" padding={8} gap={10} alignY="center" backgroundColor={0x111122ff}>
        <text color={0xffffffff} fontSize={16} fontWeight={700}>SceneCanvas Demo</text>
        <text color={0x888888ff} fontSize={12}>{`selected: ${selected()}`}</text>
        <text color={0x666666ff} fontSize={11}>drag nodes • pan empty space</text>
      </box>

      {/* Scene */}
      <SceneCanvas
        viewport={viewport()}
        onViewportChange={setViewport}
        background={(ctx: CanvasContext) => {
          // Deep space background
          ctx.rect(-200, -200, 1400, 1000, { fill: 0x050510ff })
          // Nebula tint
          ctx.radialGradient(500, 350, 400, 0x1a0a3018, 0x00000000)
          ctx.glow(500, 350, 200, 200, 0x1a0a2020, 15)
        }}
      >
        {/* Particles */}
        <SceneParticles
          id="stars"
          config={{
            count: 150,
            bounds: { x: -100, y: -100, w: 1200, h: 900 },
            radius: { min: 0.3, max: 1.5 },
            speed: { min: 0.3, max: 2 },
            color: 0xffffffff,
            alpha: { min: 15, max: 100 },
            lifetime: { min: 5, max: 12 },
            twinkle: true, twinkleSpeed: 1,
            glow: true, glowRadius: 2, glowIntensity: 15,
            drift: { dx: 0.1, dy: -0.05 },
          }}
        />

        {/* Edges */}
        <For each={edgeData}>
          {(e) => (
            <SceneEdge
              id={e.id}
              from={getPos(e.from)}
              to={getPos(e.to)}
              color={e.color}
              glow
            />
          )}
        </For>

        {/* Nodes */}
        <For each={initialNodes}>
          {(n) => (
            <SceneNode
              id={n.id}
              x={() => positions()[n.id]?.x ?? n.x}
              y={() => positions()[n.id]?.y ?? n.y}
              radius={n.radius}
              shape={n.shape}
              fill={n.fill}
              stroke={n.stroke}
              glow={{ color: n.glowColor, radius: 25, intensity: 50 }}
              selected={() => selected() === n.id}
              label={n.label}
              sublabel={n.sublabel}
              statusDot={n.status === "active" ? { color: 0x22c55eff, glow: true } : undefined}
              onSelect={() => { setSelected(n.id); markDirty() }}
              onDrag={(x, y) => handleDrag(n.id, x, y)}
            />
          )}
        </For>

        {/* Tooltip overlay */}
        <SceneOverlay
          id="tooltip"
          dependsOn={() => [selected()]}
          bounds={(scene) => {
            const sel = selected()
            const pos = scene.getNodePosition(sel)
            const node = initialNodes.find(n => n.id === sel)
            if (!pos || !node) return null
            return { x: pos.x - 80, y: pos.y + node.radius + 15, width: 160, height: 28 }
          }}
          draw={(ctx: CanvasContext, scene) => {
            const sel = selected()
            const pos = scene.getNodePosition(sel)
            if (!pos) return
            const node = initialNodes.find(n => n.id === sel)
            if (!node) return
            const tw = 160, th = 28
            const tx = pos.x - tw / 2, ty = pos.y + node.radius + 15
            ctx.rect(tx + 2, ty + 2, tw, th, { fill: 0x00000040, radius: 6 })
            ctx.rect(tx, ty, tw, th, { fill: 0x1a1a30ee, radius: 6, stroke: 0xffffff15, strokeWidth: 1 })
            ctx.text(tx + 10, ty + 8, `${node.label}${node.sublabel ? ` — ${node.sublabel}` : ""}`, 0xeeeeeeff)
          }}
        />
      </SceneCanvas>
    </box>
  )
}

// ── Bootstrap ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App />, term)

  const parser = createParser((event) => {
    if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) {
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
