/**
 * Static type smoke test verifying distribution declarations.
 *
 * Checks that onInput, InputEvent, InputSubscriber, and MouseEvent types
 * exported by dist/vexart and dist/engine are fully cross-compatible,
 * and that MouseEvent includes the required `pixel: boolean` field.
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
    const isPixel: boolean = event.pixel
    void isPixel
  }
}

const rootHandler: RootSubscriber = (event: RootInputEvent) => {
  if (event.type === "mouse") {
    const isPixel: boolean = event.pixel
    void isPixel
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
    const isPixel: boolean = mouse.pixel
    void isPixel
  }
})
unsubRootInline()

const unsubEngineInline: () => void = onInputEngine((event: RootInputEvent) => {
  if (event.type === "mouse") {
    const mouse: RootMouseEvent = event
    const isPixel: boolean = mouse.pixel
    void isPixel
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

// 3. MouseEvent cross-compatibility and presence of `pixel: boolean`
const mockEngineMouse: EngineMouseEvent = {
  type: "mouse",
  action: "press",
  button: 0,
  x: 10,
  y: 20,
  mods: { shift: false, alt: false, ctrl: false, meta: false },
  pixel: true,
}

const mockRootMouse: RootMouseEvent = mockEngineMouse
const mockEngineMouse2: EngineMouseEvent = mockRootMouse

const rootPixel: boolean = mockRootMouse.pixel
const enginePixel: boolean = mockEngineMouse2.pixel
void rootPixel
void enginePixel
