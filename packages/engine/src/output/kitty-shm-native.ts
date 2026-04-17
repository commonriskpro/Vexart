import { dlopen, FFIType, ptr } from "bun:ffi"
import { resolve } from "node:path"

const HELPER_NAMES: Record<string, string> = {
  darwin: "libtge_kitty_shm_helper.dylib",
  linux: "libtge_kitty_shm_helper.so",
  win32: "tge_kitty_shm_helper.dll",
}

const HELPER_DEFS = {
  tge_kitty_shm_helper_version: { args: [], returns: FFIType.u32 },
  tge_kitty_shm_get_last_error_length: { args: [], returns: FFIType.u32 },
  tge_kitty_shm_copy_last_error: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
  tge_kitty_shm_prepare: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.u32], returns: FFIType.u64 },
  tge_kitty_shm_release: { args: [FFIType.u64, FFIType.u32], returns: FFIType.u32 },
} as const

type KittyShmLib = ReturnType<typeof dlopen<typeof HELPER_DEFS>>

let helperLib: KittyShmLib | null = null

function findHelperLib() {
  const name = HELPER_NAMES[process.platform] ?? "libtge_kitty_shm_helper.so"
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const target = `${arch}-${process.platform}`
  const candidates = [
    resolve(import.meta.dir, "vendor/kitty-shm", target, name),
    resolve(import.meta.dir, "../../../native/kitty-shm-helper/build", name),
    resolve(process.cwd(), "native/kitty-shm-helper/build", name),
  ]
  for (const path of candidates) {
    try {
      if (Bun.file(path).size > 0) return path
    } catch {}
  }
  return candidates[0]
}

function loadHelper() {
  if (helperLib) return helperLib
  helperLib = dlopen(findHelperLib(), HELPER_DEFS)
  return helperLib
}

function readLastError() {
  const lib = loadHelper()
  const len = lib.symbols.tge_kitty_shm_get_last_error_length()
  if (len === 0) return "unknown kitty shm helper error"
  const buf = Buffer.alloc(len + 1)
  lib.symbols.tge_kitty_shm_copy_last_error(ptr(buf), buf.length)
  return buf.toString("utf8").replace(/\0+$/, "")
}

export interface NativeKittyShmHandle {
  handle: number
  name: string
}

export function prepareNativeKittyShm(name: string, data: Uint8Array, mode = 0o666): NativeKittyShmHandle {
  const lib = loadHelper()
  const nameBytes = Buffer.from(name + "\0")
  const handle = Number(lib.symbols.tge_kitty_shm_prepare(ptr(nameBytes), ptr(data), data.length, mode))
  if (!handle) {
    throw new Error(readLastError())
  }
  return { handle, name }
}

export function releaseNativeKittyShm(handle: number, unlinkName: boolean) {
  if (!handle) return
  const lib = loadHelper()
  const status = lib.symbols.tge_kitty_shm_release(handle, unlinkName ? 1 : 0)
  if (status !== 0) {
    throw new Error(readLastError())
  }
}

export function getNativeKittyShmHelperVersion() {
  return loadHelper().symbols.tge_kitty_shm_helper_version()
}
