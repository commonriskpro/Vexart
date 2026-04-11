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
  const candidates = [
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
  tge_clay_configure_sizing:    { args: [FFIType.u8, FFIType.f32, FFIType.u8, FFIType.f32], returns: FFIType.void },
  tge_clay_configure_rectangle: { args: [FFIType.u32, FFIType.f32], returns: FFIType.void },
  tge_clay_configure_border:    { args: [FFIType.u32, FFIType.u16], returns: FFIType.void },
  tge_clay_text:                { args: [FFIType.ptr, FFIType.i32, FFIType.u32, FFIType.u16, FFIType.u16], returns: FFIType.void },
  tge_clay_set_id:              { args: [FFIType.ptr, FFIType.i32], returns: FFIType.void },
  tge_clay_read_commands:       { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  tge_clay_read_text:           { args: [FFIType.i32, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  tge_clay_set_pointer:         { args: [FFIType.f32, FFIType.f32, FFIType.i32], returns: FFIType.void },
  tge_clay_update_scroll:       { args: [FFIType.f32, FFIType.f32, FFIType.f32], returns: FFIType.void },
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

  /** Configure border. Color is packed u32 RGBA. */
  configureBorder(color: number, width: number) {
    getLib().symbols.tge_clay_configure_border(color, width)
  },

  /** Add a text element (leaf node — opens and closes itself). */
  text(content: string, color: number, fontId = 0, fontSize = 16) {
    const encoded = new TextEncoder().encode(content)
    getLib().symbols.tge_clay_text(encoded, encoded.length, color, fontId, fontSize)
  },

  /** Set pointer position for hover detection. */
  setPointer(x: number, y: number, pressed: boolean) {
    getLib().symbols.tge_clay_set_pointer(x, y, pressed ? 1 : 0)
  },

  /** Update scroll containers. */
  updateScroll(dx: number, dy: number, dt: number) {
    getLib().symbols.tge_clay_update_scroll(dx, dy, dt)
  },
}
