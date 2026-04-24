# Spec: Retained Interaction Cutover

## Purpose

Defines the native hit-test, hover/active/focus interactive state, and mouse-event cutover for the retained scene path. Rust owns all interaction computation; TS acts as callback registry and dispatch shell only. Refs: ARCHITECTURE §2.5, §6; PRD §10, §19.

## Requirements

### Requirement: Rust MUST perform all hit-testing in the retained path

When `nativeEventDispatch` + `nativeSceneGraph` are enabled, TS MUST NOT iterate `rectNodes` or run its own hit-test loop. Rust returns an event record batch via FFI; TS dispatches JS callbacks from that batch.

#### Scenario: Pointer move — native hover detection

- **Given** `nativeEventDispatch` is enabled and the pointer moves
- **When** the frame processes input
- **Then** TS calls `vexart_input_pointer` and receives native event records
- **And** TS invokes `onMouseOver` / `onMouseOut` / `onMouseMove` callbacks from those records
- **And** TS MUST NOT run `updateInteractiveStates()` hit-test iteration over `rectNodes`

#### Scenario: Pointer down/up — native active + press chain

- **Given** `nativeEventDispatch` is enabled and a press/release occurs
- **When** the frame processes input
- **Then** Rust computes the active node and press bubbling chain
- **And** TS dispatches `onMouseDown` / `onMouseUp` / `onPress` from native records
- **And** TS invokes `stopPropagation()` logic against the ordered chain

### Requirement: Rust MUST own hover and active interactive state

Hover and active state tracking MUST be computed entirely in Rust. Rust MUST return hover-enter, hover-leave, active-begin, active-end records that TS converts to style-application and JS-callback dispatch.

#### Scenario: Hover style activation via native record

- **Given** a node declares `hoverStyle` and `nativeEventDispatch` is enabled
- **When** the pointer enters the node's bounds
- **Then** Rust emits a hover-enter record containing the target node ID
- **And** TS applies `hoverStyle` props and invokes `onMouseOver`

#### Scenario: Active style on press-and-hold

- **Given** a node declares `activeStyle` and `nativeEventDispatch` is enabled
- **When** the pointer is pressed inside the node
- **Then** Rust emits an active-begin record
- **And** TS applies `activeStyle` props
- **When** the pointer is released
- **Then** Rust emits an active-end record and TS reverts to base style

### Requirement: JS MUST remain only callback registry and public API shell

TS SHALL maintain the JS callback registry (keyed by node ID), construct `PressEvent` / `NodeMouseEvent` wrappers from native records, and invoke user callbacks. TS MUST NOT compute hit-testing, hover/active state, or interaction metadata in the retained path.

#### Scenario: JS callback dispatch from native press record

- **Given** Rust returns a press-chain record `[childId, parentId]`
- **When** TS processes the record
- **Then** TS looks up `onPress` callbacks from its registry in chain order
- **And** TS constructs a `PressEvent` with a `stopPropagation()` function
- **And** dispatch stops when `propagationStopped` becomes `true`

### Requirement: Focus ownership split MUST be enforced

Rust owns focus ORDER (traversal via `focusNext`/`focusPrev`). TS owns focus ID state (`focusedId` signal). This split is the intended target architecture and MUST NOT be changed.

#### Scenario: Tab focus traversal — native order, TS state

- **Given** `nativeEventDispatch` is enabled and Tab is pressed
- **When** TS calls `vexart_scene_focus_next`
- **Then** Rust returns the next focusable node ID in DOM order
- **And** TS updates its `focusedId` signal and dispatches `focusStyle` changes

### Requirement: Parity with compat path for all interaction features

The native interaction path MUST produce identical observable behavior to the TS compat path for: pointer capture, offscreen scroll clipping, pointer passthrough, min hit-area expansion, press bubbling with `stopPropagation`, focus traversal, and per-node mouse events (`down/up/move/over/out`).

#### Scenario: Pointer capture on native path

- **Given** a node has captured the pointer via `setPointerCapture(nodeId)`
- **When** the pointer moves outside the node bounds
- **Then** Rust MUST route all mouse events to the captured node
- **And** release MUST occur on button-up

#### Scenario: Offscreen scroll clipping on native path

- **Given** a child is scrolled outside its scroll container viewport
- **When** the pointer overlaps the child's absolute coordinates
- **Then** Rust MUST NOT generate hover/active/mouse-event records for the child

#### Scenario: Pointer passthrough on native path

- **Given** a floating node has `pointerPassthrough={true}`
- **When** the pointer hits the floating node
- **Then** Rust MUST pass the hit through to the node below

#### Scenario: Min hit-area expansion on native path

- **Given** an interactive node is smaller than one terminal cell
- **When** the pointer is within the expanded cell bounds but outside the visual bounds
- **Then** Rust MUST generate hit-test results for that node

### Requirement: Compat fallback MUST remain available

When `nativeEventDispatch` is disabled (or `VEXART_RETAINED=0`), the full TS hit-test loop and interactive state computation MUST function unchanged.

#### Scenario: Compat fallback via env flag

- **Given** `VEXART_NATIVE_EVENT_DISPATCH=0` is set
- **When** the frame processes input
- **Then** TS runs `updateInteractiveStates()` with full `rectNodes` iteration
- **And** all interaction features work identically to the pre-cutover behavior
