import { describe, expect, test } from "bun:test"
import { prepareNativeKittyShm, releaseNativeKittyShm } from "../output/kitty-shm-native"
import { buildTmuxShmQuery, probeTmuxShm } from "./tmux-shm"

const nativeShmAvailable = (() => {
  const name = `/vexart-test-${process.pid}-${Date.now().toString(36)}`
  try {
    const handle = prepareNativeKittyShm(name, new Uint8Array([0, 0, 0, 0]), 0o600)
    releaseNativeKittyShm(handle.handle, true)
    return true
  } catch {
    return false
  }
})()

describe("tmux SHM transport", () => {
  test("builds a wrapped-compatible SHM query", () => {
    const query = buildTmuxShmQuery(0x70000001, "/vexart-a")
    expect(query).toContain("i=1879048193,s=1,v=1,a=q,t=s,f=32;")
    expect(query.endsWith("\x1b\\")).toBe(true)
  })

  test.skipIf(!nativeShmAvailable)("accepts a fragmented OK acknowledgement and cleans up", async () => {
    let input: ((data: Buffer) => void) | null = null
    const writes: string[] = []
    const result = await probeTmuxShm((data) => {
      writes.push(data)
      const id = data.match(/i=(\d+)/)?.[1]
      if (id) queueMicrotask(() => {
        input?.(Buffer.from(`\x1b_Gi=${id};O`))
        input?.(Buffer.from(`K\x1b\\`))
      })
    }, (handler) => { input = handler }, (handler) => {
      if (input === handler) input = null
    }, 200)
    expect(result.status).toBe("OK")
    expect(result.queryId).toBeGreaterThan(0)
    expect(result.shmName.length).toBeLessThanOrEqual(31)
    expect(writes[0]).toStartWith("\x1bPtmux;\x1b\x1b_G")
  })

  test.skipIf(!nativeShmAvailable)("surfaces a rejected response and does not fall back", async () => {
    let input: ((data: Buffer) => void) | null = null
    await expect(probeTmuxShm((data) => {
      const id = data.match(/i=(\d+)/)?.[1]
      if (id) queueMicrotask(() => input?.(Buffer.from(`\x1b_Gi=${id};EINVAL\x1b\\`)))
    }, (handler) => { input = handler }, (handler) => {
      if (input === handler) input = null
    }, 200)).rejects.toThrow("requires Kitty SHM support through tmux")
  })

  test.skipIf(!nativeShmAvailable)("times out instead of selecting another transport", async () => {
    let input: ((data: Buffer) => void) | null = null
    await expect(probeTmuxShm(() => {}, (handler) => { input = handler }, (handler) => {
      if (input === handler) input = null
    }, 10)).rejects.toThrow("SHM query timed out")
  })
})
