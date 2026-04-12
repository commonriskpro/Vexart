/**
 * Kitty graphics protocol — multi-mode image transmission.
 *
 * Supports three transmission modes, selected automatically:
 *   - t=s (shared memory) — POSIX shm_open, ~50 bytes TTY payload, ~0.01ms
 *   - t=t (temp file)     — write to /tmp, ~80 bytes TTY payload, ~1-2ms
 *   - t=d (direct base64) — chunked escape codes, ~640KB payload, ~5-10ms
 *
 * The mode is transparent to callers — all functions accept a TransmissionMode
 * and route to the optimal path automatically.
 *
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import type { PixelBuffer } from "@tge/pixel"
import { deflateSync } from "node:zlib"

const CHUNK_SIZE = 4096

// ── Transmission Modes ──

export type TransmissionMode = "shm" | "file" | "direct"

/**
 * POSIX shared memory FFI bindings (lazy-loaded).
 * Only initialized when shm mode is actually used.
 */
let shmLib: ShmLib | null = null

type ShmLib = {
  shm_open: (name: Uint8Array, flags: number, mode: number) => number
  shm_unlink: (name: Uint8Array) => number
  ftruncate: (fd: number, size: number) => number
  close: (fd: number) => number
  mmap: (addr: null, size: number, prot: number, flags: number, fd: number, offset: number) => number
  munmap: (addr: number, size: number) => number
  memcpy: (dst: number, src: number, n: number) => number
}

// POSIX constants
const O_CREAT = 0x200
const O_RDWR = 0x2
const PROT_READ = 1
const PROT_WRITE = 2
const MAP_SHARED = 1

function loadShmLib(): ShmLib {
  if (shmLib) return shmLib
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dlopen, FFIType, ptr } = require("bun:ffi")
  const libName = process.platform === "darwin" ? "libSystem.B.dylib" : "librt.so"
  const lib = dlopen(libName, {
    shm_open: { args: [FFIType.ptr, FFIType.i32, FFIType.u32], returns: FFIType.i32 },
    shm_unlink: { args: [FFIType.ptr], returns: FFIType.i32 },
    ftruncate: { args: [FFIType.i32, FFIType.i64], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
    mmap: { args: [FFIType.ptr, FFIType.u64, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i64], returns: FFIType.ptr },
    munmap: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
    memcpy: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.ptr },
  })

  // Wrap symbols to handle Buffer→ptr conversion for cstring args
  const raw = lib.symbols
  shmLib = {
    shm_open: (name: Uint8Array, flags: number, mode: number) => raw.shm_open(ptr(name), flags, mode),
    shm_unlink: (name: Uint8Array) => raw.shm_unlink(ptr(name)),
    ftruncate: raw.ftruncate,
    close: raw.close,
    mmap: (addr: null, size: number, prot: number, flags: number, fd: number, offset: number) =>
      Number(raw.mmap(null, size, prot, flags, fd, offset)),
    munmap: (addr: number, size: number) => raw.munmap(addr, size),
    memcpy: (dst: number, src: number, n: number) => Number(raw.memcpy(dst, src, n)),
  }
  return shmLib
}

/** Monotonic counter for unique shm/file names per process. */
let shmCounter = 0

// ── Shared Memory Transmission (t=s) ──

/**
 * Transmit pixel buffer via POSIX shared memory.
 *
 * 1. shm_open() creates a named memory segment
 * 2. ftruncate() + mmap() + memcpy() writes pixel data
 * 3. Sends ~50 byte escape code with shm name to terminal
 * 4. Terminal reads from shm, then unlinks it (per Kitty spec)
 */
function transmitShm(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  action: string,
  format: number,
  z: number | undefined,
  data: Uint8Array,
  compress: boolean,
) {
  const lib = loadShmLib()
  const { ptr } = require("bun:ffi")
  const name = `/tge-gfx-${process.pid}-${shmCounter++}`
  const nameBytes = Buffer.from(name + "\0")
  const payload = compress ? deflateSync(data) : data
  const size = payload.length

  // Create shared memory segment
  const fd = lib.shm_open(nameBytes, O_CREAT | O_RDWR, 0o600)
  if (fd < 0) {
    // Fallback to direct if shm fails
    transmitDirect(write, buf, id, action, format, z, data, compress)
    return
  }

  // Set size and map into memory
  if (lib.ftruncate(fd, size) !== 0) {
    lib.close(fd)
    lib.shm_unlink(nameBytes)
    transmitDirect(write, buf, id, action, format, z, data, compress)
    return
  }

  const mapAddr = lib.mmap(null, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)
  if (mapAddr === -1 || mapAddr === 0) {
    lib.close(fd)
    lib.shm_unlink(nameBytes)
    transmitDirect(write, buf, id, action, format, z, data, compress)
    return
  }

  // Copy (possibly compressed) pixel data to shared memory
  lib.memcpy(mapAddr, Number(ptr(payload)), size)

  // Cleanup mmap and fd — terminal will read from shm name and unlink it
  lib.munmap(mapAddr, size)
  lib.close(fd)

  // Send escape code with shm name (base64 encoded)
  const nameB64 = Buffer.from(name).toString("base64")
  let meta = `a=${action},f=${format},i=${id},s=${buf.width},v=${buf.height},t=s,q=2`
  if (compress) meta += `,o=z`
  if (z !== undefined) meta += `,z=${z}`
  write(`\x1b_G${meta};${nameB64}\x1b\\`)
}

// ── Temp File Transmission (t=t) ──

/**
 * Transmit pixel buffer via temporary file.
 *
 * 1. Write pixel data to /tmp/tty-graphics-protocol-*
 * 2. Send ~80 byte escape code with file path to terminal
 * 3. Terminal reads file and deletes it (t=t means auto-delete)
 *
 * The filename MUST contain "tty-graphics-protocol" per Kitty spec.
 */
function transmitFile(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  action: string,
  format: number,
  z: number | undefined,
  data: Uint8Array,
  compress: boolean,
) {
  const os = require("os")
  const path = require("path")
  const fs = require("fs")

  const tmpDir = os.tmpdir()
  const fileName = `tty-graphics-protocol-${process.pid}-${shmCounter++}`
  const filePath = path.join(tmpDir, fileName)
  const payload = compress ? deflateSync(data) : data

  try {
    fs.writeFileSync(filePath, payload)
  } catch {
    // Fallback to direct if file write fails
    transmitDirect(write, buf, id, action, format, z, data, compress)
    return
  }

  // Send escape code with file path (base64 encoded)
  const pathB64 = Buffer.from(filePath).toString("base64")
  let meta = `a=${action},f=${format},i=${id},s=${buf.width},v=${buf.height},t=t,q=2`
  if (compress) meta += `,o=z`
  if (z !== undefined) meta += `,z=${z}`
  write(`\x1b_G${meta};${pathB64}\x1b\\`)
}

// ── Direct Transmission (t=d) — existing chunked base64 ──

function transmitDirect(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  action: string,
  format: number,
  z: number | undefined,
  data: Uint8Array,
  compress: boolean,
) {
  const payload = compress ? deflateSync(data) : data
  const b64 = Buffer.from(payload).toString("base64")
  const chunks = chunk(b64)
  if (chunks.length === 0) return

  let meta = `a=${action},f=${format},i=${id},s=${buf.width},v=${buf.height},q=2`
  if (compress) meta += `,o=z`
  if (z !== undefined) meta += `,z=${z}`

  if (chunks.length === 1) {
    write(`\x1b_G${meta};${chunks[0]}\x1b\\`)
    return
  }

  write(`\x1b_G${meta},m=1;${chunks[0]}\x1b\\`)
  for (let i = 1; i < chunks.length - 1; i++) {
    write(`\x1b_Gm=1;${chunks[i]}\x1b\\`)
  }
  write(`\x1b_Gm=0;${chunks[chunks.length - 1]}\x1b\\`)
}

// ── Public API ──

/**
 * Transmit a pixel buffer as a Kitty graphics image.
 *
 * Routes to the optimal transmission path based on mode:
 *   - "shm":    POSIX shared memory (fastest, local only)
 *   - "file":   temp file (fast, local only)
 *   - "direct": base64 escape codes (universal, slowest)
 */
export function transmit(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  opts?: {
    action?: "t" | "T" | "p"
    format?: 24 | 32
    z?: number
    mode?: TransmissionMode
    /** Enable zlib compression (o=z). Reduces payload ~3-970x depending on content. */
    compress?: boolean
  },
) {
  const action = opts?.action ?? "T"
  const format = opts?.format ?? 32
  const z = opts?.z
  const mode = opts?.mode ?? "direct"
  const compress = opts?.compress ?? false
  const data = format === 32 ? buf.data : stripAlpha(buf.data, buf.width * buf.height)

  switch (mode) {
    case "shm":
      transmitShm(write, buf, id, action, format, z, data, compress)
      break
    case "file":
      transmitFile(write, buf, id, action, format, z, data, compress)
      break
    case "direct":
      transmitDirect(write, buf, id, action, format, z, data, compress)
      break
  }
}

/** Place an already-transmitted image at a cell position. */
export function place(
  write: (data: string) => void,
  id: number,
  col: number,
  row: number,
  opts?: { z?: number; placementId?: number },
) {
  const z = opts?.z
  const p = opts?.placementId
  let params = `a=p,i=${id},C=1,q=2`
  if (z !== undefined) params += `,z=${z}`
  if (p !== undefined) params += `,p=${p}`
  write(`\x1b[${row + 1};${col + 1}H`)
  write(`\x1b_G${params};AAAA\x1b\\`)
}

/**
 * Transmit + place in one operation. Moves cursor, transmits at position.
 * With z-index support for layer compositing.
 */
export function transmitAt(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  col: number,
  row: number,
  opts?: { z?: number; mode?: TransmissionMode; compress?: boolean },
) {
  write(`\x1b7`) // save cursor
  write(`\x1b[${row + 1};${col + 1}H`) // move cursor
  transmit(write, buf, id, { action: "T", z: opts?.z, mode: opts?.mode, compress: opts?.compress })
  write(`\x1b8`) // restore cursor
}

/**
 * Patch a region of an already-transmitted image using animation frame (a=f).
 *
 * Uses Kitty's animation frame protocol to update a sub-rectangle of an
 * existing image. The terminal composites the new data over the existing frame.
 *
 * @param regionData — raw RGBA pixel data for the dirty region only
 * @param rx, ry — offset within the image where the patch starts
 * @param rw, rh — dimensions of the patch region
 *
 * Experimental: requires the image to have been transmitted at least once.
 */
export function patchRegion(
  write: (data: string) => void,
  id: number,
  regionData: Uint8Array,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  opts?: { mode?: TransmissionMode; compress?: boolean },
) {
  const mode = opts?.mode ?? "direct"
  const compress = opts?.compress ?? false
  const payload = compress ? deflateSync(regionData) : regionData

  // Build metadata: a=f (frame data), r=1 (edit frame 1 = root frame),
  // x,y = offset in image, s,v = region dimensions, X=1 (replace, not blend)
  let meta = `a=f,i=${id},r=1,x=${rx},y=${ry},s=${rw},v=${rh},f=32,X=1,q=2`
  if (compress) meta += `,o=z`

  switch (mode) {
    case "shm": {
      const lib = loadShmLib()
      const { ptr } = require("bun:ffi")
      const name = `/tge-patch-${process.pid}-${shmCounter++}`
      const nameBytes = Buffer.from(name + "\0")
      const size = payload.length

      const fd = lib.shm_open(nameBytes, O_CREAT | O_RDWR, 0o600)
      if (fd < 0) {
        patchRegionDirect(write, meta, payload)
        return
      }
      lib.ftruncate(fd, size)
      const mapAddr = lib.mmap(null, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)
      if (mapAddr === -1 || mapAddr === 0) {
        lib.close(fd); lib.shm_unlink(nameBytes)
        patchRegionDirect(write, meta, payload)
        return
      }
      lib.memcpy(mapAddr, Number(ptr(payload)), size)
      lib.munmap(mapAddr, size)
      lib.close(fd)
      const nameB64 = Buffer.from(name).toString("base64")
      write(`\x1b_G${meta},t=s;${nameB64}\x1b\\`)
      break
    }
    case "file": {
      const os = require("os")
      const path = require("path")
      const fs = require("fs")
      const filePath = path.join(os.tmpdir(), `tty-graphics-protocol-${process.pid}-${shmCounter++}`)
      try {
        fs.writeFileSync(filePath, payload)
      } catch {
        patchRegionDirect(write, meta, payload)
        return
      }
      const pathB64 = Buffer.from(filePath).toString("base64")
      write(`\x1b_G${meta},t=t;${pathB64}\x1b\\`)
      break
    }
    case "direct":
      patchRegionDirect(write, meta, payload)
      break
  }
}

function patchRegionDirect(write: (data: string) => void, meta: string, payload: Uint8Array) {
  const b64 = Buffer.from(payload).toString("base64")
  const chunks = chunk(b64)
  if (chunks.length === 0) return

  if (chunks.length === 1) {
    write(`\x1b_G${meta};${chunks[0]}\x1b\\`)
    return
  }
  write(`\x1b_G${meta},m=1;${chunks[0]}\x1b\\`)
  for (let i = 1; i < chunks.length - 1; i++) {
    write(`\x1b_Ga=f,m=1;${chunks[i]}\x1b\\`)
  }
  write(`\x1b_Ga=f,m=0;${chunks[chunks.length - 1]}\x1b\\`)
}

/** Delete an image by ID. */
export function remove(write: (data: string) => void, id: number) {
  write(`\x1b_Ga=d,d=i,i=${id},q=2;\x1b\\`)
}

/** Delete all images. */
export function clearAll(write: (data: string) => void) {
  write(`\x1b_Ga=d,d=a,q=2;\x1b\\`)
}

// ── Probing ──

/**
 * Probe if the terminal supports shared memory transmission.
 *
 * Creates a tiny 1x1 shm segment, sends a query action (a=q),
 * and checks if terminal responds with OK.
 */
export function probeShm(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      if (str.includes("_Gi=32;OK")) {
        cleanup()
        resolve(true)
      } else if (str.includes("_Gi=32;")) {
        cleanup()
        resolve(false)
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeout)

    onData(handler)

    // Create a 1x1 RGBA shm segment for probing
    try {
      const lib = loadShmLib()
      const { ptr } = require("bun:ffi")
      const name = `/tge-probe-${process.pid}`
      const nameBytes = Buffer.from(name + "\0")
      const size = 4 // 1x1 RGBA

      const fd = lib.shm_open(nameBytes, O_CREAT | O_RDWR, 0o600)
      if (fd < 0) { cleanup(); resolve(false); return }
      lib.ftruncate(fd, size)

      const mapAddr = lib.mmap(null, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)
      if (mapAddr === -1 || mapAddr === 0) {
        lib.close(fd)
        lib.shm_unlink(nameBytes)
        cleanup()
        resolve(false)
        return
      }

      // Write 1 transparent pixel
      const pixel = new Uint8Array([0, 0, 0, 0])
      lib.memcpy(mapAddr, Number(ptr(pixel)), 4)
      lib.munmap(mapAddr, size)
      lib.close(fd)

      // Send query — terminal will try to read from shm, respond OK or error
      // Terminal will shm_unlink after reading (per spec)
      const nameB64 = Buffer.from(name).toString("base64")
      write(`\x1b_Gi=32,s=1,v=1,a=q,t=s,f=32;${nameB64}\x1b\\`)
    } catch {
      cleanup()
      resolve(false)
    }
  })
}

/**
 * Probe if the terminal supports temp file transmission.
 *
 * Writes a 1x1 pixel to a temp file, sends a query action (a=q),
 * and checks if terminal responds with OK.
 */
export function probeFile(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  timeout = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      if (str.includes("_Gi=33;OK")) {
        cleanup()
        resolve(true)
      } else if (str.includes("_Gi=33;")) {
        cleanup()
        resolve(false)
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeout)

    onData(handler)

    try {
      const os = require("os")
      const path = require("path")
      const fs = require("fs")

      const filePath = path.join(os.tmpdir(), `tty-graphics-protocol-probe-${process.pid}`)
      const pixel = new Uint8Array([0, 0, 0, 0])
      fs.writeFileSync(filePath, pixel)

      const pathB64 = Buffer.from(filePath).toString("base64")
      write(`\x1b_Gi=33,s=1,v=1,a=q,t=t,f=32;${pathB64}\x1b\\`)
    } catch {
      cleanup()
      resolve(false)
    }
  })
}

// ── Helpers ──

function stripAlpha(data: Uint8Array, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    out[i * 3] = data[i * 4]
    out[i * 3 + 1] = data[i * 4 + 1]
    out[i * 3 + 2] = data[i * 4 + 2]
  }
  return out
}

function chunk(str: string): string[] {
  const result: string[] = []
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    result.push(str.slice(i, i + CHUNK_SIZE))
  }
  return result
}
