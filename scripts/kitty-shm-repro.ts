/**
 * Minimal Kitty graphics protocol repro for local transmission media.
 *
 * This script intentionally does NOT use TGE's terminal/output stack.
 * It talks directly to Kitty using escape codes and Bun FFI for POSIX shm.
 *
 * Usage:
 *   bun scripts/kitty-shm-repro.ts
 */

import { dlopen, FFIType, ptr } from "bun:ffi"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

type ShmLib = {
  shm_open: (name: Uint8Array, flags: number, mode: number) => number
  shm_unlink: (name: Uint8Array) => number
  ftruncate: (fd: number, size: number) => number
  close: (fd: number) => number
  mmap: (addr: null, size: number, prot: number, flags: number, fd: number, offset: number) => number
  munmap: (addr: number, size: number) => number
  memcpy: (dst: number, src: number, n: number) => number
}

const O_CREAT = 0x200
const O_EXCL = 0x800
const O_RDWR = 0x2
const PROT_READ = 1
const PROT_WRITE = 2
const MAP_SHARED = 1

function loadShmLib(): ShmLib {
  const libName = process.platform === "darwin" ? "libSystem.B.dylib" : "librt.so"
  const lib = dlopen(libName, {
    shm_open: { args: [FFIType.ptr, FFIType.i32, FFIType.u32], returns: FFIType.i32 },
    shm_unlink: { args: [FFIType.ptr], returns: FFIType.i32 },
    ftruncate: { args: [FFIType.i32, FFIType.i64], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
    mmap: { args: [FFIType.ptr, FFIType.u64, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i64], returns: FFIType.ptr },
    munmap: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
    memcpy: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.ptr },
  }).symbols

  return {
    shm_open: (name: Uint8Array, flags: number, mode: number) => lib.shm_open(ptr(name), flags, mode),
    shm_unlink: (name: Uint8Array) => lib.shm_unlink(ptr(name)),
    ftruncate: lib.ftruncate,
    close: lib.close,
    mmap: (addr: null, size: number, prot: number, flags: number, fd: number, offset: number) => Number(lib.mmap(null, size, prot, flags, fd, offset)),
    munmap: (addr: number, size: number) => lib.munmap(addr, size),
    memcpy: (dst: number, src: number, n: number) => Number(lib.memcpy(dst, src, n)),
  }
}

function stripControl(input: string) {
  return input.replace(/\x1b\\/g, "<ESC\\>").replace(/\x1b/g, "<ESC>")
}

async function queryKitty(id: number, payload: string) {
  return await new Promise<string>((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw ?? false
    let done = false

    const finish = (value: string) => {
      if (done) return
      done = true
      stdin.off("data", onData)
      clearTimeout(timer)
      if (stdin.isTTY && !wasRaw) stdin.setRawMode(false)
      resolve(value)
    }

    const onData = (data: Buffer) => {
      const str = data.toString()
      if (str.includes(`_Gi=${id};`)) {
        finish(str)
      }
    }

    const timer = setTimeout(() => finish("<timeout>"), 2000)

    if (stdin.isTTY && !stdin.isRaw) stdin.setRawMode(true)
    stdin.resume()
    stdin.on("data", onData)
    process.stdout.write(payload)
  })
}

async function runShm() {
  const lib = loadShmLib()
  const id = 701
  const name = `/kitty-shm-repro-${process.pid}`
  const nameBytes = Buffer.from(name + "\0")
  const pixel = new Uint8Array([0, 0, 0, 0])

  try { lib.shm_unlink(nameBytes) } catch {}

  const fd = lib.shm_open(nameBytes, O_CREAT | O_EXCL | O_RDWR, 0o666)
  if (fd < 0) {
    return { mode: "shm", setup: { fd }, reply: "<shm_open failed>" }
  }

  lib.ftruncate(fd, pixel.length)
  const mapAddr = lib.mmap(null, pixel.length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)
  if (mapAddr === -1 || mapAddr === 0) {
    lib.close(fd)
    lib.shm_unlink(nameBytes)
    return { mode: "shm", setup: { fd, mapAddr }, reply: "<mmap failed>" }
  }

  lib.memcpy(mapAddr, Number(ptr(pixel)), pixel.length)

  const nameB64 = Buffer.from(name).toString("base64")
  const payload = `\x1b_Gi=${id},s=1,v=1,a=q,t=s,f=32;${nameB64}\x1b\\`
  const reply = await queryKitty(id, payload)
  lib.munmap(mapAddr, pixel.length)
  lib.close(fd)
  try { lib.shm_unlink(nameBytes) } catch {}
  return { mode: "shm", setup: { fd, mapAddr, name, nameB64 }, reply }
}

async function runFile() {
  const id = 702
  const filePath = path.join(os.tmpdir(), `tty-graphics-protocol-repro-${process.pid}`)
  fs.writeFileSync(filePath, new Uint8Array([0, 0, 0, 0]))
  const pathB64 = Buffer.from(filePath).toString("base64")
  const payload = `\x1b_Gi=${id},s=1,v=1,a=q,t=t,f=32;${pathB64}\x1b\\`
  const reply = await queryKitty(id, payload)
  return { mode: "file", setup: { filePath, pathB64 }, reply }
}

async function main() {
  if (!process.env.KITTY_WINDOW_ID) {
    console.error("Not running inside Kitty")
    process.exit(1)
  }

  console.error("[kitty-shm-repro] env", {
    TERM: process.env.TERM,
    KITTY_PID: process.env.KITTY_PID,
    KITTY_WINDOW_ID: process.env.KITTY_WINDOW_ID,
    TMUX: process.env.TMUX ?? null,
    SSH_CONNECTION: process.env.SSH_CONNECTION ?? null,
  })

  const shm = await runShm()
  console.error("[kitty-shm-repro] shm", {
    setup: shm.setup,
    reply: stripControl(shm.reply),
  })

  const file = await runFile()
  console.error("[kitty-shm-repro] file", {
    setup: file.setup,
    reply: stripControl(file.reply),
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
