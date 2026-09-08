import { expect, test } from "bun:test"
import { join } from "node:path"

test("deletes only a layer image that was actually published", async () => {
  const root = join(import.meta.dir, "../../../..")
  const fixture = [
    'import { nativeEmitLayer, nativeDeleteLayer } from "./packages/engine/src/ffi/native-presentation-ops.ts"',
    "nativeDeleteLayer(911)",
    "const rgba = Uint8Array.from([255, 0, 0, 255])",
    'if (nativeEmitLayer(912, rgba, 1, 1, 0, 0, 0, "direct") === null) process.exit(2)',
    "nativeDeleteLayer(912)",
    "nativeDeleteLayer(912)",
  ].join(";\n")
  const child = Bun.spawn([process.execPath, "--conditions=browser", "-e", fixture], {
    cwd: root,
    env: { ...process.env, VEXART_NATIVE_PRESENTATION: "1" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  expect(exitCode, stderr).toBe(0)
  const deletes = [...stdout.matchAll(/\x1b_Ga=d,d=i,i=(\d+),q=2;\x1b\\/g)].map((match) => Number(match[1]))
  // The first delete is the native transport's stale-image guard before the
  // initial upload; the second is the one owned cleanup call. The repeated
  // cleanup must not emit another delete.
  expect(deletes).toEqual([912, 912])
  expect(stdout).toContain("a=T")
  expect(stdout).not.toContain("i=911")
})
