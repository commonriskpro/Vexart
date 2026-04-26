import { describe, expect, test } from "bun:test"
import { DIRTY_KIND, markDirty, onGlobalDirty } from "./dirty"

describe("onGlobalDirty multi-callback", () => {
  test("supports multiple callbacks", () => {
    const calls: string[] = []
    const unsub1 = onGlobalDirty(() => calls.push("cb1"))
    const unsub2 = onGlobalDirty(() => calls.push("cb2"))

    markDirty({ kind: DIRTY_KIND.FULL })
    expect(calls).toEqual(["cb1", "cb2"])

    unsub1()
    calls.length = 0
    markDirty({ kind: DIRTY_KIND.FULL })
    expect(calls).toEqual(["cb2"])

    unsub2()
  })
})
