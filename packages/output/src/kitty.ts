/**
 * Kitty graphics protocol — multi-mode image transmission.
 *
 * Supports three transmission modes, selected automatically:
 *   - t=s (shared memory) — POSIX shm_open, ~50 bytes TTY payload, ~0.01ms
 *   - t=f (mapped file)   — persistent mmap file + offset, low TTY payload
 *   - t=d (direct base64) — chunked escape codes, ~640KB payload, ~5-10ms
 *
 * The mode is transparent to callers — all functions accept a TransmissionMode
 * and route to the optimal path automatically.
 *
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import type { PixelBuffer } from "@tge/pixel"
import { deflateSync } from "node:zlib"

type RawImageData = {
  data: Uint8Array
  width: number
  height: number
}

const CHUNK_SIZE = 4096
const DEBUG_KITTY_PROBE = process.env.TGE_DEBUG_KITTY === "1" || process.env.TGE_DEBUG_KITTY_SHM === "1"

function probeDebug(message: string, extra?: unknown) {
  if (!DEBUG_KITTY_PROBE) return
  if (extra === undefined) {
    console.error(`[tge/kitty-probe] ${message}`)
    return
  }
  console.error(`[tge/kitty-probe] ${message}`, extra)
}

// ── Transmission Modes ──

export type TransmissionMode = "shm" | "file" | "direct"

const COMPRESS_MODE = {
  AUTO: "auto",
} as const

export type CompressMode = boolean | (typeof COMPRESS_MODE)["AUTO"]

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
  msync: (addr: number, size: number, flags: number) => number
  munmap: (addr: number, size: number) => number
  memcpy: (dst: number, src: number, n: number) => number
}

type PersistentFileTransport = {
  path: string
  pathB64: string
  fd: number
  mapAddr: number
  mappedSize: number
  slotSize: number
  slotCount: number
  activeSlot: number
}

// POSIX constants
const O_CREAT = 0x200
const O_RDWR = 0x2
const PROT_READ = 1
const PROT_WRITE = 2
const MAP_SHARED = 1
const FILE_SLOT_COUNT = 2
const FILE_MIN_SLOT_SIZE = 32 * 1024 * 1024
const MS_SYNC = 0x0010
const DIRECT_COMPRESS_THRESHOLD = 16 * 1024

let persistentFileTransport: PersistentFileTransport | null = null
let persistentFileGeneration = 0
let persistentFileCleanupInstalled = false
const retiredPersistentFilePaths = new Set<string>()

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
    msync: { args: [FFIType.ptr, FFIType.u64, FFIType.i32], returns: FFIType.i32 },
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
    msync: (addr: number, size: number, flags: number) => raw.msync(addr, size, flags),
    munmap: (addr: number, size: number) => raw.munmap(addr, size),
    memcpy: (dst: number, src: number, n: number) => Number(raw.memcpy(dst, src, n)),
  }
  return shmLib
}

/** Monotonic counter for unique shm/file names per process. */
let shmCounter = 0

function installPersistentFileCleanup() {
  if (persistentFileCleanupInstalled) return
  persistentFileCleanupInstalled = true
  process.once("exit", () => {
    destroyPersistentFileTransport(true)
    cleanupRetiredPersistentFiles()
  })
}

function cleanupRetiredPersistentFiles() {
  const fs = require("fs")
  for (const path of retiredPersistentFilePaths) {
    try {
      fs.unlinkSync(path)
    } catch {}
  }
  retiredPersistentFilePaths.clear()
}

function destroyPersistentFileTransport(unlinkCurrent = true) {
  if (!persistentFileTransport) return
  const fs = require("fs")
  const lib = loadShmLib()
  const transport = persistentFileTransport
  persistentFileTransport = null

  if (transport.mapAddr !== 0 && transport.mapAddr !== -1) {
    try {
      lib.munmap(transport.mapAddr, transport.mappedSize)
    } catch {}
  }

  try {
    fs.closeSync(transport.fd)
  } catch {}

  if (unlinkCurrent) {
    retiredPersistentFilePaths.add(transport.path)
  }
}

function nextPowerOfTwo(value: number) {
  let size = 1
  while (size < value) size *= 2
  return size
}

function ensurePersistentFileTransport(minPayloadSize: number): PersistentFileTransport {
  installPersistentFileCleanup()

  if (persistentFileTransport && minPayloadSize <= persistentFileTransport.slotSize) {
    return persistentFileTransport
  }

  destroyPersistentFileTransport(true)

  const fs = require("fs")
  const os = require("os")
  const path = require("path")
  const lib = loadShmLib()

  const slotSize = nextPowerOfTwo(Math.max(FILE_MIN_SLOT_SIZE, minPayloadSize))
  const mappedSize = slotSize * FILE_SLOT_COUNT
  const filePath = path.join(
    os.tmpdir(),
    `tty-graphics-protocol-tge-${process.pid}-${persistentFileGeneration++}.bin`,
  )
  const fd = fs.openSync(filePath, "w+", 0o600)
  fs.ftruncateSync(fd, mappedSize)
  const mapAddr = lib.mmap(null, mappedSize, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)

  if (mapAddr === -1 || mapAddr === 0) {
    try {
      fs.closeSync(fd)
    } catch {}
    try {
      fs.unlinkSync(filePath)
    } catch {}
    throw new Error(`Failed to mmap persistent Kitty file transport: ${filePath}`)
  }

  persistentFileTransport = {
    path: filePath,
    pathB64: Buffer.from(filePath).toString("base64"),
    fd,
    mapAddr,
    mappedSize,
    slotSize,
    slotCount: FILE_SLOT_COUNT,
    activeSlot: 0,
  }

  return persistentFileTransport
}

function writePersistentFilePayload(payload: Uint8Array) {
  const transport = ensurePersistentFileTransport(payload.length)
  const { ptr } = require("bun:ffi")
  const nextSlot = (transport.activeSlot + 1) % transport.slotCount
  const offset = nextSlot * transport.slotSize
  const dst = transport.mapAddr + offset
  const lib = loadShmLib()
  lib.memcpy(dst, Number(ptr(payload)), payload.length)
  lib.msync(dst, payload.length, MS_SYNC)
  transport.activeSlot = nextSlot
  return {
    offset,
    pathB64: transport.pathB64,
    size: payload.length,
  }
}

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
  const fd = lib.shm_open(nameBytes, O_CREAT | O_RDWR, 0o666)
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

// ── Persistent File Transmission (t=f) ──

/**
 * Transmit pixel buffer via a persistent mmap-backed regular file.
 *
 * 1. Reuse a pre-allocated tmp file that stays open for the process lifetime
 * 2. Copy payload into the inactive slot of the mmap region
 * 3. Send file path + offset + size to Kitty via t=f,S,O
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
  const payload = compress ? deflateSync(data) : data

  try {
    const filePayload = writePersistentFilePayload(payload)
    let meta = `a=${action},f=${format},i=${id},s=${buf.width},v=${buf.height},t=f,S=${filePayload.size},O=${filePayload.offset},q=2`
    if (compress) meta += `,o=z`
    if (z !== undefined) meta += `,z=${z}`
    write(`\x1b_G${meta};${filePayload.pathB64}\x1b\\`)
  } catch {
    // Fallback to direct if file write fails
    transmitDirect(write, buf, id, action, format, z, data, compress)
  }
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
 *   - "file":   persistent mapped file (fast, local only)
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
    /** Compression policy. auto compresses only when it is likely worth it. */
    compress?: CompressMode
  },
) {
  const action = opts?.action ?? "T"
  const format = opts?.format ?? 32
  const z = opts?.z
  const mode = opts?.mode ?? "direct"
  const data = format === 32 ? buf.data : stripAlpha(buf.data, buf.width * buf.height)
  const compress = resolveCompression(mode, data.length, opts?.compress ?? COMPRESS_MODE.AUTO)

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

/** Transmit raw RGBA/RGB bytes without constructing a PixelBuffer wrapper upstream. */
export function transmitRaw(
  write: (data: string) => void,
  image: RawImageData,
  id: number,
  opts?: {
    action?: "t" | "T" | "p"
    format?: 24 | 32
    z?: number
    mode?: TransmissionMode
    compress?: CompressMode
  },
) {
  const action = opts?.action ?? "T"
  const format = opts?.format ?? 32
  const z = opts?.z
  const mode = opts?.mode ?? "direct"
  const payload = format === 32 ? image.data : stripAlpha(image.data, image.width * image.height)
  const compress = resolveCompression(mode, payload.length, opts?.compress ?? COMPRESS_MODE.AUTO)
  const buf = { data: image.data, width: image.width, height: image.height, stride: image.width * 4 } satisfies PixelBuffer

  switch (mode) {
    case "shm":
      transmitShm(write, buf, id, action, format, z, payload, compress)
      break
    case "file":
      transmitFile(write, buf, id, action, format, z, payload, compress)
      break
    case "direct":
      transmitDirect(write, buf, id, action, format, z, payload, compress)
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
  opts?: { z?: number; mode?: TransmissionMode; compress?: CompressMode },
) {
  write(`\x1b7`) // save cursor
  write(`\x1b[${row + 1};${col + 1}H`) // move cursor
  transmit(write, buf, id, { action: "T", z: opts?.z, mode: opts?.mode, compress: opts?.compress })
  write(`\x1b8`) // restore cursor
}

/** Transmit + place raw RGBA/RGB bytes without a PixelBuffer intermediary. */
export function transmitRawAt(
  write: (data: string) => void,
  image: RawImageData,
  id: number,
  col: number,
  row: number,
  opts?: { z?: number; mode?: TransmissionMode; compress?: CompressMode; format?: 24 | 32 },
) {
  write(`\x1b7`)
  write(`\x1b[${row + 1};${col + 1}H`)
  transmitRaw(write, image, id, { action: "T", z: opts?.z, mode: opts?.mode, compress: opts?.compress, format: opts?.format })
  write(`\x1b8`)
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
  opts?: { mode?: TransmissionMode; compress?: CompressMode },
) {
  const mode = opts?.mode ?? "direct"
  const compress = resolveCompression(mode, regionData.length, opts?.compress ?? COMPRESS_MODE.AUTO)
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

      const fd = lib.shm_open(nameBytes, O_CREAT | O_RDWR, 0o666)
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
      try {
        const filePayload = writePersistentFilePayload(payload)
        write(`\x1b_G${meta},t=f,S=${filePayload.size},O=${filePayload.offset};${filePayload.pathB64}\x1b\\`)
      } catch {
        patchRegionDirect(write, meta, payload)
      }
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

    probeDebug("probeShm:start", { timeout })

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      probeDebug("probeShm:reply", { raw: JSON.stringify(str) })
      if (str.includes("_Gi=32;OK")) {
        probeDebug("probeShm:success")
        cleanup()
        resolve(true)
      } else if (str.includes("_Gi=32;")) {
        probeDebug("probeShm:negative-reply")
        cleanup()
        resolve(false)
      }
    }

    const timer = setTimeout(() => {
      probeDebug("probeShm:timeout")
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
      probeDebug("probeShm:shm_open", { fd, name })
      if (fd < 0) {
        probeDebug("probeShm:shm_open-failed")
        cleanup(); resolve(false); return
      }
      lib.ftruncate(fd, size)

      const mapAddr = lib.mmap(null, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)
      probeDebug("probeShm:mmap", { mapAddr, size })
      if (mapAddr === -1 || mapAddr === 0) {
        lib.close(fd)
        lib.shm_unlink(nameBytes)
        probeDebug("probeShm:mmap-failed")
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
      probeDebug("probeShm:query-sent", { name, nameB64 })
      write(`\x1b_Gi=32,s=1,v=1,a=q,t=s,f=32;${nameB64}\x1b\\`)
    } catch (error) {
      probeDebug("probeShm:exception", error)
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

    probeDebug("probeFile:start", { timeout })

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      probeDebug("probeFile:reply", { raw: JSON.stringify(str) })
      if (str.includes("_Gi=33;OK")) {
        probeDebug("probeFile:success")
        cleanup()
        resolve(true)
      } else if (str.includes("_Gi=33;")) {
        probeDebug("probeFile:negative-reply")
        cleanup()
        resolve(false)
      }
    }

    const timer = setTimeout(() => {
      probeDebug("probeFile:timeout")
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
      probeDebug("probeFile:query-sent", { filePath, pathB64 })
      write(`\x1b_Gi=33,s=1,v=1,a=q,t=t,f=32;${pathB64}\x1b\\`)
    } catch (error) {
      probeDebug("probeFile:exception", error)
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

function resolveCompression(mode: TransmissionMode, dataSize: number, compress: CompressMode) {
  if (compress === true || compress === false) return compress
  if (mode !== "direct") return false
  return dataSize >= DIRECT_COMPRESS_THRESHOLD
}
