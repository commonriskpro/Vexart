# Lightcode window system

## Intent

Build the first production-shaped Lightcode desktop slice on top of Vexart: tokenized floating windows that visually match the reference direction and can be minimized, maximized, restored, focused, moved, resized, docked, and closed.

## Source-of-truth alignment

- `docs/PRD.md` §5.1: uses shipped primitives (`<box>`, `<text>`), `floating`, `zIndex`, shadows, glow, gradients, opacity, focus and pointer interaction.
- `docs/ARCHITECTURE.md` §2.2: keeps this as application-level composition instead of adding a fifth public runtime package.
- `docs/API-POLICY.md`: avoids public API changes for the first Lightcode slice.
- `docs/window-system-architecture.md`: validates the planned direction (headless state manager + styled frame) without documenting `@vexart/windowing` as shipped.

## Scope

### In scope

- Headless `createWindowManager` for application-local window state.
- Tokenized Lightcode window theme with semantic window tokens and recipes.
- `LightcodeDesktop` and `LightcodeWindowFrame` composition.
- Minimize, maximize/restore, close, focus/z-order, titlebar dragging, edge resizing, and minimized dock restore.
- Example scene demonstrating multiple overlapping Lightcode windows.
- Tests for window state transitions and visual golden coverage for the frame look.

### Out of scope

- Public `@vexart/windowing` package.
- Background starfield/shader canvas from the reference image.
- Persistence/session restore.
- Native compositor-specific window primitive.

## Approach

Implement the Lightcode window system under `examples/lightcode/` first. This keeps the architecture honest: Lightcode can iterate toward the screenshot without prematurely expanding Vexart's public API surface. Once the API proves stable, a later change can promote the headless manager and styled frame to a package.

## Rollback plan

Remove `examples/lightcode/*`, the visual scene/reference, and tests. No engine or public package contract should be required for rollback.
