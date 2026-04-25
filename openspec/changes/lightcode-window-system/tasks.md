# Tasks — Lightcode window system

## 1. Spec and design

- [x] Create proposal, delta spec, design, task list, and verification report.

## 2. Headless state

- [x] Implement `createWindowManager` with register/focus/move/minimize/maximize/restore/close actions.
- [x] Add state transition tests for focus, close, minimize, maximize/restore, and movement.

## 3. Tokenized frame

- [x] Add Lightcode window tokens and recipes.
- [x] Implement `LightcodeWindowFrame` with titlebar, controls, focused/inactive states, glass panel styling, and drag handle.
- [x] Implement `LightcodeDesktop` to render manager snapshots by z-index.
- [x] Add right, bottom, and corner resize handles for normal windows.
- [x] Add minimized dock/taskbar with restorable minimized windows.
- [x] Add fidelity-pass chrome: tokenized gradients, bevel lines, title pills, toolbar buttons, desktop topbar, and denser content panes.

## 4. Demo and visual coverage

- [x] Add `examples/lightcode/lightcode-demo.tsx` with overlapping editor/diff/memory/agent windows.
- [x] Add an initially minimized runner window to exercise the dock in the demo.
- [x] Add visual-test scene for the Lightcode window frame.
- [x] Generate/update the visual golden reference for the new scene.

## 5. Verification

- [x] Run `bun run typecheck`.
- [x] Run targeted Bun tests for the Lightcode window manager.
- [x] Run `bun run test:visual`.
- [x] Update `verify-report.md` with evidence.
