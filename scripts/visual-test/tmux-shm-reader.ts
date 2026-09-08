/**
 * Small, test-only POSIX SHM reader for the tmux parity harness.
 *
 * The child process creates the object and keeps its native descriptor open
 * until this parent has consumed it.  This is intentionally a receiver, not
 * a Kitty or terminal implementation: it validates the object metadata,
 * reads exactly one raw RGBA frame, and unlinks only the name emitted by the
 * child.
 */

import { dlopen, FFIType, ptr } from "bun:ffi"
import { fstatSync } from "node:fs"

type ShmSymbols = {
  shm_open: (name: Uint8Array, flags: number, mode: number) => number
  mmap: (size: number, fd: number) => number
  munmap: (address: number, size: number) => number
  memcpy: (destination: Uint8Array, source: number, size: number) => number
  shm_unlink: (name: Uint8Array) => number
  close: (fd: number) => number
}

const SHM_NAME = /^\/vx-[0-9a-f]+-[0-9a-f]+$/
const O_RDONLY = 0

function loadSymbols(): ShmSymbols {
  const library = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6"
  const symbols = dlopen(library, {
    shm_open: { args: [FFIType.ptr, FFIType.i32, FFIType.u32], returns: FFIType.i32 },
    // An integer return keeps MAP_FAILED (-1) distinguishable from a valid
    // mapped address on platforms where a pointer FFI return is unsigned.
    mmap: { args: [FFIType.ptr, FFIType.u64, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i64], returns: FFIType.i64 },
    munmap: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
    memcpy: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.ptr },
    shm_unlink: { args: [FFIType.ptr], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
  }).symbols
  return {
    shm_open: (name, flags, mode) => symbols.shm_open(ptr(name), flags, mode) as number,
    mmap: (size, fd) => Number(symbols.mmap(null, size, 1, 1, fd, 0)),
    munmap: (address, size) => symbols.munmap(address, size) as number,
    memcpy: (destination, source, size) => Number(symbols.memcpy(ptr(destination), source, size)),
    shm_unlink: (name) => symbols.shm_unlink(ptr(name)) as number,
    close: (fd) => symbols.close(fd) as number,
  }
}

let symbols: ShmSymbols | null = null

function getSymbols(): ShmSymbols {
  return symbols ??= loadSymbols()
}

function nameBytes(name: string): Uint8Array {
  return Uint8Array.from(Buffer.from(`${name}\0`, "utf8"))
}

function fail(message: string): never {
  throw new Error(`tmux SHM receiver: ${message}`)
}

/** Validate the short native name before any destructive operation. */
export function isOwnedTmuxShmName(name: string): boolean {
  return SHM_NAME.test(name)
}

export type TmuxShmRead = {
  name: string
  mode: number
  size: number
  rgba: Uint8Array
}

/** Validate the decoder-side raw frame contract before pixel comparison. */
export function validateRawRgbaFrame(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const expected = width * height * 4
  if (!Number.isSafeInteger(expected) || expected <= 0) fail("RGBA dimensions are invalid")
  if (rgba.byteLength !== expected) fail(`raw SHM frame has ${rgba.byteLength} bytes, expected ${expected}`)
  return rgba
}

/** Open, validate, consume, and unlink one native object. */
export function readAndUnlinkTmuxShm(name: string, expectedBytes: number): TmuxShmRead {
  if (!isOwnedTmuxShmName(name)) fail(`refusing SHM name outside native /vx-* namespace: ${JSON.stringify(name)}`)
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) fail("expected RGBA byte count is invalid")

  const api = getSymbols()
  const encoded = nameBytes(name)
  const fd = api.shm_open(encoded, O_RDONLY, 0)
  if (fd < 0) fail(`shm_open failed for ${name}`)
  let closed = false
  let unlinked = false
  try {
    const metadata = fstatSync(fd)
    if ((metadata.mode & 0o777) !== 0o600) fail(`${name} has mode ${(metadata.mode & 0o777).toString(8)}, expected 600`)
    // POSIX SHM may round the object allocation up to a page.  The Kitty
    // header's S field is the authoritative raw RGBA length; reject short
    // objects but read only that exact frame-sized prefix.
    if (metadata.size < expectedBytes) fail(`${name} has ${metadata.size} bytes, expected at least ${expectedBytes}`)
    const rgba = new Uint8Array(expectedBytes)
    const mapped = api.mmap(expectedBytes, fd)
    if (!Number.isSafeInteger(mapped) || mapped <= 0) fail(`${name} mmap failed`)
    try {
      api.memcpy(rgba, mapped, expectedBytes)
    } finally {
      if (api.munmap(mapped, expectedBytes) !== 0) fail(`${name} mmap cleanup failed`)
    }
    if (api.close(fd) !== 0) fail(`close failed for ${name}`)
    closed = true
    if (api.shm_unlink(encoded) !== 0) fail(`shm_unlink failed for ${name}`)
    unlinked = true
    return { name, mode: metadata.mode & 0o777, size: metadata.size, rgba }
  } finally {
    if (!closed) api.close(fd)
    // A failed read still owns this validated native name.  Best-effort
    // cleanup is safe here and never broadens to a directory scan.
    if (!unlinked) api.shm_unlink(encoded)
  }
}
