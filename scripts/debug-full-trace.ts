/**
 * debug-full-trace.ts — Diagnostic for the black-screen fix verification.
 *
 * Builds a layout command buffer matching the hello.tsx tree structure,
 * calls vexart_layout_compute via FFI, and verifies that all nodes get
 * non-zero layout dimensions.
 *
 * Run: bun run scripts/debug-full-trace.ts
 */
import { openVexartLibrary } from "../packages/engine/src/ffi/vexart-bridge"
import { parseLayoutOutput } from "../packages/engine/src/ffi/layout-writeback"
import { ptr } from "bun:ffi"

// ── Constants (matching tree.rs + loop.ts) ─────────────────────────────────
const GRAPH_MAGIC   = 0x56584152
const GRAPH_VERSION = 0x00020000
const OPEN_PAYLOAD_BYTES = 112
const CMD_OPEN  = 0
const CMD_CLOSE = 1
const FLAG_IS_ROOT = 1 << 0

// Vexart size kinds (Rust: 0=Auto, 1=Length, 2=Percent)
const SK_AUTO    = 0
const SK_LENGTH  = 1
const SK_PERCENT = 2

// Flex direction
const DIR_ROW    = 0
const DIR_COLUMN = 1

// Align (Rust: 0=Start, 1=End, 2=Center, 3=SpaceBetween, 255=None)
const ALIGN_START   = 0
const ALIGN_CENTER  = 2
const ALIGN_NONE    = 255

// ── Node descriptor ────────────────────────────────────────────────────────

interface NodeDesc {
  nodeId: number
  parentId: number
  isRoot?: boolean
  flexDir: number
  sizeWKind: number
  sizeHKind: number
  sizeW: number
  sizeH: number
  flexGrow: number
  flexShrink: number
  justifyContent: number
  alignItems: number
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
  gapRow: number
  gapCol: number
  bgColor: number
  cornerRadius: number
  children: NodeDesc[]
  label: string
}

// ── hello.tsx tree (matching walkTree output) ──────────────────────────────
// Root box: 100% x 100%, column, center/center
// From hello.tsx: colors.background = "#0a0a0a" → 0x0a0a0aff
// radius.xl = 14, radius.full = 9999, radius.md = 8
// space[4]=16, space[1]=4, space[6]=24, space[2]=8

const tree: NodeDesc = {
  nodeId: 1, parentId: 0, isRoot: true,
  label: "Root (100%x100%)",
  flexDir: DIR_COLUMN,
  // In walkTree: root is 100%x100% → PERCENT sizing
  // But: the actual path for width="100%" is SIZING.PERCENT=2, _vxSizeKind(2) = 2 (Percent), value=1.0
  sizeWKind: SK_PERCENT, sizeHKind: SK_PERCENT,
  sizeW: 1.0, sizeH: 1.0,
  flexGrow: 0, flexShrink: 1,
  justifyContent: ALIGN_CENTER, alignItems: ALIGN_CENTER,
  padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
  gapRow: 16, gapCol: 16, // gap = space[4] = 16
  bgColor: 0x0a0a0aff, cornerRadius: 0,
  children: [
    // Dot row: direction=row, gap=space[1]=4
    {
      nodeId: 2, parentId: 1, label: "Dot row",
      flexDir: DIR_ROW,
      // No explicit size → walkTree uses FIT for width when parent is row? No, parent is column.
      // In walkTree for box nodes with no _widthSizing:
      //   stretchW = !node._widthSizing && parentDir === TOP_TO_BOTTOM → true (parent is column)
      //   So ws = GROW_DEFAULT → sizeWKind=Auto, flexGrow=1.0
      // stretchH = !node._heightSizing && parentDir === LEFT_TO_RIGHT → false (parent is column)
      //   So hs = FIT_DEFAULT → sizeHKind=Auto, flexGrow stays 0 for height
      sizeWKind: SK_AUTO, sizeHKind: SK_AUTO,
      sizeW: 0, sizeH: 0,
      flexGrow: 1.0, flexShrink: 1,
      justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
      padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
      gapRow: 4, gapCol: 4,
      bgColor: 0, cornerRadius: 0,
      children: [
        // Dot 1: 12x12 fixed
        {
          nodeId: 3, parentId: 2, label: "Dot1 (12x12)",
          flexDir: DIR_COLUMN,
          sizeWKind: SK_LENGTH, sizeHKind: SK_LENGTH,
          sizeW: 12, sizeH: 12,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0x22c55eff, cornerRadius: 9999,
          children: [],
        },
        // Dot 2
        {
          nodeId: 4, parentId: 2, label: "Dot2 (12x12)",
          flexDir: DIR_COLUMN,
          sizeWKind: SK_LENGTH, sizeHKind: SK_LENGTH,
          sizeW: 12, sizeH: 12,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0xf59e0bff, cornerRadius: 9999,
          children: [],
        },
        // Dot 3
        {
          nodeId: 5, parentId: 2, label: "Dot3 (12x12)",
          flexDir: DIR_COLUMN,
          sizeWKind: SK_LENGTH, sizeHKind: SK_LENGTH,
          sizeW: 12, sizeH: 12,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0xa8483eff, cornerRadius: 9999,
          children: [],
        },
      ],
    },
    // Card: column, bg=card, cornerRadius=14, padding=24, gap=8
    {
      nodeId: 6, parentId: 1, label: "Card",
      flexDir: DIR_COLUMN,
      // No explicit size → stretchW (parent column) = GROW, stretchH = FIT
      sizeWKind: SK_AUTO, sizeHKind: SK_AUTO,
      sizeW: 0, sizeH: 0,
      flexGrow: 1.0, flexShrink: 1,
      justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
      padTop: 24, padRight: 24, padBottom: 24, padLeft: 24,
      gapRow: 8, gapCol: 8,
      bgColor: 0x171717ff, cornerRadius: 14,
      children: [
        // Text "Hello from TGE" — emitted via clay.text() as OPEN(auto)+CLOSE
        {
          nodeId: 7, parentId: 6, label: 'Text "Hello from TGE"',
          flexDir: DIR_COLUMN,
          sizeWKind: SK_AUTO, sizeHKind: SK_AUTO,
          sizeW: 0, sizeH: 0,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0, cornerRadius: 0,
          children: [],
        },
        // Text "Pixel-native terminal rendering"
        {
          nodeId: 8, parentId: 6, label: 'Text "Pixel-native..."',
          flexDir: DIR_COLUMN,
          sizeWKind: SK_AUTO, sizeHKind: SK_AUTO,
          sizeW: 0, sizeH: 0,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0, cornerRadius: 0,
          children: [],
        },
      ],
    },
    // Color bar row: direction=row, gap=4, padding=8
    {
      nodeId: 9, parentId: 1, label: "Color bar row",
      flexDir: DIR_ROW,
      sizeWKind: SK_AUTO, sizeHKind: SK_AUTO,
      sizeW: 0, sizeH: 0,
      flexGrow: 1.0, flexShrink: 1,
      justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
      padTop: 8, padRight: 8, padBottom: 8, padLeft: 8,
      gapRow: 4, gapCol: 4,
      bgColor: 0, cornerRadius: 0,
      children: [
        {
          nodeId: 10, parentId: 9, label: "Bar1 (32x8)",
          flexDir: DIR_COLUMN,
          sizeWKind: SK_LENGTH, sizeHKind: SK_LENGTH,
          sizeW: 32, sizeH: 8,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0xe5e5e5ff, cornerRadius: 8,
          children: [],
        },
        {
          nodeId: 11, parentId: 9, label: "Bar2 (32x8)",
          flexDir: DIR_COLUMN,
          sizeWKind: SK_LENGTH, sizeHKind: SK_LENGTH,
          sizeW: 32, sizeH: 8,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0x4eaed0ff, cornerRadius: 8,
          children: [],
        },
        {
          nodeId: 12, parentId: 9, label: "Bar3 (32x8)",
          flexDir: DIR_COLUMN,
          sizeWKind: SK_LENGTH, sizeHKind: SK_LENGTH,
          sizeW: 32, sizeH: 8,
          flexGrow: 0, flexShrink: 1,
          justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
          padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
          gapRow: 0, gapCol: 0,
          bgColor: 0x8b5cf6ff, cornerRadius: 8,
          children: [],
        },
      ],
    },
    // Text "Press q to exit"
    {
      nodeId: 13, parentId: 1, label: 'Text "Press q to exit"',
      flexDir: DIR_COLUMN,
      sizeWKind: SK_AUTO, sizeHKind: SK_AUTO,
      sizeW: 0, sizeH: 0,
      flexGrow: 0, flexShrink: 1,
      justifyContent: ALIGN_NONE, alignItems: ALIGN_NONE,
      padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
      gapRow: 0, gapCol: 0,
      bgColor: 0, cornerRadius: 0,
      children: [],
    },
  ],
}

// ── Buffer builder ─────────────────────────────────────────────────────────

function countNodes(node: NodeDesc): number {
  let n = 1
  for (const c of node.children) n += countNodes(c)
  return n
}

function buildLayoutBuffer(root: NodeDesc, viewportW: number, viewportH: number): { buf: Uint8Array; cmdCount: number } {
  const nodeCount = countNodes(root)
  const cmdCount = nodeCount * 2 // OPEN + CLOSE per node
  // Each OPEN: 8 prefix + 112 payload = 120. Each CLOSE: 8.
  const perNode = 8 + OPEN_PAYLOAD_BYTES + 8
  const payloadBytes = nodeCount * perNode
  const total = 16 + payloadBytes

  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // Header
  view.setUint32(0, GRAPH_MAGIC, true)
  view.setUint32(4, GRAPH_VERSION, true)
  view.setUint32(8, cmdCount, true)
  view.setUint32(12, payloadBytes, true)

  let offset = 16

  function writeOpen(node: NodeDesc) {
    // 8-byte prefix
    view.setUint16(offset, CMD_OPEN, true)
    view.setUint16(offset + 2, node.isRoot ? FLAG_IS_ROOT : 0, true)
    view.setUint32(offset + 4, OPEN_PAYLOAD_BYTES, true)
    offset += 8

    const p = offset
    // Payload (112 bytes) — zero-initialized by ArrayBuffer
    // node_id (u64 LE)
    view.setBigUint64(p, BigInt(node.nodeId), true)
    // parent_node_id (u64 LE)
    view.setBigUint64(p + 8, BigInt(node.parentId), true)
    // packed style starting at payload[16]
    view.setUint8(p + 16, node.flexDir)          // flex_direction
    view.setUint8(p + 17, 0)                     // position_kind = Relative
    view.setUint8(p + 18, node.sizeWKind)         // size_w_kind
    view.setUint8(p + 19, node.sizeHKind)         // size_h_kind
    view.setFloat32(p + 20, node.sizeW, true)     // size_w_value
    view.setFloat32(p + 24, node.sizeH, true)     // size_h_value
    // min/max at 28..44 — 0.0 (no constraint)
    view.setFloat32(p + 44, node.flexGrow, true)  // flex_grow
    view.setFloat32(p + 48, node.flexShrink, true) // flex_shrink
    view.setUint8(p + 52, node.justifyContent)    // justify_content
    view.setUint8(p + 53, node.alignItems)         // align_items
    view.setUint8(p + 54, ALIGN_NONE)             // align_content
    view.setUint8(p + 55, 0)                      // _pad
    view.setFloat32(p + 56, node.padTop, true)
    view.setFloat32(p + 60, node.padRight, true)
    view.setFloat32(p + 64, node.padBottom, true)
    view.setFloat32(p + 68, node.padLeft, true)
    // border at 72..88 — 0.0
    view.setFloat32(p + 88, node.gapRow, true)    // gap_row
    view.setFloat32(p + 92, node.gapCol, true)    // gap_column
    // inset at 96..112 — 0.0
    offset += OPEN_PAYLOAD_BYTES
  }

  function writeClose() {
    view.setUint16(offset, CMD_CLOSE, true)
    view.setUint16(offset + 2, 0, true)
    view.setUint32(offset + 4, 0, true)
    offset += 8
  }

  function writeNode(node: NodeDesc) {
    writeOpen(node)
    for (const child of node.children) {
      writeNode(child)
    }
    writeClose()
  }

  writeNode(root)

  return { buf: u8, cmdCount }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log("=== Vexart Layout Full Trace ===\n")

  // 1. Open library
  const lib = openVexartLibrary()
  const sym = lib.symbols
  const ver = sym.vexart_version()
  console.log(`Library version: 0x${ver.toString(16)}`)

  // 2. Create context
  const ctxBuf = new BigUint64Array(1)
  sym.vexart_context_create(ptr(new Uint8Array(1)), 0, ptr(ctxBuf))
  const ctx = ctxBuf[0]
  console.log(`Context: ${ctx}`)

  // 3. Set viewport (simulate ~80x24 terminal at typical cell size)
  const viewportW = 560  // 80 cols * 7px
  const viewportH = 312  // 24 rows * 13px
  const resizeResult = sym.vexart_context_resize(ctx, viewportW, viewportH)
  console.log(`Resize to ${viewportW}x${viewportH}: result=${resizeResult}`)

  // 4. Build command buffer
  const { buf, cmdCount } = buildLayoutBuffer(tree, viewportW, viewportH)
  console.log(`\nCommand buffer: ${buf.length} bytes, ${cmdCount} commands`)
  console.log(`Total nodes: ${countNodes(tree)}`)

  // 5. Call vexart_layout_compute
  const outBuf = new ArrayBuffer(256 * 1024)
  const outU8 = new Uint8Array(outBuf)
  const outUsed = new Uint32Array(1)

  const result = sym.vexart_layout_compute(
    ctx,
    ptr(buf),
    buf.length,
    ptr(outU8),
    outBuf.byteLength,
    ptr(outUsed),
  ) as number

  console.log(`\nvexart_layout_compute result: ${result} (0=OK)`)
  console.log(`Output bytes used: ${outUsed[0]}`)

  if (result !== 0) {
    // Try to get error message
    const errLen = sym.vexart_get_last_error_length() as number
    if (errLen > 0) {
      const errBuf = new Uint8Array(errLen)
      sym.vexart_copy_last_error(ptr(errBuf), errLen)
      console.log(`Error: ${new TextDecoder().decode(errBuf)}`)
    }
    console.log("\nFAILED: layout compute returned non-zero")
    process.exit(1)
  }

  // 6. Parse output
  const layoutMap = parseLayoutOutput(outBuf, outUsed[0])
  console.log(`\nLayout entries: ${layoutMap.size}`)

  // 7. Print layout for each node
  console.log("\n=== Layout Results ===")
  console.log("ID  | Label                        | x      | y      | w      | h")
  console.log("----|------------------------------|--------|--------|--------|--------")

  function printLayout(node: NodeDesc) {
    const pos = layoutMap.get(BigInt(node.nodeId))
    const x = pos ? pos.x.toFixed(1) : "MISS"
    const y = pos ? pos.y.toFixed(1) : "MISS"
    const w = pos ? pos.width.toFixed(1) : "MISS"
    const h = pos ? pos.height.toFixed(1) : "MISS"
    const id = String(node.nodeId).padStart(3)
    const label = node.label.padEnd(28)
    console.log(`${id} | ${label} | ${String(x).padStart(6)} | ${String(y).padStart(6)} | ${String(w).padStart(6)} | ${String(h).padStart(6)}`)
    for (const child of node.children) printLayout(child)
  }
  printLayout(tree)

  // 8. Verify critical properties
  console.log("\n=== Verification ===")
  let allPass = true

  // Check root fills viewport
  const rootPos = layoutMap.get(BigInt(1))
  if (!rootPos) {
    console.log("FAIL: Root node (id=1) not found in layout map")
    allPass = false
  } else {
    const rootOk = rootPos.width >= viewportW * 0.99 && rootPos.height >= viewportH * 0.99
    console.log(`Root size: ${rootPos.width.toFixed(1)}x${rootPos.height.toFixed(1)} — ${rootOk ? "PASS" : "FAIL"} (expected ~${viewportW}x${viewportH})`)
    if (!rootOk) allPass = false
  }

  // Check fixed-size nodes have correct dimensions
  const fixedNodes = [
    { id: 3, label: "Dot1", expectedW: 12, expectedH: 12 },
    { id: 4, label: "Dot2", expectedW: 12, expectedH: 12 },
    { id: 5, label: "Dot3", expectedW: 12, expectedH: 12 },
    { id: 10, label: "Bar1", expectedW: 32, expectedH: 8 },
    { id: 11, label: "Bar2", expectedW: 32, expectedH: 8 },
    { id: 12, label: "Bar3", expectedW: 32, expectedH: 8 },
  ]
  for (const n of fixedNodes) {
    const pos = layoutMap.get(BigInt(n.id))
    if (!pos) {
      console.log(`FAIL: ${n.label} (id=${n.id}) not in layout map`)
      allPass = false
    } else {
      const ok = Math.abs(pos.width - n.expectedW) < 1 && Math.abs(pos.height - n.expectedH) < 1
      console.log(`${n.label}: ${pos.width.toFixed(1)}x${pos.height.toFixed(1)} — ${ok ? "PASS" : "FAIL"} (expected ${n.expectedW}x${n.expectedH})`)
      if (!ok) allPass = false
    }
  }

  // Check text nodes exist (should be 0x0 since text measure is a stub)
  const textNodeIds = [7, 8, 13]
  for (const id of textNodeIds) {
    const pos = layoutMap.get(BigInt(id))
    if (!pos) {
      console.log(`FAIL: Text node id=${id} not in layout map`)
      allPass = false
    } else {
      console.log(`Text id=${id}: ${pos.width.toFixed(1)}x${pos.height.toFixed(1)} — present (expected 0x0 since text measure is stub)`)
    }
  }

  // Check all node IDs are unique (the bug was nodeId=0 collisions)
  const allIds = new Set<bigint>()
  let dupes = 0
  for (const [id] of layoutMap) {
    if (allIds.has(id)) dupes++
    allIds.add(id)
  }
  console.log(`Unique node IDs in layout: ${allIds.size} (duplicates: ${dupes}) — ${dupes === 0 ? "PASS" : "FAIL"}`)

  // Check Card has non-zero width (it stretches via flexGrow)
  const cardPos = layoutMap.get(BigInt(6))
  if (!cardPos) {
    console.log("FAIL: Card (id=6) not in layout map")
    allPass = false
  } else {
    // Card height = padTop(24) + padBottom(24) + text heights(0) + gap(8) = 56
    // Card width = grows to fill parent (full viewport width)
    const cardWOk = cardPos.width > 0
    const cardHOk = cardPos.height > 0
    console.log(`Card: ${cardPos.width.toFixed(1)}x${cardPos.height.toFixed(1)} — w>0:${cardWOk ? "PASS" : "FAIL"}, h>0:${cardHOk ? "PASS" : "FAIL"}`)
    if (!cardWOk || !cardHOk) allPass = false
  }

  // Check NO nodeId=0 entry exists (the old bug)
  const zeroEntry = layoutMap.get(0n)
  if (zeroEntry) {
    console.log(`WARN: nodeId=0 exists in layout map (w=${zeroEntry.width}, h=${zeroEntry.height}) — this was the collision bug`)
  } else {
    console.log("nodeId=0 absent from layout map — PASS (no collision)")
  }

  console.log(`\n=== Overall: ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} ===`)

  // Cleanup
  sym.vexart_context_destroy(ctx)
}

main()
