import { expect, test } from "bun:test"
import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi"
import { inflateSync } from "node:zlib"

// Real producer, GPU, POSIX SHM and consumer syscalls. The consumer deliberately
// lags; no renderer/native function is replaced by a mock.
test("owned SHM retains delayed pixels, coalesces pending frames and labels expanded zlib", async () => {
  const libc = dlopen(process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", {
    shm_open: { args: [FFIType.ptr, FFIType.i32, FFIType.u32], returns: FFIType.i32 },
    shm_unlink: { args: [FFIType.ptr], returns: FFIType.i32 },
    mmap: { args: [FFIType.ptr, FFIType.u64, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i64], returns: FFIType.ptr },
    munmap: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
  })
  const source = `
    import { createKittyShmPresentation } from "./packages/engine/src/ffi/tmux-shm-presentation.ts";
    import { vexartUploadImage, vexartRemoveImage, vexartCompositeRenderImageLayer, vexartCompositeTargetCreate, vexartCompositeTargetBeginLayer, vexartCompositeTargetEndLayer, vexartCompositeTargetDestroy } from "./packages/engine/src/ffi/gpu-composite-ops.ts";
    const target = vexartCompositeTargetCreate(1n, 1, 1);
    const controller = createKittyShmPresentation();
    const frame = { context: 1n, target, width: 1, height: 1, cols: 1, rows: 1, transmissionMode: "shm" };
    const paint = color => {
      const bytes = new Uint8Array([color >>> 24, (color >>> 16) & 255, (color >>> 8) & 255, color & 255]);
      const image = vexartUploadImage(1n, bytes, 1, 1);
      vexartCompositeTargetBeginLayer(1n, target, 0, 0);
      vexartCompositeRenderImageLayer(1n, target, image, 0, 0, 1, 1, 0, 0);
      vexartCompositeTargetEndLayer(1n, target);
      vexartRemoveImage(1n, image);
      controller.present(frame);
    };
    try {
      paint(0xff0000ff);
      paint(0x00ff00ff);
      paint(0x0000ffff);
      await controller.waitForDrain();
    } finally {
      controller.destroy();
      vexartCompositeTargetDestroy(1n, target);
    }
  `
  const child = Bun.spawn([process.execPath, "--conditions=browser", "-e", source], {
    cwd: import.meta.dir + "/../../../..", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, VEXART_KITTY_SHM_COMPRESSION: "1" },
  })
  const pixels: number[][] = []
  const names: string[] = []
  const reader = child.stdout.getReader()
  const stderr = new Response(child.stderr).text()
  let pending = ""
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      pending += Buffer.from(next.value).toString()
      const sequences = /\x1b_G([^;]*);([^\x1b]*)\x1b\\/g
      let consumed = 0
      for (const match of pending.matchAll(sequences)) {
        consumed = match.index + match[0].length
        if (!match[1].includes("t=s")) continue
        expect(match[1]).toContain("o=z")
        const name = Buffer.from(match[2], "base64").toString()
        names.push(name)
        const size = Number(/(?:^|,)S=(\d+)/.exec(match[1])?.[1])
        expect(size).toBeGreaterThan(4)
        // A delayed terminal must still be able to open the published name.
        await Bun.sleep(30)
        const encoded = Buffer.from(name + "\0")
        const fd = libc.symbols.shm_open(ptr(encoded), 0, 0)
        expect(fd).toBeGreaterThanOrEqual(0)
        const mapping = libc.symbols.mmap(null, size, 1, 1, fd, 0)
        try {
          if (!mapping || mapping === Number(0xffffffffffffffffn)) throw new Error("consumer mmap failed")
          const bytes = new Uint8Array(toArrayBuffer(mapping, 0, size)).slice()
          pixels.push([...inflateSync(bytes)])
          expect(libc.symbols.shm_unlink(ptr(encoded))).toBe(0)
        } finally {
          if (mapping && mapping !== Number(0xffffffffffffffffn)) libc.symbols.munmap(mapping, size)
          libc.symbols.close(fd)
        }
      }
      pending = pending.slice(consumed)
    }
    expect(await child.exited).toBe(0)
    expect(await stderr).toBe("")
    expect(pixels).toEqual([[255, 0, 0, 255], [0, 0, 255, 255]])
    expect(new Set(names).size).toBe(2)
    for (const name of names) {
      expect(libc.symbols.shm_open(ptr(Buffer.from(name + "\0")), 0, 0)).toBe(-1)
    }
  } finally {
    child.kill()
    for (const name of names) libc.symbols.shm_unlink(ptr(Buffer.from(name + "\0")))
    libc.close()
  }
})
