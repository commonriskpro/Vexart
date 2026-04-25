# Design — Lightcode window system

## Decision 1: Build app-local before public package

The target architecture currently lists four public packages. `docs/window-system-architecture.md` describes `@vexart/windowing` as planned, not shipped. Adding it now would be a product/API decision, not just an implementation detail.

Therefore the first slice lives under `examples/lightcode/`:

- `window-manager.ts` — headless state and actions.
- `tokens.ts` — visual design tokens and recipes.
- `window-frame.tsx` — styled frame using tokens.
- `desktop.tsx` — renders non-closed/non-minimized windows in z order and exposes minimized windows through a dock.
- `lightcode-demo.tsx` — real demo composition.

## Decision 2: Headless manager controls all mutable state

Window rendering receives a `LightcodeWindowManager` and a `LightcodeWindowSnapshot`. The frame never owns canonical minimized/maximized/closed state.

This keeps behavior testable without rendering and makes eventual package promotion straightforward.

## Decision 3: Token recipes over ad-hoc props

The visual target has multiple states: focused, inactive, minimized, glass-like panels, and destructive close affordance. A recipe layer maps state to tokens so Lightcode can later support themes without rewriting components.

## Decision 4: Defer background, keep resize scoped

The screenshot's background is visually important but not structurally risky. The window system is the foundation. Resize is included only for the low-risk right, bottom, and bottom-right handles so the API shape can be tested without taking on left/top origin-shifting edge cases yet.

## Component contracts

```tsx
const manager = createWindowManager({ windows, desktop })

<LightcodeDesktop manager={manager}>
  {(window) => <LightcodeWindowContent window={window} />}
</LightcodeDesktop>
```

`LightcodeWindowFrame` is slot-based:

```tsx
<LightcodeWindowFrame manager={manager} window={window}>
  {content}
</LightcodeWindowFrame>
```

## Risk

The largest risk is overfitting the first visual frame to the screenshot and making it hard to theme. The token/recipe layer is the guardrail.
