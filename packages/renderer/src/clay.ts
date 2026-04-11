/**
 * Clay layout engine — TypeScript FFI bindings.
 *
 * Wraps the Clay C library (via clay_wrapper.c) with a clean TS API.
 * All struct params are flattened to primitives at the C wrapper level,
 * so bun:ffi sees only simple types.
 *
 * Usage:
 *   clay.init(800, 600)
 *   clay.beginLayout()
 *   clay.openElement()
 *   clay.configureLayout(...)
 *   clay.configureRectangle(0xff0000ff, 8)
 *   clay.closeElement()
 *   const commands = clay.endLayout()  // → RenderCommand[]
 */

import { dlopen, FFIType, ptr } from "bun:ffi"
import { resolve } from "path"

// ── FFI Setup ──

function findLib(): string {
  const ext = process.platform === "darwin" ? "dylib" : process.platform === "win32" ? "dll" : "so"
  const name = process.platform === "win32" ? `clay.${ext}` : `libclay.${ext}`
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const target = `${arch}-${process.platform}`
  const candidates = [
    // npm package: vendor/clay/{arch}-{platform}/
    resolve(import.meta.dir, "vendor/clay", target, name),
    // monorepo development
    resolve(import.meta.dir, "../../../vendor/libclay.dylib"),
    resolve(process.cwd(), "vendor/libclay.dylib"),
  ]
  for (const path of candidates) {
    try { if (Bun.file(path).size > 0) return path } catch {}
  }
  return candidates[0]
}

const DEFS = {
  tge_clay_init:                { args: [FFIType.f32, FFIType.f32], returns: FFIType.i32 },
  tge_clay_set_dimensions:      { args: [FFIType.f32, FFIType.f32], returns: FFIType.void },
  tge_clay_destroy:             { args: [], returns: FFIType.void },
  tge_clay_begin_layout:        { args: [], returns: FFIType.void },
  tge_clay_end_layout:          { args: [], returns: FFIType.i32 },
  tge_clay_open_element:        { args: [], returns: FFIType.void },
  tge_clay_close_element:       { args: [], returns: FFIType.void },
  tge_clay_configure_layout:    { args: [FFIType.u8, FFIType.u16, FFIType.u16, FFIType.u16, FFIType.u8, FFIType.u8], returns: FFIType.void },
  tge_clay_configure_layout_full: { args: [FFIType.u8, FFIType.u16, FFIType.u16, FFIType.u16, FFIType.u16, FFIType.u16, FFIType.u8, FFIType.u8], returns: FFIType.void },
  tge_clay_configure_sizing:    { args: [FFIType.u8, FFIType.f32, FFIType.u8, FFIType.f32], returns: FFIType.void },
  tge_clay_configure_sizing_minmax: { args: [FFIType.u8, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.u8, FFIType.f32, FFIType.f32, FFIType.f32], returns: FFIType.void },
  tge_clay_configure_rectangle: { args: [FFIType.u32, FFIType.f32], returns: FFIType.void },
  tge_clay_configure_border:    { args: [FFIType.u32, FFIType.u16], returns: FFIType.void },
  tge_clay_configure_border_sides: { args: [FFIType.u32, FFIType.u16, FFIType.u16, FFIType.u16, FFIType.u16, FFIType.u16], returns: FFIType.void },
  tge_clay_configure_floating:  { args: [FFIType.u8, FFIType.f32, FFIType.f32, FFIType.i16, FFIType.u8, FFIType.u8, FFIType.u8, FFIType.u32], returns: FFIType.void },
  tge_clay_hash_string:         { args: [FFIType.ptr, FFIType.i32], returns: FFIType.u32 },
  tge_clay_text:                { args: [FFIType.ptr, FFIType.i32, FFIType.u32, FFIType.u16, FFIType.u16], returns: FFIType.void },
  tge_clay_configure_clip:      { args: [FFIType.u8, FFIType.u8, FFIType.f32, FFIType.f32], returns: FFIType.void },
  tge_clay_get_scroll_offset:   { args: [FFIType.ptr], returns: FFIType.void },
  tge_clay_set_id:              { args: [FFIType.ptr, FFIType.i32], returns: FFIType.void },
  tge_clay_read_commands:       { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  tge_clay_read_text:           { args: [FFIType.i32, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  tge_clay_set_pointer:         { args: [FFIType.f32, FFIType.f32, FFIType.i32], returns: FFIType.void },
  tge_clay_update_scroll:       { args: [FFIType.f32, FFIType.f32, FFIType.f32], returns: FFIType.void },
  tge_clay_reset_text_measures: { args: [], returns: FFIType.void },
  tge_clay_set_text_measure:    { args: [FFIType.i32, FFIType.f32, FFIType.f32], returns: FFIType.void },
  tge_clay_get_scroll_container_data: { args: [FFIType.ptr, FFIType.i32, FFIType.ptr], returns: FFIType.void },
  tge_clay_set_scroll_position: { args: [FFIType.ptr, FFIType.i32, FFIType.f32, FFIType.f32], returns: FFIType.void },
  tge_clay_get_element_data:    { args: [FFIType.ptr, FFIType.i32, FFIType.ptr], returns: FFIType.void },
} as const

let lib: ReturnType<typeof dlopen<typeof DEFS>> | null = null

function getLib() {
  if (lib) return lib
  lib = dlopen(findLib(), DEFS)
  return lib
}

// ── Render Command Types ──

export const CMD = {
  NONE: 0,
  RECTANGLE: 1,
  BORDER: 2,
  TEXT: 3,
  IMAGE: 4,
  SCISSOR_START: 5,
  SCISSOR_END: 6,
} as const

export type RenderCommand = {
  type: number
  x: number
  y: number
  width: number
  height: number
  color: [number, number, number, number] // r,g,b,a 0-255
  cornerRadius: number
  extra1: number // border width, font size
  extra2: number // text length, font id
  text?: string
}

// ── Command readback buffer ──

const CMD_STRIDE = 14
const MAX_COMMANDS = 2048
const cmdBuffer = new Float32Array(MAX_COMMANDS * CMD_STRIDE)
const textBuffer = new Uint8Array(4096)
const scrollOffsetBuf = new Float32Array(2)
const scrollDataBuf = new Float32Array(7)
const elementDataBuf = new Float32Array(5)

// ── Sizing types ──

export const SIZING = {
  FIT: 0,
  GROW: 1,
  PERCENT: 2,
  FIXED: 3,
} as const

// ── Direction ──

export const DIRECTION = {
  LEFT_TO_RIGHT: 0,
  TOP_TO_BOTTOM: 1,
} as const

// ── Alignment ──

export const ALIGN_X = { LEFT: 0, RIGHT: 1, CENTER: 2 } as const
export const ALIGN_Y = { TOP: 0, BOTTOM: 1, CENTER: 2 } as const

// ── Floating attach modes ──

export const ATTACH_TO = {
  NONE: 0,
  PARENT: 1,
  ELEMENT: 2,
  ROOT: 3,
} as const

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

export const POINTER_CAPTURE = {
  CAPTURE: 0,
  PASSTHROUGH: 1,
} as const

// ── Public API ──

export const clay = {
  init(width: number, height: number): boolean {
    const result = getLib().symbols.tge_clay_init(width, height)
    return result === 1
  },

  setDimensions(width: number, height: number) {
    getLib().symbols.tge_clay_set_dimensions(width, height)
  },

  destroy() {
    getLib().symbols.tge_clay_destroy()
  },

  beginLayout() {
    getLib().symbols.tge_clay_begin_layout()
  },

  /**
   * End layout and read back render commands.
   * Returns an array of RenderCommand objects.
   */
  endLayout(): RenderCommand[] {
    const s = getLib().symbols
    s.tge_clay_end_layout() // compute layout + store commands
    const count = s.tge_clay_read_commands(cmdBuffer, MAX_COMMANDS) // read stored commands
    const commands: RenderCommand[] = []

    for (let i = 0; i < count; i++) {
      const off = i * CMD_STRIDE
      const type = cmdBuffer[off]
      const cmd: RenderCommand = {
        type,
        x: cmdBuffer[off + 1],
        y: cmdBuffer[off + 2],
        width: cmdBuffer[off + 3],
        height: cmdBuffer[off + 4],
        color: [cmdBuffer[off + 5], cmdBuffer[off + 6], cmdBuffer[off + 7], cmdBuffer[off + 8]],
        cornerRadius: cmdBuffer[off + 9],
        extra1: cmdBuffer[off + 10],
        extra2: cmdBuffer[off + 11],
      }

      // Read text content for text commands
      if (type === CMD.TEXT) {
        const textLen = s.tge_clay_read_text(i, textBuffer, textBuffer.length)
        if (textLen > 0) {
          cmd.text = new TextDecoder().decode(textBuffer.subarray(0, textLen))
        }
      }

      commands.push(cmd)
    }

    return commands
  },

  openElement() {
    getLib().symbols.tge_clay_open_element()
  },

  closeElement() {
    getLib().symbols.tge_clay_close_element()
  },

  configureLayout(
    direction = 0,
    paddingX = 0,
    paddingY = 0,
    childGap = 0,
    alignX = 0,
    alignY = 0,
  ) {
    getLib().symbols.tge_clay_configure_layout(direction, paddingX, paddingY, childGap, alignX, alignY)
  },

  configureSizing(
    widthType = 0,
    widthValue = 0,
    heightType = 0,
    heightValue = 0,
  ) {
    getLib().symbols.tge_clay_configure_sizing(widthType, widthValue, heightType, heightValue)
  },

  /** Configure background color + corner radius. Color is packed u32 RGBA. */
  configureRectangle(color: number, radius = 0) {
    getLib().symbols.tge_clay_configure_rectangle(color, radius)
  },

  /** Configure border — uniform width on all sides. Color is packed u32 RGBA. */
  configureBorder(color: number, width: number) {
    getLib().symbols.tge_clay_configure_border(color, width)
  },

  /** Configure border — per-side widths. Color is packed u32 RGBA. */
  configureBorderSides(color: number, left: number, right: number, top: number, bottom: number, betweenChildren = 0) {
    getLib().symbols.tge_clay_configure_border_sides(color, left, right, top, bottom, betweenChildren)
  },

  /** Configure sizing with min/max constraints (for FIT and GROW modes). */
  configureSizingMinMax(
    widthType: number, widthValue: number, widthMin: number, widthMax: number,
    heightType: number, heightValue: number, heightMin: number, heightMax: number,
  ) {
    getLib().symbols.tge_clay_configure_sizing_minmax(widthType, widthValue, widthMin, widthMax, heightType, heightValue, heightMin, heightMax)
  },

  /** Configure floating (position: absolute equivalent).
   *  attachTo: ATTACH_TO.PARENT | ATTACH_TO.ROOT | ATTACH_TO.ELEMENT */
  configureFloating(
    attachTo: number,
    offsetX = 0, offsetY = 0,
    zIndex = 0,
    attachPointElement = 0,
    attachPointParent = 0,
    pointerCapture = 0,
    parentId = 0,
  ) {
    getLib().symbols.tge_clay_configure_floating(attachTo, offsetX, offsetY, zIndex, attachPointElement, attachPointParent, pointerCapture, parentId)
  },

  /** Hash a string to get a Clay element ID (for floating parentId). */
  hashString(label: string): number {
    const encoded = new TextEncoder().encode(label)
    return getLib().symbols.tge_clay_hash_string(encoded, encoded.length) as number
  },

  /** Configure layout with per-side padding. */
  configureLayoutFull(
    direction = 0,
    padLeft = 0, padRight = 0, padTop = 0, padBottom = 0,
    childGap = 0,
    alignX = 0, alignY = 0,
  ) {
    getLib().symbols.tge_clay_configure_layout_full(direction, padLeft, padRight, padTop, padBottom, childGap, alignX, alignY)
  },

  /** Add a text element (leaf node — opens and closes itself). */
  text(content: string, color: number, fontId = 0, fontSize = 16) {
    const encoded = new TextEncoder().encode(content)
    getLib().symbols.tge_clay_text(encoded, encoded.length, color, fontId, fontSize)
  },

  /** Open an element with a string ID (for scroll tracking, etc). Replaces openElement(). */
  setId(label: string) {
    const encoded = new TextEncoder().encode(label)
    getLib().symbols.tge_clay_set_id(encoded, encoded.length)
  },

  /** Configure clip/scroll container for the current element. */
  configureClip(horizontal: boolean, vertical: boolean, offsetX: number, offsetY: number) {
    getLib().symbols.tge_clay_configure_clip(horizontal ? 1 : 0, vertical ? 1 : 0, offsetX, offsetY)
  },

  /** Get the internally tracked scroll offset for the currently open element. */
  getScrollOffset(): { x: number; y: number } {
    const buf = scrollOffsetBuf
    getLib().symbols.tge_clay_get_scroll_offset(buf)
    return { x: buf[0], y: buf[1] }
  },

  /** Set pointer position for hover detection. */
  setPointer(x: number, y: number, pressed: boolean) {
    getLib().symbols.tge_clay_set_pointer(x, y, pressed ? 1 : 0)
  },

  /** Update scroll containers. */
  updateScroll(dx: number, dy: number, dt: number) {
    getLib().symbols.tge_clay_update_scroll(dx, dy, dt)
  },

  /** Reset the text measurement counter (call before walkTree). */
  resetTextMeasures() {
    getLib().symbols.tge_clay_reset_text_measures()
  },

  /** Pre-register a text measurement for Clay's callback. */
  setTextMeasure(index: number, width: number, height: number) {
    getLib().symbols.tge_clay_set_text_measure(index, width, height)
  },

  /**
   * Get scroll container data by string ID.
   * Returns scrollPosition, viewport dimensions, content dimensions.
   */
  getScrollContainerData(label: string): {
    scrollX: number; scrollY: number
    viewportWidth: number; viewportHeight: number
    contentWidth: number; contentHeight: number
    found: boolean
  } {
    const encoded = new TextEncoder().encode(label)
    getLib().symbols.tge_clay_get_scroll_container_data(encoded, encoded.length, scrollDataBuf)
    return {
      scrollX: scrollDataBuf[0],
      scrollY: scrollDataBuf[1],
      viewportWidth: scrollDataBuf[2],
      viewportHeight: scrollDataBuf[3],
      contentWidth: scrollDataBuf[4],
      contentHeight: scrollDataBuf[5],
      found: scrollDataBuf[6] > 0.5,
    }
  },

  /** Set scroll position of a scroll container by string ID. */
  setScrollPosition(label: string, x: number, y: number) {
    const encoded = new TextEncoder().encode(label)
    getLib().symbols.tge_clay_set_scroll_position(encoded, encoded.length, x, y)
  },

  /** Get the bounding box of any element by string ID. */
  getElementData(label: string): { x: number; y: number; width: number; height: number; found: boolean } {
    const encoded = new TextEncoder().encode(label)
    getLib().symbols.tge_clay_get_element_data(encoded, encoded.length, elementDataBuf)
    return {
      x: elementDataBuf[0],
      y: elementDataBuf[1],
      width: elementDataBuf[2],
      height: elementDataBuf[3],
      found: elementDataBuf[4] > 0.5,
    }
  },
}
