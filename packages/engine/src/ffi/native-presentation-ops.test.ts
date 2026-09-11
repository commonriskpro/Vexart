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

test("advances frame counter and re-enables native presentation after circuit breaker cooldown", async () => {
  const root = join(import.meta.dir, "../../../..")
  const fixture = [
    'import { nativeEmitLayer, tickNativePresentationRecovery } from "./packages/engine/src/ffi/native-presentation-ops.ts"',
    'import { isNativePresentationEnabled, getNativePresentationFallbackReason } from "./packages/engine/src/ffi/native-presentation-flags.ts"',
    'const events = []',
    'events.push({ step: "initial", enabled: isNativePresentationEnabled() })',
    'const dummy = new Uint8Array(4)',
    'for (let i = 0; i < 3; i++) {',
    '  const res = nativeEmitLayer(920 + i, dummy, 0, 0, 0, 0, 0, "direct")',
    '  if (res !== null) process.exit(2)',
    '}',
    'events.push({ step: "tripped", enabled: isNativePresentationEnabled(), reason: getNativePresentationFallbackReason() })',
    'for (let i = 0; i < 299; i++) {',
    '  tickNativePresentationRecovery()',
    '}',
    'events.push({ step: "cooldown", enabled: isNativePresentationEnabled() })',
    'tickNativePresentationRecovery()',
    'events.push({ step: "recovered", enabled: isNativePresentationEnabled(), reason: getNativePresentationFallbackReason() })',
    'process.stdout.write("__CIRCUIT_BREAKER__" + JSON.stringify(events) + "\\n")',
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
  const line = stdout.split("\n").find((l) => l.startsWith("__CIRCUIT_BREAKER__"))
  expect(line).toBeDefined()
  const events = JSON.parse(line!.slice("__CIRCUIT_BREAKER__".length))
  expect(events[0]).toEqual({ step: "initial", enabled: true })
  expect(events[1].step).toBe("tripped")
  expect(events[1].enabled).toBe(false)
  expect(events[1].reason).toContain("3 consecutive failures")
  expect(events[1].reason).toContain("retry after 300 frames")
  expect(events[2]).toEqual({ step: "cooldown", enabled: false })
  expect(events[3]).toEqual({ step: "recovered", enabled: true, reason: null })
})
