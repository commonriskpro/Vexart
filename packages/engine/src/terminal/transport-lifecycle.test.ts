import { describe, expect, test } from "bun:test"
import type { Terminal } from "./index"
import { notifyTerminalTransportLifecycle, onTerminalTransportLifecycle } from "./transport-lifecycle"

describe("terminal transport lifecycle", () => {
  test("notifies subscribed observers and removes them on destroy", () => {
    const term = {} as Terminal
    const events: string[] = []
    const unsubscribe = onTerminalTransportLifecycle(term, (event) => events.push(event))
    notifyTerminalTransportLifecycle(term, "suspend")
    notifyTerminalTransportLifecycle(term, "resume")
    unsubscribe()
    notifyTerminalTransportLifecycle(term, "destroy")
    expect(events).toEqual(["suspend", "resume"])
  })

  test("destroy is delivered once even when cleanup is repeated", () => {
    const term = {} as Terminal
    const events: string[] = []
    onTerminalTransportLifecycle(term, (event) => events.push(event))
    notifyTerminalTransportLifecycle(term, "destroy")
    notifyTerminalTransportLifecycle(term, "destroy")
    expect(events).toEqual(["destroy"])
  })

  test("marks destroy before dispatching reentrant observers", () => {
    const term = {} as Terminal
    const events: string[] = []
    onTerminalTransportLifecycle(term, (event) => {
      events.push(event)
      notifyTerminalTransportLifecycle(term, "destroy")
    })
    notifyTerminalTransportLifecycle(term, "destroy")
    expect(events).toEqual(["destroy"])
  })

  test("dispatches all observers before surfacing an observer error", () => {
    const term = {} as Terminal
    const events: string[] = []
    onTerminalTransportLifecycle(term, () => { throw new Error("observer failed") })
    onTerminalTransportLifecycle(term, () => events.push("second"))
    expect(() => notifyTerminalTransportLifecycle(term, "suspend")).toThrow("observer failed")
    expect(events).toEqual(["second"])
  })
})
