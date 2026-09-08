import { createTerminal } from "../../packages/engine/src/terminal/index"
import { createRenderLoop } from "../../packages/engine/src/loop/loop"
import { createNode, insertChild } from "../../packages/engine/src/ffi/node"
import { setProp } from "../../packages/engine/src/reconciler/reconciler"
import { markDirty } from "../../packages/engine/src/reconciler/dirty"
import { getRendererBackend } from "../../packages/engine/src/ffi/renderer-backend"
import {
  waitForTmuxPresentationForTest,
  getLastNativePresentationStatsForTest,
} from "../../packages/engine/src/ffi/gpu-renderer-backend"

const out = process.argv[2]
if (!out) throw new Error("fixture requires an artifact directory")
const mode = process.argv[3] ?? "normal"

const reports: unknown[] = []
let terminal: Awaited<ReturnType<typeof createTerminal>> | undefined
let loop: ReturnType<typeof createRenderLoop> | undefined

try {
  terminal = await createTerminal({ skipColors: true, probeTimeout: 1000 })
  if (terminal.caps.transmissionMode !== "shm") throw new Error("runtime did not select SHM")
  loop = createRenderLoop(terminal, {
    experimental: { nativePresentation: true, nativeLayerRegistry: true, forceLayerRepaint: true },
  })

  const box = createNode("box")
  insertChild(loop.root, box)
  setProp(box, "width", 160)
  setProp(box, "height", 100)
  setProp(box, "backgroundColor", 0xff0000ff)

  const frame = async (label: string) => {
    markDirty()
    loop!.frame()
    await waitForTmuxPresentationForTest(getRendererBackend()!)
    reports.push({ label, size: { ...terminal!.size }, stats: getLastNativePresentationStatsForTest() })
  }
  type FrameOutcome =
    | { status: "presented" }
    | { status: "error"; error: string }
    | { status: "pending" }
  const startFrame = (label: string): Promise<FrameOutcome> => {
    try {
      return frame(label).then(
        () => ({ status: "presented" as const }),
        (error) => ({ status: "error" as const, error: String(error) }),
      )
    } catch (error) {
      return Promise.resolve({ status: "error", error: String(error) })
    }
  }
  const withDeadline = (pending: Promise<FrameOutcome>, timeoutMs: number) => Promise.race([
    pending,
    Bun.sleep(timeoutMs).then(() => ({ status: "pending" as const })),
  ])
  const waitFor = async (file: string) => {
    const deadline = Date.now() + 10000
    while (!(await Bun.file(`${out}/${file}`).exists())) {
      if (Date.now() > deadline) throw new Error(`gate timeout: ${file}`)
      await Bun.sleep(10)
    }
  }

  await frame("initial")
  await Bun.write(`${out}/ready`, "1")

  if (mode === "lifecycle") {
    await waitFor("topology-ready")
    setProp(box, "backgroundColor", 0x0000ffff)
    await frame("after-topology")
    await Bun.write(`${out}/hidden-request`, "1")
    await waitFor("hidden")

    setProp(box, "backgroundColor", 0x00ff00ff)
    await frame("hidden")
    await Bun.write(`${out}/hidden-done`, "1")
    await waitFor("visible")

    await Bun.write(`${out}/detach-request`, "1")
    await waitFor("detached")
    setProp(box, "backgroundColor", 0xff0000ff)
    const detachedAt = Date.now()
    const detachedPending = startFrame("detached")
    // Do not await drain before asking the PTY peer to reattach. A healthy
    // implementation may intentionally keep this promise pending while no
    // client is attached; the reattach must happen independently of it.
    await Bun.sleep(1500)
    await Bun.write(`${out}/reattach-request`, "1")
    await waitFor("reattached")
    const detachedOutcome = await withDeadline(detachedPending, 3000)
    if (detachedOutcome.status === "error") {
      reports.push({
        label: "detached-error",
        error: detachedOutcome.error,
        elapsedMs: Date.now() - detachedAt,
        lastStats: getLastNativePresentationStatsForTest(),
      })
    } else if (detachedOutcome.status === "pending") {
      reports.push({ label: "detached-pending", elapsedMs: Date.now() - detachedAt })
    }

    setProp(box, "backgroundColor", 0x0088ffff)
    const reattachedOutcome = await withDeadline(startFrame("reattached"), 3000)
    if (reattachedOutcome.status === "error") {
      reports.push({ label: "reattached-error", error: reattachedOutcome.error })
    } else if (reattachedOutcome.status === "pending") {
      reports.push({ label: "reattached-pending" })
    }

    const labels = reports
      .map((item) => (item as { label?: string }).label)
      .filter((label): label is string => typeof label === "string")
    const detachedError = detachedOutcome.status === "error" ? detachedOutcome.error : null
    const recoveryError = reattachedOutcome.status === "error" ? reattachedOutcome.error : null
    const recovered = detachedOutcome.status === "presented" && reattachedOutcome.status === "presented"
    const lifecycle = {
      detachedStatus: detachedOutcome.status,
      detachedError,
      reattachedStatus: reattachedOutcome.status,
      recoveryError,
      labels,
      expected: "detached SHM consumption should recover after the same PTY client reattaches",
    }
    loop!.destroy()
    loop = undefined
    terminal!.destroy()
    terminal = undefined
    await Bun.write(`${out}/result.json`, JSON.stringify({
      status: recovered ? "PASS" : "FAIL",
      error: recovered ? undefined : (recoveryError ?? detachedError),
      reports,
      lifecycle,
    }, null, 2))
    if (!recovered) process.exitCode = 1
  } else {

    await waitFor("hidden")
    setProp(box, "backgroundColor", 0x00ff00ff)
    await frame("hidden-no-ack")
    await Bun.write(`${out}/hidden-done`, "1")
    await waitFor("visible")

    for (let index = 0; index < 10; index += 1) {
      setProp(box, "backgroundColor", index === 9 ? 0x0000ffff : 0x880000ff)
      markDirty()
      loop.frame()
    }
    await waitForTmuxPresentationForTest(getRendererBackend()!)
    reports.push({ label: "burst-latest", stats: getLastNativePresentationStatsForTest() })

    loop.suspend()
    loop.resume()
    await waitForTmuxPresentationForTest(getRendererBackend()!)
    reports.push({ label: "resumed", stats: getLastNativePresentationStatsForTest() })

    loop.destroy()
    loop = undefined
    terminal.destroy()
    terminal = undefined
    await Bun.write(`${out}/result.json`, JSON.stringify({ status: "PASS", reports }, null, 2))
  }
} catch (error) {
  await Bun.write(`${out}/result.json`, JSON.stringify({
    status: "FAIL",
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
    reports,
  }, null, 2))
  process.exitCode = 1
} finally {
  loop?.destroy()
  terminal?.destroy()
}

// Native stdin activation can keep a Bun child alive after terminal cleanup.
process.exit(process.exitCode ?? 0)
