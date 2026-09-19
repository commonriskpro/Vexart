import { describe, expect, test } from "bun:test"
import { formatKittyApc, formatKittyDeleteApc, formatKittyShmUploadApc, formatKittyShmQueryApc, wrapTmuxPassthroughApc, writeKittyApc } from "./tmux-shm-apc"
import { sameTmuxClient, tmuxClientCanReceiveGraphics, formatClientStateError, resolveTmuxCellDimensions, validateClientRecovery, validateClientAtTimeout, discoverTmuxClientState } from "./tmux-shm-client"
import { allocateImageId, validateImageId } from "./tmux-shm-lease"

describe("tmux-shm-apc", () => {
  test("formats Kitty APC command with and without payload", () => {
    const apcNoPayload = formatKittyApc({ a: "d", d: "I", i: 42, q: 2 })
    expect(apcNoPayload).toBe("\x1b_Ga=d,d=I,i=42,q=2;\x1b\\")

    const apcPayload = formatKittyApc({ a: "T", t: "s" }, "test-payload")
    expect(apcPayload).toBe("\x1b_Ga=T,t=s;test-payload\x1b\\")
  })

  test("formats Kitty delete, upload and query APC commands", () => {
    expect(formatKittyDeleteApc(1234)).toBe("\x1b_Ga=d,d=I,i=1234,q=2;\x1b\\")

    const query = formatKittyShmQueryApc(100, "/shm-test")
    expect(query).toContain("i=100")
    expect(query).toContain("a=q,t=s")
    expect(query).toContain(Buffer.from("/shm-test").toString("base64"))

    const upload = formatKittyShmUploadApc({ imageId: 101, placementId: 1, shmName: "/shm-up", cols: 80, rows: 24 })
    expect(upload).toContain("i=101,p=1,c=80,r=24")
    expect(upload).toContain("U=1")
  })

  test("wraps APC in tmux DCS passthrough doubling ESC bytes", () => {
    const apc = "\x1b_Ga=T;payload\x1b\\"
    const wrapped = wrapTmuxPassthroughApc(apc)
    expect(wrapped).toBe("\x1bPtmux;\x1b\x1b_Ga=T;payload\x1b\x1b\\\x1b\\")
  })

  test("writes APC directly or wrapped with writeKittyApc", () => {
    let written = ""
    const write = (data: string) => { written += data }
    writeKittyApc(write, "\x1b_Gtest;\x1b\\", false)
    expect(written).toBe("\x1b_Gtest;\x1b\\")
    written = ""
    writeKittyApc(write, "\x1b_Gtest;\x1b\\", true)
    expect(written).toBe(wrapTmuxPassthroughApc("\x1b_Gtest;\x1b\\"))
  })
})

describe("tmux-shm-client", () => {
  const clientA = { tty: "/dev/ttys001", termName: "kitty", termFeatures: "RGB", passthroughAll: true, rgb: true }
  const clientB = { tty: "/dev/ttys001", termName: "kitty", termFeatures: "RGB", passthroughAll: false, rgb: true }
  const clientC = { tty: "/dev/ttys002", termName: "kitty", termFeatures: "RGB", passthroughAll: true, rgb: true }

  test("evaluates client equivalence and capability", () => {
    expect(sameTmuxClient(clientA, clientB)).toBe(true)
    expect(sameTmuxClient(clientA, clientC)).toBe(false)
    expect(tmuxClientCanReceiveGraphics(clientA)).toBe(true)
    expect(tmuxClientCanReceiveGraphics(clientB)).toBe(false)
  })

  test("formats client state errors", () => {
    const errMultiple = formatClientStateError("tmux SHM", { kind: "multiple", count: 3 })
    expect(errMultiple.message).toContain("requires one attached client during recovery (found 3)")
    const errUnknown = formatClientStateError("tmux SHM", { kind: "unknown", reason: "timeout" })
    expect(errUnknown.message).toContain("could not verify tmux client during recovery: timeout")
  })

  test("validates client recovery and timeout handling", () => {
    expect(validateClientRecovery({ kind: "zero" }, clientA, "tmux SHM")).toEqual({ status: "detached" })
    expect(validateClientRecovery({ kind: "single", client: clientA }, clientA, "tmux SHM")).toEqual({ status: "recovered", client: clientA })
    const failedId = validateClientRecovery({ kind: "single", client: clientC }, clientA, "tmux SHM")
    expect(failedId.status).toBe("failed")

    const timeoutDetached = validateClientAtTimeout({ kind: "zero" }, clientA, "tmux SHM", new Error("timed out"))
    expect(timeoutDetached).toEqual({ status: "detached" })

    const timeoutFailed = validateClientAtTimeout({ kind: "single", client: clientA }, clientA, "tmux SHM", new Error("timed out"))
    expect(timeoutFailed.status).toBe("failed")
  })

  test("resolves cell dimensions from pixel dimensions", () => {
    const cells = resolveTmuxCellDimensions(800, 480, 80, 24)
    expect(cells.cellWidth).toBe(10)
    expect(cells.cellHeight).toBe(20)
  })
})

describe("tmux-shm-lease", () => {
  test("allocates unique positive u32 image IDs", () => {
    const id1 = allocateImageId()
    const id2 = allocateImageId()
    expect(id1).toBeGreaterThan(0)
    expect(id2).toBeGreaterThan(0)
    expect(id1).not.toBe(id2)
    expect(() => validateImageId(id1, "tmux SHM")).not.toThrow()
    expect(() => validateImageId(-1, "tmux SHM")).toThrow()
  })
})
