/**
 * render-loop.ts — Standalone headless benchmark for the Vexart render loop.
 *
 * Measures the complete CPU render pipeline across a synthetic scene graph
 * of ~500 nodes (box and text nodes with rich styling):
 *   1. Scene graph traversal (walkTree)
 *   2. Layout computation (Flexily layout adapter)
 *   3. Layout writeback (coordinates & geometry)
 *   4. Layer assignment & spatial clustering
 *   5. Render command aggregation & render graph generation (buildRenderGraphFrame)
 *   6. Memory allocation and GC pressure tracking
 *
 * Usage:
 *   bun run benchmarks/render-loop.ts
 *   bun run benchmarks/render-loop.ts --frames=500 --nodes=500
 */

import type { Terminal } from "@vexart/engine"
import {
  createNode,
  createTextNode,
  insertChild,
  setProp,
  createRenderLoop,
  markDirty,
  type TGENode,
} from "@vexart/engine/internal"
import type { RendererBackend } from "@vexart/engine/internal"

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let frames = 1000
  let nodes = 500
  let warmup = 5

  for (const arg of args) {
    if (arg.startsWith("--frames=")) {
      const parsed = parseInt(arg.slice("--frames=".length), 10)
      if (!isNaN(parsed) && parsed > 0) frames = parsed
    } else if (arg.startsWith("--nodes=")) {
      const parsed = parseInt(arg.slice("--nodes=".length), 10)
      if (!isNaN(parsed) && parsed > 0) nodes = parsed
    } else if (arg.startsWith("--warmup=")) {
      const parsed = parseInt(arg.slice("--warmup=".length), 10)
      if (!isNaN(parsed) && parsed >= 0) warmup = parsed
    }
  }

  return { frames, nodes, warmup }
}

// ── Mock terminal (headless, zero I/O) ────────────────────────────────────────

function createMockTerminal(width = 1280, height = 960): Terminal {
  const noop = () => {}
  const cellWidth = 8
  const cellHeight = 16
  return {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      mousePixel: false,
      mousePixelOrigin: 1,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct" as const,
    },
    size: {
      cols: Math.ceil(width / cellWidth),
      rows: Math.ceil(height / cellHeight),
      pixelWidth: width,
      pixelHeight: height,
      cellWidth,
      cellHeight,
    },
    write: noop,
    rawWrite: noop,
    writeBytes: noop,
    beginSync: noop,
    endSync: noop,
    onResize: () => noop,
    onData: () => noop,
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: noop,
    writeClipboard: noop,
    suspend: noop,
    resume: noop,
    destroy: noop,
  }
}

// ── Headless renderer backend ────────────────────────────────────────────────

function createHeadlessBackend(): RendererBackend {
  return {
    name: "headless-benchmark",
    beginFrame: () => ({ strategy: null }),
    paint: () => ({ output: "skip-present" as const, strategy: null }),
    reuseLayer: () => false,
    endFrame: () => ({ output: "none" as const, strategy: null }),
    destroy: () => {},
  }
}

// ── Scene graph builder helpers ──────────────────────────────────────────────

function countTreeNodes(node: TGENode): number {
  let count = 1
  for (const child of node.children) {
    count += countTreeNodes(child)
  }
  return count
}

function createBox(props: Record<string, unknown> = {}): TGENode {
  const node = createNode("box")
  for (const [k, v] of Object.entries(props)) {
    setProp(node, k, v)
  }
  return node
}

function createText(content: string, props: Record<string, unknown> = {}): TGENode {
  const container = createNode("text")
  for (const [k, v] of Object.entries(props)) {
    setProp(container, k, v)
  }
  const textChild = createTextNode(content)
  insertChild(container, textChild)
  return container
}

export interface SyntheticScene {
  root: TGENode
  nodeCount: number
  dynamicNodes: Array<{ container: TGENode; textChild: TGENode }>
}

export function buildSyntheticScene(targetNodes = 500): SyntheticScene {
  const dynamicNodes: Array<{ container: TGENode; textChild: TGENode }> = []

  const root = createBox({
    width: 1280,
    height: 960,
    direction: "column",
    gap: 12,
    padding: 16,
    backgroundColor: 0x0c0e14ff,
  })

  // Header bar (~15 nodes)
  const header = createBox({
    direction: "row",
    height: 48,
    padding: 10,
    gap: 12,
    alignY: "center",
    backgroundColor: 0x161922ff,
    cornerRadius: 8,
    border: { width: 1, color: 0x252b3bff },
  })
  insertChild(root, header)

  const logo = createBox({ width: 28, height: 28, backgroundColor: 0x6366f1ff, cornerRadius: 6 })
  insertChild(header, logo)

  const title = createText("Vexart Performance Benchmark Dashboard", { color: 0xffffffff, fontSize: 15 })
  insertChild(header, title)

  const badge = createBox({
    padding: 4,
    cornerRadius: 4,
    backgroundColor: 0x10b98120,
    border: { width: 1, color: 0x10b98166 },
  })
  insertChild(badge, createText("v0.11.0-beta", { color: 0x34d399ff, fontSize: 11 }))
  insertChild(header, badge)

  // Main split container (sidebar + content)
  const main = createBox({
    direction: "row",
    gap: 12,
    width: "grow",
    height: "grow",
  })
  insertChild(root, main)

  // Sidebar navigation panel (~35 nodes)
  const sidebar = createBox({
    direction: "column",
    width: 220,
    gap: 8,
    padding: 12,
    backgroundColor: 0x12151dff,
    cornerRadius: 8,
    border: { width: 1, color: 0x252b3bff },
  })
  insertChild(main, sidebar)

  insertChild(sidebar, createText("NAVIGATION", { color: 0x64748bff, fontSize: 11 }))

  const navLabels = ["Overview", "Workloads", "Clusters", "Storage", "Network", "Security", "Telemetry", "Settings"]
  for (let i = 0; i < navLabels.length; i++) {
    const item = createBox({
      direction: "row",
      gap: 10,
      padding: 8,
      alignY: "center",
      cornerRadius: 6,
      backgroundColor: i === 0 ? 0x252b3bff : 0x00000000,
    })
    const dot = createBox({
      width: 12,
      height: 12,
      cornerRadius: 3,
      backgroundColor: i === 0 ? 0x6366f1ff : 0x475569ff,
    })
    insertChild(item, dot)
    insertChild(item, createText(navLabels[i], { color: i === 0 ? 0xffffffff : 0x94a3b8ff, fontSize: 12 }))
    insertChild(sidebar, item)
  }

  // Content column
  const content = createBox({
    direction: "column",
    gap: 12,
    width: "grow",
    height: "grow",
  })
  insertChild(main, content)

  // Metrics summary row (4 stat cards)
  const statsRow = createBox({ direction: "row", gap: 12, height: 90 })
  insertChild(content, statsRow)

  const statColors = [0x38bdf8ff, 0x818cf8ff, 0x34d399ff, 0xfbbf24ff]
  for (let i = 0; i < 4; i++) {
    const card = createBox({
      direction: "column",
      gap: 6,
      padding: 12,
      width: "grow",
      backgroundColor: 0x161922ff,
      cornerRadius: 8,
      border: { width: 1, color: 0x252b3bff },
      shadow: { x: 0, y: 2, blur: 6, color: 0x00000033 },
    })
    insertChild(card, createText(`Metric ${i + 1}`, { color: 0x94a3b8ff, fontSize: 11 }))
    const valText = createText(`${(i + 1) * 128}.4 MB/s`, { color: statColors[i], fontSize: 16 })
    dynamicNodes.push({ container: valText, textChild: valText.children[0] })
    insertChild(card, valText)
    insertChild(statsRow, card)
  }

  // Data table container
  const table = createBox({
    direction: "column",
    gap: 4,
    padding: 10,
    backgroundColor: 0x12151dff,
    cornerRadius: 8,
    border: { width: 1, color: 0x252b3bff },
    width: "grow",
    height: "grow",
  })
  insertChild(content, table)

  // Table header row
  const tableHeader = createBox({
    direction: "row",
    gap: 8,
    padding: 6,
    backgroundColor: 0x1a1e2bff,
    cornerRadius: 4,
  })
  insertChild(table, tableHeader)
  const columns = ["Status", "Instance", "Region", "Latency", "Throughput", "Uptime"]
  for (const col of columns) {
    insertChild(tableHeader, createText(col, { color: 0x64748bff, fontSize: 11, width: "grow" }))
  }

  // Fill table rows dynamically until exact targetNodes count is reached
  let currentCount = countTreeNodes(root)
  let rowIndex = 0
  while (currentCount < targetNodes) {
    const needed = targetNodes - currentCount
    if (needed >= 14) {
      const row = createBox({
        direction: "row",
        gap: 8,
        padding: 6,
        alignY: "center",
        backgroundColor: rowIndex % 2 === 0 ? 0x16192288 : 0x00000000,
        cornerRadius: 4,
      })
      const statusDot = createBox({
        width: 8,
        height: 8,
        cornerRadius: 4,
        backgroundColor: rowIndex % 3 === 0 ? 0x10b981ff : 0x38bdf8ff,
      })
      insertChild(row, statusDot)
      insertChild(row, createText(`srv-${rowIndex + 100}`, { color: 0xf1f5f9ff, fontSize: 11, width: "grow" }))
      insertChild(row, createText(rowIndex % 2 === 0 ? "us-east" : "eu-west", { color: 0x94a3b8ff, fontSize: 11, width: "grow" }))
      const latencyNode = createText(`${(rowIndex * 3.7 + 1.2).toFixed(1)}ms`, {
        color: 0x34d399ff,
        fontSize: 11,
        width: "grow",
      })
      dynamicNodes.push({ container: latencyNode, textChild: latencyNode.children[0] })
      insertChild(row, latencyNode)
      insertChild(row, createText(`${rowIndex * 14 + 120} req/s`, { color: 0x94a3b8ff, fontSize: 11, width: "grow" }))
      insertChild(row, createText(`99.${90 + (rowIndex % 10)}%`, { color: 0x38bdf8ff, fontSize: 11, width: "grow" }))
      insertChild(table, row)
      rowIndex++
      currentCount = countTreeNodes(root)
    } else if (needed >= 2) {
      insertChild(table, createText(`Extra item ${needed}`, { color: 0x64748bff, fontSize: 10 }))
      currentCount = countTreeNodes(root)
    } else {
      insertChild(table, createBox({ height: 1 }))
      currentCount = countTreeNodes(root)
    }
  }

  return { root, nodeCount: countTreeNodes(root), dynamicNodes }
}

// ── Main Benchmark Runner ────────────────────────────────────────────────────

export function runBenchmark() {
  const { frames, nodes: targetNodes, warmup } = parseArgs()

  const term = createMockTerminal(1280, 960)
  const backend = createHeadlessBackend()
  const loop = createRenderLoop(term, {
    backend,
    experimental: {
      forceLayerRepaint: true,
      nativePresentation: false,
      nativeLayerRegistry: false,
    },
  })

  const scene = buildSyntheticScene(targetNodes)
  insertChild(loop.root, scene.root)

  // Warmup frames to prime JIT, layout structures, and text metrics
  for (let w = 0; w < warmup; w++) {
    markDirty()
    loop.frame()
  }

  // Memory before benchmark
  const memBefore = process.memoryUsage()

  const frameTimes: number[] = new Array(frames)
  const startWall = performance.now()

  for (let i = 0; i < frames; i++) {
    // Simulate reactive UI property update on a dynamic node
    const dyn = scene.dynamicNodes[i % scene.dynamicNodes.length]
    if (dyn && dyn.textChild) {
      dyn.textChild.text = `${(100 + (i % 100) * 1.5).toFixed(1)} MB/s`
    }
    markDirty()

    const t0 = performance.now()
    loop.frame()
    const t1 = performance.now()
    frameTimes[i] = t1 - t0
  }

  const wallTimeSec = (performance.now() - startWall) / 1000
  const memAfter = process.memoryUsage()

  const sumMs = frameTimes.reduce((acc, val) => acc + val, 0)
  const avgMs = sumMs / frames

  frameTimes.sort((a, b) => a - b)
  const p95Index = Math.min(Math.floor(frames * 0.95), frames - 1)
  const p95Ms = frameTimes[p95Index]
  const fps = Math.round(frames / wallTimeSec)

  const heapGrowthBytes = Math.max(0, memAfter.heapUsed - memBefore.heapUsed)
  const heapGrowthPerFrameKb = heapGrowthBytes / 1024 / frames

  const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

  console.log("=== Vexart Render Loop Benchmark ===")
  console.log(`Nodes: ${scene.nodeCount}`)
  console.log(`Frames: ${frames}`)
  console.log("")
  console.log(`Wall time:        ${wallTimeSec.toFixed(3)} s`)
  console.log(`Avg frame time:   ${avgMs.toFixed(2)} ms`)
  console.log(`P95 frame time:   ${p95Ms.toFixed(2)} ms`)
  console.log(`FPS (sustained):  ${fps}`)
  console.log("")
  console.log(`Memory (before):  ${toMb(memBefore.heapUsed)} MB heap / ${toMb(memBefore.rss)} MB RSS`)
  console.log(`Memory (after):   ${toMb(memAfter.heapUsed)} MB heap / ${toMb(memAfter.rss)} MB RSS`)
  console.log(`Heap growth/frame: ${heapGrowthPerFrameKb.toFixed(1)} KB`)

  loop.destroy()
}

runBenchmark()
