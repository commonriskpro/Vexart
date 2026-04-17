/**
 * Benchmark TGE Kitty transport cost on the client side.
 *
 * Measures the real production `kitty.transmit()` path for:
 *   - file  → persistent mmap-backed `t=f,S,O`
 *   - direct → chunked base64 `t=d`
 *
 * This benchmark measures:
 *   - encode/copy time per frame on the client
 *   - bytes emitted to the terminal writer per frame
 *
 * Usage:
 *   bun scripts/kitty-transport-bench.ts
 *   TGE_BENCH_W=640 TGE_BENCH_H=360 TGE_BENCH_FRAMES=60 bun scripts/kitty-transport-bench.ts
 */

import { transmit, type TransmissionMode } from "@vexart/engine"

type BenchResult = {
  avgMs: number
  bytesPerFrame: number
  compress: boolean
  frames: number
  maxMs: number
  medianMs: number
  minMs: number
  mode: TransmissionMode
}

const MODE = {
  DIRECT: "direct",
  FILE: "file",
} as const

function buildBuffer(width: number, height: number) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = (x * 255) / Math.max(1, width - 1)
      data[i + 1] = (y * 255) / Math.max(1, height - 1)
      data[i + 2] = ((x ^ y) * 31) & 0xff
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

function summarize(mode: TransmissionMode, times: number[], totalBytes: number): BenchResult {
  const sorted = [...times].sort((a, b) => a - b)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  return {
    avgMs: total / sorted.length,
    bytesPerFrame: Math.round(totalBytes / sorted.length),
    compress: false,
    frames: sorted.length,
    maxMs: sorted[sorted.length - 1],
    medianMs: sorted[Math.floor(sorted.length / 2)],
    minMs: sorted[0],
    mode,
  }
}

function runMode(mode: TransmissionMode, width: number, height: number, frames: number, compress: boolean) {
  const buf = buildBuffer(width, height)
  const times: number[] = []
  let totalBytes = 0

  for (let frame = 0; frame < frames; frame++) {
    const id = mode === MODE.FILE ? 1000 + frame : 2000 + frame
    let frameBytes = 0
    const write = (chunk: string) => {
      frameBytes += Buffer.byteLength(chunk)
    }
    const started = performance.now()
    transmit(write, buf, id, {
      action: "T",
      compress,
      mode,
    })
    times.push(performance.now() - started)
    totalBytes += frameBytes
  }

  const result = summarize(mode, times, totalBytes)
  result.compress = compress
  return result
}

function main() {
  const width = Number(process.env.TGE_BENCH_W ?? 640)
  const height = Number(process.env.TGE_BENCH_H ?? 360)
  const frames = Number(process.env.TGE_BENCH_FRAMES ?? 60)

  console.error("[kitty-transport-bench] config", {
    frames,
    height,
    width,
  })

  const results = [
    runMode(MODE.FILE, width, height, frames, false),
    runMode(MODE.FILE, width, height, frames, true),
    runMode(MODE.DIRECT, width, height, frames, false),
    runMode(MODE.DIRECT, width, height, frames, true),
  ]

  console.table(results.map((result) => ({
    mode: result.mode,
    compress: result.compress ? "zlib" : "raw",
    frames: result.frames,
    bytesPerFrame: result.bytesPerFrame,
    minMs: result.minMs.toFixed(3),
    medianMs: result.medianMs.toFixed(3),
    avgMs: result.avgMs.toFixed(3),
    maxMs: result.maxMs.toFixed(3),
  })))
}

main()
