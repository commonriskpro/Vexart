import { describe, expect, test } from "bun:test"
import { ExtmarkManager } from "./extmarks"

describe("ExtmarkManager", () => {
  test("registerType returns unique IDs", () => {
    const mgr = new ExtmarkManager()
    const a = mgr.registerType("search")
    const b = mgr.registerType("ghost")
    expect(a).not.toBe(b)
    // Same name returns same ID
    expect(mgr.registerType("search")).toBe(a)
  })

  test("create and get", () => {
    const mgr = new ExtmarkManager()
    const typeId = mgr.registerType("highlight")
    const id = mgr.create({ start: 5, end: 10, typeId })
    const mark = mgr.get(id)
    expect(mark).toBeDefined()
    expect(mark!.start).toBe(5)
    expect(mark!.end).toBe(10)
    expect(mark!.typeId).toBe(typeId)
  })

  test("remove", () => {
    const mgr = new ExtmarkManager()
    const typeId = mgr.registerType("test")
    const id = mgr.create({ start: 0, end: 5, typeId })
    expect(mgr.count()).toBe(1)
    expect(mgr.remove(id)).toBe(true)
    expect(mgr.count()).toBe(0)
    expect(mgr.remove(id)).toBe(false)
  })

  test("getAllForTypeId", () => {
    const mgr = new ExtmarkManager()
    const search = mgr.registerType("search")
    const diag = mgr.registerType("diagnostic")
    mgr.create({ start: 0, end: 5, typeId: search })
    mgr.create({ start: 10, end: 20, typeId: diag })
    mgr.create({ start: 30, end: 35, typeId: search })
    expect(mgr.getAllForTypeId(search)).toHaveLength(2)
    expect(mgr.getAllForTypeId(diag)).toHaveLength(1)
  })

  test("getInRange", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    mgr.create({ start: 0, end: 5, typeId: t })
    mgr.create({ start: 10, end: 20, typeId: t })
    mgr.create({ start: 30, end: 40, typeId: t })
    // Range [8, 25) should match the second mark
    expect(mgr.getInRange(8, 25)).toHaveLength(1)
    // Range [0, 50) should match all
    expect(mgr.getInRange(0, 50)).toHaveLength(3)
    // Range [5, 10) should match none (boundaries exclusive)
    expect(mgr.getInRange(5, 10)).toHaveLength(0)
  })

  test("getGhostTexts", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("ghost")
    mgr.create({ start: 5, end: 5, typeId: t, ghost: true, data: { text: "suggestion" } })
    mgr.create({ start: 10, end: 15, typeId: t })
    const ghosts = mgr.getGhostTexts()
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].data?.text).toBe("suggestion")
  })

  test("clear", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    mgr.create({ start: 0, end: 5, typeId: t })
    mgr.create({ start: 10, end: 15, typeId: t })
    expect(mgr.count()).toBe(2)
    mgr.clear()
    expect(mgr.count()).toBe(0)
  })

  test("clearType", () => {
    const mgr = new ExtmarkManager()
    const a = mgr.registerType("a")
    const b = mgr.registerType("b")
    mgr.create({ start: 0, end: 5, typeId: a })
    mgr.create({ start: 10, end: 15, typeId: b })
    mgr.create({ start: 20, end: 25, typeId: a })
    mgr.clearType(a)
    expect(mgr.count()).toBe(1)
    expect(mgr.getAllForTypeId(b)).toHaveLength(1)
  })

  test("adjustForEdit — insert shifts marks after", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    const id = mgr.create({ start: 10, end: 20, typeId: t })
    // Insert 5 chars at position 5 (before the mark)
    mgr.adjustForEdit(5, 5, 10)
    const mark = mgr.get(id)!
    expect(mark.start).toBe(15) // shifted by 5
    expect(mark.end).toBe(25)
  })

  test("adjustForEdit — delete shrinks mark inside", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    const id = mgr.create({ start: 0, end: 20, typeId: t })
    // Delete chars 5-10 (5 chars removed)
    mgr.adjustForEdit(5, 10, 5)
    const mark = mgr.get(id)!
    expect(mark.start).toBe(0)
    expect(mark.end).toBe(15) // 20 - 5
  })

  test("adjustForEdit — collapsed non-ghost marks are removed", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    mgr.create({ start: 5, end: 10, typeId: t })
    // Delete the entire range 5-10
    mgr.adjustForEdit(5, 10, 5)
    expect(mgr.count()).toBe(0) // collapsed → removed
  })

  test("adjustForEdit — ghost marks survive collapse", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    mgr.create({ start: 5, end: 5, typeId: t, ghost: true })
    // Insert 5 chars at position 5 — ghost shifts with text
    mgr.adjustForEdit(5, 5, 10)
    expect(mgr.count()).toBe(1)
    const ghost = mgr.getGhostTexts()[0]
    expect(ghost.start).toBe(10) // shifted by 5
  })

  test("sorted by start position", () => {
    const mgr = new ExtmarkManager()
    const t = mgr.registerType("t")
    mgr.create({ start: 30, end: 35, typeId: t })
    mgr.create({ start: 5, end: 10, typeId: t })
    mgr.create({ start: 15, end: 20, typeId: t })
    const all = mgr.getInRange(0, 100)
    expect(all[0].start).toBe(5)
    expect(all[1].start).toBe(15)
    expect(all[2].start).toBe(30)
  })
})
