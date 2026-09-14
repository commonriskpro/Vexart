/**
 * Static type smoke test verifying distribution declarations.
 *
 * Checks that onInput, InputEvent, InputSubscriber, and MouseEvent types
 * exported by dist/vexart and dist/engine are fully cross-compatible
 * under the unified SGR-Pixel 1016 protocol (pixel coordinates x, y).
 */

import {
  onInput as onInputRoot,
  type InputEvent as RootInputEvent,
  type InputSubscriber as RootSubscriber,
  type MouseEvent as RootMouseEvent,
} from "../../dist/vexart"

import {
  onInput as onInputEngine,
  type InputEvent as EngineInputEvent,
  type InputSubscriber as EngineSubscriber,
  type MouseEvent as EngineMouseEvent,
} from "../../dist/engine"

// 1. Cross-compatibility: Pass EngineSubscriber to onInputRoot and vice versa
const engineHandler: EngineSubscriber = (event: EngineInputEvent) => {
  if (event.type === "mouse") {
    const x: number = event.x
    const y: number = event.y
    const button: number = event.button
    const action: string = event.action
    const mods = event.mods
    void x
    void y
    void button
    void action
    void mods
  }
}

const rootHandler: RootSubscriber = (event: RootInputEvent) => {
  if (event.type === "mouse") {
    const x: number = event.x
    const y: number = event.y
    const button: number = event.button
    const action: string = event.action
    const mods = event.mods
    void x
    void y
    void button
    void action
    void mods
  }
}

// EngineSubscriber passed to onInputRoot
const unsubRootFromEngine: () => void = onInputRoot(engineHandler)
unsubRootFromEngine()

// RootSubscriber passed to onInputEngine
const unsubEngineFromRoot: () => void = onInputEngine(rootHandler)
unsubEngineFromRoot()

// Inline callbacks with cross types
const unsubRootInline: () => void = onInputRoot((event: EngineInputEvent) => {
  if (event.type === "mouse") {
    const mouse: EngineMouseEvent = event
    const x: number = mouse.x
    const y: number = mouse.y
    const button: number = mouse.button
    const action: string = mouse.action
    const mods = mouse.mods
    void x
    void y
    void button
    void action
    void mods
  }
})
unsubRootInline()

const unsubEngineInline: () => void = onInputEngine((event: RootInputEvent) => {
  if (event.type === "mouse") {
    const mouse: RootMouseEvent = event
    const x: number = mouse.x
    const y: number = mouse.y
    const button: number = mouse.button
    const action: string = mouse.action
    const mods = mouse.mods
    void x
    void y
    void button
    void action
    void mods
  }
})
unsubEngineInline()

// 2. Type equivalence: Bidirectional assignments
const assignEngineToRoot: RootSubscriber = engineHandler
const assignRootToEngine: EngineSubscriber = rootHandler
void assignEngineToRoot
void assignRootToEngine

const rootEvent: RootInputEvent = {} as EngineInputEvent
const engineEvent: EngineInputEvent = {} as RootInputEvent
void rootEvent
void engineEvent

// 3. MouseEvent cross-compatibility and presence of pixel coordinates and event properties
const mockEngineMouse: EngineMouseEvent = {
  type: "mouse",
  action: "press",
  button: 0,
  x: 10,
  y: 20,
  mods: { shift: false, alt: false, ctrl: false, meta: false },
}

const mockRootMouse: RootMouseEvent = mockEngineMouse
const mockEngineMouse2: EngineMouseEvent = mockRootMouse

const rootX: number = mockRootMouse.x
const rootY: number = mockRootMouse.y
const rootButton: number = mockRootMouse.button
const engineX: number = mockEngineMouse2.x
const engineY: number = mockEngineMouse2.y
const engineButton: number = mockEngineMouse2.button
void rootX
void rootY
void rootButton
void engineX
void engineY
void engineButton
