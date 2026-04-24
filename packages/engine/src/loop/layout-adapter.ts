/**
 * layout-adapter.ts — VexartLayoutCtx factory + layout buffer helpers.
 *
 * Drop-in replacement for the legacy clay object. Builds a flat layout
 * command buffer during walkTree, then calls vexart_layout_compute.
 * Returns synthetic RenderCommand[] from the Taffy PositionedCommand output.
 *
 * Extracted from loop.ts lines ~49–568 as part of Phase 3 Slice 1.2.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §File Changes
 */

import type { RenderCommand } from "../ffi/render-graph"
import { CMD as _CMD_RG } from "../ffi/render-graph"
import { openVexartLibrary } from "../ffi/vexart-bridge"
import { GRAPH_MAGIC, GRAPH_VERSION } from "../ffi/vexart-buffer"
import { parseLayoutOutput } from "../ffi/layout-writeback"
import type { PositionedCommand } from "../ffi/layout-writeback"
import { ptr } from "bun:ffi"

// ── Local constants previously from clay.ts ───────────────────────────────

/** CMD constants — same values as in the legacy Clay bridge. */
const CMD = {
  ..._CMD_RG,
} as const

/** Floating attach-to mode. */
export const ATTACH_TO = {
  NONE: 0,
  PARENT: 1,
  ELEMENT: 2,
  ROOT: 3,
} as const

/** Floating attach point (3x3 grid). */
export const ATTACH_POINT = {
  LEFT_TOP: 0,
  LEFT_CENTER: 1,
  LEFT_BOTTOM: 2,
  CENTER_TOP: 3,
  CENTER_CENTER: 4,
  CENTER_BOTTOM: 5,
  RIGHT_TOP: 6,
  RIGHT_CENTER: 7,
  RIGHT_BOTTOM: 8,
} as const

/** Pointer capture mode. */
export const POINTER_CAPTURE = {
  CAPTURE: 0,
  PASSTHROUGH: 1,
} as const

// ── VexartLayoutCtx ───────────────────────────────────────────────────────

/** Layout node open payload constants */
const OPEN_PAYLOAD_BYTES = 112
const LAYOUT_CMD_OPEN = 0
const LAYOUT_CMD_CLOSE = 1
const FLAG_IS_ROOT = 1 << 0
const FLAG_FLOATING_ABS = 1 << 1
const FLAG_SCROLL_X = 1 << 2
const FLAG_SCROLL_Y = 1 << 3

// Layout buffer — 256KB, re-used each frame (no allocations on hot path).
const _layoutBuf = new ArrayBuffer(256 * 1024)
const _layoutView = new DataView(_layoutBuf)
const _layoutU8 = new Uint8Array(_layoutBuf)
const _outBuf = new ArrayBuffer(256 * 1024)
const _outU8 = new Uint8Array(_outBuf)
const _outUsedBuf = new Uint32Array(1)

// Per-node accumulated state for building OPEN payload
export type NodeOpenState = {
  nodeId: number
  parentNodeId: number
  flags: number
  flexDir: number
  posKind: number
  sizeWKind: number
  sizeHKind: number
  sizeW: number
  sizeH: number
  minW: number; minH: number
  maxW: number; maxH: number
  flexGrow: number; flexShrink: number
  justifyContent: number; alignItems: number; alignContent: number
  padTop: number; padRight: number; padBottom: number; padLeft: number
  borderTop: number; borderRight: number; borderBottom: number; borderLeft: number
  gapRow: number; gapCol: number
  insetTop: number; insetRight: number; insetBottom: number; insetLeft: number
  // Synthetic render command data
  bgColor: number
  cornerRadius: number
  // Deferred OPEN tracking — written to buffer when first child opens or at closeElement
  _openWritten: boolean
}

export const _defaultOpen = (): NodeOpenState => ({
  nodeId: 0, parentNodeId: 0, flags: 0,
  flexDir: 1 /* column */, posKind: 0, sizeWKind: 0, sizeHKind: 0, sizeW: 0, sizeH: 0,
  minW: 0, minH: 0, maxW: 0, maxH: 0, flexGrow: 0, flexShrink: 1,
  // 255 = None → Taffy uses its default (Stretch for align_items, Start for justify_content).
  // Clay used implicit stretch; Taffy needs 255 (None) to activate the same default behavior.
  justifyContent: 255, alignItems: 255, alignContent: 255,
  padTop: 0, padRight: 0, padBottom: 0, padLeft: 0,
  borderTop: 0, borderRight: 0, borderBottom: 0, borderLeft: 0,
  _openWritten: false,
  gapRow: 0, gapCol: 0,
  insetTop: 0, insetRight: 0, insetBottom: 0, insetLeft: 0,
  bgColor: 0, cornerRadius: 0,
})

/** Write f32 at offset in the layout buffer (little-endian). */
function _lf32(off: number, v: number) { _layoutView.setFloat32(off, v, true) }
/** Write u8 at offset. */
function _lu8(off: number, v: number) { _layoutView.setUint8(off, v) }
/** Write u16 at offset (little-endian). */
function _lu16(off: number, v: number) { _layoutView.setUint16(off, v, true) }
/** Write u32 at offset (little-endian). */
function _lu32(off: number, v: number) { _layoutView.setUint32(off, v, true) }
/** Write u64 at offset (little-endian) as number (safe for id < 2^53). */
function _lu64(off: number, v: number) { _layoutView.setBigUint64(off, BigInt(v), true) }

/** Vexart size kind enum (matches layout/tree.rs: 0=Auto,1=Length,2=Percent) */
export function _vxSizeKind(k: number): number {
  // SIZING from node.ts: FIT=0, GROW=1, PERCENT=2, FIXED=3
  if (k === 1 /* GROW */) return 0  // Auto
  if (k === 3 /* FIXED */) return 1  // Length
  if (k === 2 /* PERCENT */) return 2  // Percent
  return 0  // Auto (FIT maps to Auto with no flex_grow)
}

/** Vexart flex-grow from SIZING: GROW=1.0, others=0.0 */
export function _vxFlexGrow(sizing: { type: number } | null, explicit: number): number {
  if (explicit > 0) return explicit
  if (sizing?.type === 1 /* GROW */) return 1.0
  return 0.0
}

/** Vexart justify_content / align_items from ALIGN_X/ALIGN_Y enum.
 *  Rust: 0=Start, 1=End, 2=Center, 3=SpaceBetween, 255=None
 *  Clay ALIGN_X: LEFT=0, RIGHT=1, CENTER=2, SPACE_BETWEEN=3
 */
export function _vxAlign(v: number): number {
  if (v === 1 /* RIGHT/BOTTOM */) return 1
  if (v === 2 /* CENTER */) return 2
  if (v === 3 /* SPACE_BETWEEN */) return 3
  return 0 // LEFT/TOP → Start
}

/**
 * VexartLayoutCtx — Clay-compatible layout context backed by vexart_layout_compute.
 * Methods mirror the legacy `clay` object API for drop-in use in loop.ts.
 */
export function createVexartLayoutCtx() {
  let _vxCtx: bigint = 0n
  let _cmdCount = 0
  let _offset = 0
  let _parentStack: NodeOpenState[] = []
  let _current: NodeOpenState = _defaultOpen()
  let _allOpenStates: NodeOpenState[] = []  // order matches OPEN commands
  // Text entries — stores metadata for CMD.TEXT generation in endLayout()
  type TextEntry = { nodeId: number; content: string; color: number; fontId: number; fontSize: number }
  let _textEntries: TextEntry[] = []
  let _pendingSetId: string | null = null
  let _scrollOffsets = new Map<string, { x: number; y: number }>()
  let _scrollDataCache = new Map<string, { scrollX: number; scrollY: number; contentWidth: number; contentHeight: number; viewportWidth: number; viewportHeight: number; found: boolean }>()

  function _initCtx() {
    if (_vxCtx !== 0n) return
    const { symbols } = openVexartLibrary()
    const ctxBuf = new BigUint64Array(1)
    // opts_ptr: pass a 1-byte dummy buffer (Bun FFI rejects zero-length ArrayBufferView).
    // Rust side ignores opts_ptr when opts_len == 0.
    symbols.vexart_context_create(ptr(new Uint8Array(1)), 0, ptr(ctxBuf))
    _vxCtx = ctxBuf[0]
  }

  function _writeOpenCommand(state: NodeOpenState) {
    const off = _offset
    // 8-byte prefix
    _lu16(off, LAYOUT_CMD_OPEN)
    _lu16(off + 2, state.flags)
    _lu32(off + 4, OPEN_PAYLOAD_BYTES)
    const pOff = off + 8
    // Payload (112 bytes)
    _lu64(pOff, state.nodeId)
    _lu64(pOff + 8, state.parentNodeId)
    _lu8(pOff + 16, state.flexDir)
    _lu8(pOff + 17, state.posKind)
    _lu8(pOff + 18, state.sizeWKind)
    _lu8(pOff + 19, state.sizeHKind)
    _lf32(pOff + 20, state.sizeW)
    _lf32(pOff + 24, state.sizeH)
    _lf32(pOff + 28, state.minW)
    _lf32(pOff + 32, state.minH)
    _lf32(pOff + 36, state.maxW)
    _lf32(pOff + 40, state.maxH)
    _lf32(pOff + 44, state.flexGrow)
    _lf32(pOff + 48, state.flexShrink)
    _lu8(pOff + 52, _vxAlign(state.justifyContent))
    _lu8(pOff + 53, _vxAlign(state.alignItems))
    _lu8(pOff + 54, _vxAlign(state.alignContent))
    _lu8(pOff + 55, 0) // _pad
    _lf32(pOff + 56, state.padTop)
    _lf32(pOff + 60, state.padRight)
    _lf32(pOff + 64, state.padBottom)
    _lf32(pOff + 68, state.padLeft)
    _lf32(pOff + 72, state.borderTop)
    _lf32(pOff + 76, state.borderRight)
    _lf32(pOff + 80, state.borderBottom)
    _lf32(pOff + 84, state.borderLeft)
    _lf32(pOff + 88, state.gapRow)
    _lf32(pOff + 92, state.gapCol)
    _lf32(pOff + 96, state.insetTop)
    _lf32(pOff + 100, state.insetRight)
    _lf32(pOff + 104, state.insetBottom)
    _lf32(pOff + 108, state.insetLeft)
    _offset += 8 + OPEN_PAYLOAD_BYTES
    _cmdCount++
    _allOpenStates.push(state)
  }

  function _writeCloseCommand() {
    const off = _offset
    _lu16(off, LAYOUT_CMD_CLOSE)
    _lu16(off + 2, 0)
    _lu32(off + 4, 0)
    _offset += 8
    _cmdCount++
  }

  function _finalizeHeader() {
    _lu32(0, GRAPH_MAGIC)
    _lu32(4, GRAPH_VERSION)
    _lu32(8, _cmdCount)
    _lu32(12, _offset)
  }

  // Last layout result — used by writeLayoutBack to update ALL nodes
  let _lastLayoutMap: Map<bigint, PositionedCommand> | null = null
  function getLastLayoutMap() { return _lastLayoutMap }

  return {
    /** Access the last parsed layout map for direct node layout updates. */
    getLastLayoutMap,

    init(width: number, height: number): boolean {
      _initCtx()
      if (_vxCtx === 0n) return false
      const { symbols } = openVexartLibrary()
      return symbols.vexart_context_resize(_vxCtx, width, height) === 0
    },

    setDimensions(width: number, height: number) {
      _initCtx()
      if (_vxCtx === 0n) return
      const { symbols } = openVexartLibrary()
      symbols.vexart_context_resize(_vxCtx, width, height)
    },

    destroy() {
      if (_vxCtx === 0n) return
      const { symbols } = openVexartLibrary()
      symbols.vexart_context_destroy(_vxCtx)
      _vxCtx = 0n
    },

    beginLayout() {
      _offset = 16  // reserve header space
      _cmdCount = 0
      _parentStack = []
      _allOpenStates = []
      _textEntries = []
      _current = _defaultOpen()
      _pendingSetId = null
    },

     endLayout(): RenderCommand[] {
      // Finalize + call vexart_layout_compute
      _finalizeHeader()
      _initCtx()
      if (_vxCtx === 0n) return []
      const { symbols } = openVexartLibrary()
      _outUsedBuf[0] = 0
      const bufBytes = _offset
      const result = symbols.vexart_layout_compute(
        _vxCtx,
        ptr(_layoutU8),
        bufBytes,
        ptr(_outU8),
        _outBuf.byteLength,
        ptr(_outUsedBuf),
      ) as number
      if (result !== 0) return []
      const used = _outUsedBuf[0]
      // Parse PositionedCommands and synthesize RenderCommand[]
      const layoutMap = parseLayoutOutput(_outBuf, used)
      _lastLayoutMap = layoutMap

      // ── Unified DFS command emission with SCISSOR bracketing ──
      //
      // _allOpenStates is in DFS (tree) order — same order nodes were opened.
      // Each entry has nodeId, parentNodeId, and flags (including FLAG_SCROLL_X/Y).
      // _textEntries are also in DFS order, but interleaved with box states.
      //
      // We need to emit: RECT commands for box nodes, TEXT commands for text
      // nodes — all in DFS order, with SCISSOR_START/END around descendants
      // of scroll containers.
      //
      // Strategy:
      //   1. Build a unified DFS sequence (box states + text entries) ordered
      //      by their position in the tree walk (i.e. DFS index).
      //   2. Track a scroll ancestor stack. When entering a scroll container,
      //      push SCISSOR_START. When we exit (next sibling/ancestor outside),
      //      push SCISSOR_END.
      //
      // Since _allOpenStates doesn't carry DFS indices for text entries
      // (text entries were interleaved during the walk), we use parentNodeId
      // to assign text entries to their parent's position in the sequence.

      // Build nodeId → DFS index map from _allOpenStates
      const dfsIndex = new Map<number, number>()
      for (let i = 0; i < _allOpenStates.length; i++) {
        dfsIndex.set(_allOpenStates[i].nodeId, i)
      }

      // Assign each text entry a DFS position: parent's index + 0.5
      // (appears after parent's RECT, before any box children that come after)
      // Use parentNodeId from the text state to place it correctly.
      type TextEntry = { nodeId: number; content: string; color: number; fontId: number; fontSize: number }
      type DFSItem =
        | { kind: 'box'; state: NodeOpenState; idx: number }
        | { kind: 'text'; entry: TextEntry; idx: number }

      const items: DFSItem[] = []
      for (const state of _allOpenStates) {
        items.push({ kind: 'box', state, idx: dfsIndex.get(state.nodeId) ?? 0 })
      }
      for (const te of _textEntries) {
        // Text node's own DFS index (it appears in _allOpenStates as a leaf node)
        const textIdx = dfsIndex.get(te.nodeId) ?? 0
        items.push({ kind: 'text', entry: te, idx: textIdx })
      }
      items.sort((a, b) => a.idx - b.idx)

      // Build scroll container set
      const scrollContainerIds = new Set<number>()
      for (const state of _allOpenStates) {
        if (state.flags & (FLAG_SCROLL_X | FLAG_SCROLL_Y)) {
          scrollContainerIds.add(state.nodeId)
        }
      }

      // Build parent map for ancestor traversal
      const parentById = new Map<number, number>()
      for (const state of _allOpenStates) {
        parentById.set(state.nodeId, state.parentNodeId)
      }

      function findScrollAncestor(nodeId: number): number | null {
        let pid = parentById.get(nodeId) ?? 0
        while (pid !== 0) {
          if (scrollContainerIds.has(pid)) return pid
          pid = parentById.get(pid) ?? 0
        }
        return null
      }

      // Emit commands in unified DFS order
      const cmds: RenderCommand[] = []
      // Track which scroll containers have an open scissor
      // When a node's scroll ancestor changes (we leave a scissor region),
      // we need to emit SCISSOR_END for that container.
      // We track this via a stack of currently open scissor node IDs.
      const scissorStack: number[] = []

      function closeScissorsUntil(targetAncestor: number | null) {
        // Pop scissor entries until the stack matches targetAncestor
        while (scissorStack.length > 0) {
          const top = scissorStack[scissorStack.length - 1]
          if (top === targetAncestor) break
          scissorStack.pop()
          cmds.push({ type: CMD.SCISSOR_END, x: 0, y: 0, width: 0, height: 0, color: [0, 0, 0, 0] as [number,number,number,number], cornerRadius: 0, extra1: 0, extra2: 0 })
        }
      }

      function makeRect(pos: { x: number; y: number; width: number; height: number }, state: NodeOpenState): RenderCommand {
        return {
          type: CMD.RECTANGLE,
          x: pos.x, y: pos.y, width: pos.width, height: pos.height,
          color: [(state.bgColor >>> 24) & 0xff, (state.bgColor >>> 16) & 0xff, (state.bgColor >>> 8) & 0xff, state.bgColor & 0xff] as [number,number,number,number],
          cornerRadius: state.cornerRadius,
          extra1: 0, extra2: 0,
          nodeId: state.nodeId,
        }
      }

      for (const item of items) {
        if (item.kind === 'box') {
          const { state } = item
          const pos = layoutMap.get(BigInt(state.nodeId))
          if (!pos) continue

          if (scrollContainerIds.has(state.nodeId)) {
            // Scroll container: close any inner scissors, emit own RECT, open scissor
            const myAncestor = findScrollAncestor(state.nodeId)
            closeScissorsUntil(myAncestor)
            // Emit container's own RECT (background of the scroll viewport)
            if (state.bgColor !== 0 || state.cornerRadius !== 0) {
              cmds.push(makeRect(pos, state))
            }
            // Open scissor for this container's children
            cmds.push({ type: CMD.SCISSOR_START, x: pos.x, y: pos.y, width: pos.width, height: pos.height, color: [0, 0, 0, 0] as [number,number,number,number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: state.nodeId })
            scissorStack.push(state.nodeId)
          } else {
            // Normal box: ensure correct scissor context then emit RECT
            const myAncestor = findScrollAncestor(state.nodeId)
            closeScissorsUntil(myAncestor)
            // Emit RECT if needed
            if (state.bgColor !== 0 || state.cornerRadius !== 0) {
              cmds.push(makeRect(pos, state))
            }
          }
        } else {
          // Text entry
          const te = item.entry
          const pos = layoutMap.get(BigInt(te.nodeId))
          if (!pos) continue

          const myAncestor = findScrollAncestor(te.nodeId)
          closeScissorsUntil(myAncestor)
          cmds.push({
            type: CMD.TEXT,
            x: pos.x, y: pos.y, width: pos.width, height: pos.height,
            color: [(te.color >>> 24) & 0xff, (te.color >>> 16) & 0xff, (te.color >>> 8) & 0xff, te.color & 0xff] as [number,number,number,number],
            cornerRadius: 0, extra1: te.fontSize, extra2: te.fontId, text: te.content,
            nodeId: te.nodeId,
          })
        }
      }

      // Close any remaining open scissors
      closeScissorsUntil(null)

      return cmds
    },

    /** Set the current node's stable Vexart ID. Called right after openElement/setId. */
    setCurrentNodeId(nodeId: number) {
      if (_current) _current.nodeId = nodeId
    },

    openElement() {
      // Flush the parent's OPEN before opening a child.
      // This ensures the buffer order is: OPEN(parent) OPEN(child) ... CLOSE(child) CLOSE(parent)
      if (_parentStack.length > 0) {
        const parentState = _parentStack[_parentStack.length - 1]
        if (!parentState._openWritten) {
          _writeOpenCommand(parentState)
          parentState._openWritten = true
        }
      }
      const parent = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1] : null
      const state: NodeOpenState = _defaultOpen()
      state.parentNodeId = parent?.nodeId ?? 0
      if (_parentStack.length === 0) state.flags |= FLAG_IS_ROOT
      _pendingSetId = null
      _parentStack.push(state)
      _current = state
    },

    closeElement() {
      const state = _parentStack.pop()
      if (!state) return
      // If this node's OPEN was never written (leaf node with no children),
      // write it now before the CLOSE.
      if (!state._openWritten) {
        _writeOpenCommand(state)
      }
      _writeCloseCommand()
      _current = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1] : _defaultOpen()
    },

    setId(id: string) {
      // In legacy Clay, setId() calls openElement() internally.
      // Here we do the same: push a new state and mark the id.
      // Flush parent's OPEN first (same as openElement).
      if (_parentStack.length > 0) {
        const parentState = _parentStack[_parentStack.length - 1]
        if (!parentState._openWritten) {
          _writeOpenCommand(parentState)
          parentState._openWritten = true
        }
      }
      const parent = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1] : null
      const state: NodeOpenState = _defaultOpen()
      state.parentNodeId = parent?.nodeId ?? 0
      if (_parentStack.length === 0) state.flags |= FLAG_IS_ROOT
      _pendingSetId = id
      _parentStack.push(state)
      _current = state
    },

    configureLayout(dir: number, px: number, py: number, gap: number, ax: number, ay: number) {
      const s = _current
      s.flexDir = dir
      s.padLeft = px; s.padRight = px; s.padTop = py; s.padBottom = py
      s.gapRow = gap; s.gapCol = gap
      // Flexbox: justify_content = main axis, align_items = cross axis.
      // Vexart API: alignX = always horizontal, alignY = always vertical.
      // Column: main=Y, cross=X → swap so alignX→align_items, alignY→justify_content
      // Row:    main=X, cross=Y → no swap (alignX→justify_content, alignY→align_items)
      if (dir === 1 /* column */ || dir === 3 /* column-reverse */) {
        s.justifyContent = ay; s.alignItems = ax
      } else {
        s.justifyContent = ax; s.alignItems = ay
      }
    },

    configureLayoutFull(dir: number, padL: number, padR: number, padT: number, padB: number, gap: number, ax: number, ay: number) {
      const s = _current
      s.flexDir = dir
      s.padLeft = padL; s.padRight = padR; s.padTop = padT; s.padBottom = padB
      s.gapRow = gap; s.gapCol = gap
      if (dir === 1 || dir === 3) {
        s.justifyContent = ay; s.alignItems = ax
      } else {
        s.justifyContent = ax; s.alignItems = ay
      }
    },

    configureSizing(wType: number, wVal: number, hType: number, hVal: number) {
      const s = _current
      s.sizeWKind = _vxSizeKind(wType)
      s.sizeW = wVal
      s.sizeHKind = _vxSizeKind(hType)
      s.sizeH = hVal
      if (wType === 1 /* GROW */) s.flexGrow = 1.0
    },

    configureSizingMinMax(wType: number, wVal: number, minW: number, maxW: number, hType: number, hVal: number, minH: number, maxH: number) {
      const s = _current
      s.sizeWKind = _vxSizeKind(wType)
      s.sizeW = wVal
      s.sizeHKind = _vxSizeKind(hType)
      s.sizeH = hVal
      s.minW = minW; s.maxW = maxW; s.minH = minH; s.maxH = maxH
      if (wType === 1 /* GROW */) s.flexGrow = 1.0
    },

    configureRectangle(color: number, radius: number) {
      _current.bgColor = color
      _current.cornerRadius = radius
    },

    configureBorder(_color: number, _width: number) {
      // Border reservation noted; full border rendering handled by paint layer
      const s = _current
      const w = _width
      s.borderTop = w; s.borderRight = w; s.borderBottom = w; s.borderLeft = w
    },

    /**
     * Configure per-side border widths for space reservation.
     *
     * SUPPORTED: per-side border widths (_l, _r, _t, _b) — mapped to Taffy border.
     * NOT SUPPORTED: borderBetweenChildren (_btw) — Taffy has no equivalent;
     *   this was a Clay-specific layout primitive. Use `gap` instead.
     * NOTE: _color is ignored here; border color is applied at paint time via effects queue.
     */
    configureBorderSides(_color: number, _l: number, _r: number, _t: number, _b: number, _btw: number) {
      const s = _current
      s.borderLeft = _l; s.borderRight = _r; s.borderTop = _t; s.borderBottom = _b
    },

    /**
     * Configure a floating (absolutely-positioned) element.
     *
     * SUPPORTED (maps to Taffy absolute position with insets):
     *   - ox, oy → inset_left, inset_top (pixel offset from attach origin)
     *
     * NOT SUPPORTED (Clay-specific features with no Taffy equivalent):
     *   - attachTo (PARENT/ROOT/ELEMENT) — Taffy has no attach-point concept;
     *     all floating elements are positioned relative to their containing block.
     *   - attachPoints (ape/app — 3×3 grid anchor) — not available in Taffy.
     *   - pointerPassthrough (_pc) — must be implemented at the hit-test layer (TS-side).
     *   - elementId (_pid) — "attach to element" mode is not supported; use ox/oy directly.
     *   - zIndex (_z) — z-ordering is handled via the layer system, not Taffy.
     *
     * The correct Taffy mapping for floating is absolute position + insets.
     * Callers that need attach-point semantics must compute ox/oy themselves.
     */
    configureFloating(attachTo: number, ox: number, oy: number, _z: number, _ape: number, _app: number, _pc: number, _pid: number) {
      const s = _current
      s.flags |= FLAG_FLOATING_ABS
      s.posKind = 1  // Absolute
      s.insetLeft = ox; s.insetTop = oy
    },

    /**
     * Configure scroll/clip container flags.
     *
     * SUPPORTED: _sx/_sy set FLAG_SCROLL_X/Y on the Taffy node so that
     *   Taffy uses overflow:scroll (children are not compressed by flex_shrink).
     *
     * NOT SUPPORTED: _ox/_oy (Clay-era scroll offsets) — scroll offsets are
     *   now applied TS-side in applyScrollOffsets() after layout. These params
     *   are accepted for signature compatibility but intentionally ignored.
     */
    configureClip(_sx: boolean, _sy: boolean, _ox: number, _oy: number) {
      const s = _current
      if (_sx) s.flags |= FLAG_SCROLL_X
      if (_sy) s.flags |= FLAG_SCROLL_Y
    },

    text(_content: string, _color: number, _fontId: number, _fontSize: number, nodeId?: number, measuredW?: number, measuredH?: number) {
      // Flush parent OPEN before emitting child text node (same as openElement).
      if (_parentStack.length > 0) {
        const parentState = _parentStack[_parentStack.length - 1]
        if (!parentState._openWritten) {
          _writeOpenCommand(parentState)
          parentState._openWritten = true
        }
      }
      const state: NodeOpenState = _defaultOpen()
      if (nodeId !== undefined) state.nodeId = nodeId
      state.parentNodeId = _parentStack.length > 0 ? _parentStack[_parentStack.length - 1].nodeId : 0
      if (measuredW !== undefined && measuredH !== undefined && measuredW > 0 && measuredH > 0) {
        state.sizeWKind = 1; state.sizeW = measuredW    // Length (Rust value 1 = Dimension::length)
        state.sizeHKind = 1; state.sizeH = measuredH    // Length (Rust value 1 = Dimension::length)
      } else {
        state.sizeWKind = 0; state.sizeHKind = 0  // Auto (0x0 without measure callback)
      }
      _writeOpenCommand(state)
      _writeCloseCommand()
      // Store text metadata for CMD.TEXT generation in endLayout()
      _textEntries.push({ nodeId: state.nodeId, content: _content, color: _color, fontId: _fontId, fontSize: _fontSize })
    },

    hashString(s: string): number {
      let h = 0x811c9dc5
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
      }
      return h >>> 0
    },

    getScrollContainerData(id: string): { scrollX: number; scrollY: number; contentWidth: number; contentHeight: number; viewportWidth: number; viewportHeight: number; found: boolean } {
      return _scrollDataCache.get(id) ?? { scrollX: 0, scrollY: 0, contentWidth: 0, contentHeight: 0, viewportWidth: 0, viewportHeight: 0, found: false }
    },

    setScrollPosition(id: string, x: number, y: number) {
      const d = _scrollDataCache.get(id)
      if (d) { d.scrollX = x; d.scrollY = y }
    },

    getElementData(label: string): { found: boolean; x: number; y: number; width: number; height: number } {
      return { found: false, x: 0, y: 0, width: 0, height: 0 }
    },
  }
}
