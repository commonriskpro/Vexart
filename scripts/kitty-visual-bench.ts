/**
 * Visual end-to-end benchmark for Kitty graphics transport.
 *
 * Controls:
 *   q / Ctrl+C  exit
 *   m / space   toggle file <-> direct
 *   f           force file mode
 *   d           force direct mode
 *
 * Run inside Kitty:
 *   bun scripts/kitty-visual-bench.ts
 */

import { createTerminal } from "@vexart/engine"
import { kitty, type TransmissionMode } from "@vexart/engine"
import { createParser } from "@vexart/engine"

type VisualStats = {
  avgFrameMs: number
  fps: number
  frame: number
  maxFrameMs: number
  minFrameMs: number
}

const MODE = {
  DIRECT: "direct",
  FILE: "file",
} as const

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildBuffer(width: number, height: number, t: number) {
  const data = new Uint8Array(width * height * 4)
  const cx = width * (0.5 + 0.25 * Math.cos(t * 0.0011))
  const cy = height * (0.5 + 0.25 * Math.sin(t * 0.0017))
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.0023)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const glow = Math.max(0, 1 - dist / (Math.min(width, height) * 0.38))
      const wave = 0.5 + 0.5 * Math.sin((x * 0.018) + (y * 0.012) + t * 0.003)
      const grid = ((x >> 4) ^ (y >> 4)) & 1

      const r = clamp(Math.round(18 + 50 * glow + 90 * wave * pulse), 0, 255)
      const g = clamp(Math.round(12 + 120 * glow + 60 * (1 - wave)), 0, 255)
      const b = clamp(Math.round(28 + 140 * glow + grid * 24 + 40 * pulse), 0, 255)

      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 0xff
    }
  }

  return {
    data,
    height,
    stride: width * 4,
    width,
  }
}

function formatStats(mode: TransmissionMode, transport: TransmissionMode, stats: VisualStats, width: number, height: number) {
  return [
    `TGE Kitty Visual Bench`,
    `mode=${mode} auto-detected=${transport} surface=${width}x${height}`,
    `fps=${stats.fps.toFixed(1)} frameMs(avg/min/max)=${stats.avgFrameMs.toFixed(2)}/${stats.minFrameMs.toFixed(2)}/${stats.maxFrameMs.toFixed(2)} frame=${stats.frame}`,
    `controls: [m|space] toggle  [f] file  [d] direct  [q] quit`,
  ]
}

async function main() {
  const term = await createTerminal()

  if (!term.caps.kittyGraphics) {
    term.destroy()
    throw new Error("This visual benchmark requires Kitty graphics support")
  }

  const imageRow = 5
  const imageCol = 0
  const imageWidth = Math.max(64, Math.floor((term.size.pixelWidth || term.size.cols * 8) * 0.9))
  const imageHeight = Math.max(64, Math.floor((term.size.pixelHeight || term.size.rows * 16) * 0.72))
  let mode: TransmissionMode = term.caps.transmissionMode === MODE.DIRECT ? MODE.DIRECT : MODE.FILE
  let running = true
  let imageId = 1
  let previousId = 0
  let stats: VisualStats = {
    avgFrameMs: 0,
    fps: 0,
    frame: 0,
    maxFrameMs: 0,
    minFrameMs: 0,
  }
  const frameTimes: number[] = []
  const fpsWindow: number[] = []

  const parser = createParser((event) => {
    if (event.type !== "key") return
    if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
      running = false
      return
    }
    if (event.key === "m" || event.key === "space") {
      mode = mode === MODE.FILE ? MODE.DIRECT : MODE.FILE
      return
    }
    if (event.key === "f") {
      mode = MODE.FILE
      return
    }
    if (event.key === "d") {
      mode = MODE.DIRECT
    }
  })

  const unsub = term.onData((data) => parser.feed(data))

  function drawOverlay() {
    const lines = formatStats(mode, term.caps.transmissionMode, stats, imageWidth, imageHeight)
    term.rawWrite("\x1b[H")
    term.rawWrite("\x1b[2J")
    for (let i = 0; i < lines.length; i++) {
      term.rawWrite(`\x1b[${i + 1};1H\x1b[97m${lines[i]}\x1b[0m`)
    }
  }

  function updateStats(frameMs: number, now: number) {
    frameTimes.push(frameMs)
    if (frameTimes.length > 120) frameTimes.shift()
    fpsWindow.push(now)
    while (fpsWindow.length > 0 && now - fpsWindow[0] > 1000) fpsWindow.shift()

    const total = frameTimes.reduce((sum, value) => sum + value, 0)
    const minFrameMs = frameTimes.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY)
    const maxFrameMs = frameTimes.reduce((max, value) => Math.max(max, value), 0)
    stats = {
      avgFrameMs: total / frameTimes.length,
      fps: fpsWindow.length,
      frame: stats.frame + 1,
      maxFrameMs,
      minFrameMs: Number.isFinite(minFrameMs) ? minFrameMs : frameMs,
    }
  }

  try {
    while (running) {
      const started = performance.now()
      const buf = buildBuffer(imageWidth, imageHeight, started)
      const nextId = imageId === 1 ? 2 : 1

      term.beginSync()
      drawOverlay()
      term.rawWrite(`\x1b[${imageRow + 1};${imageCol + 1}H`)
      kitty.transmit(term.write, buf, nextId, {
        action: "T",
        compress: "auto",
        mode,
      })
      if (previousId !== 0) {
        kitty.remove(term.write, previousId)
      }
      term.endSync()

      previousId = nextId
      imageId = nextId

      const frameMs = performance.now() - started
      updateStats(frameMs, performance.now())

      const sleepMs = Math.max(0, 16 - frameMs)
      if (sleepMs > 0) {
        await Bun.sleep(sleepMs)
      }
    }
  } finally {
    unsub()
    parser.destroy()
    kitty.clearAll(term.write)
    term.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
