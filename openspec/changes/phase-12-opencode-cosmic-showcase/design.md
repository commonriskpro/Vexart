# Design: Phase 12 OpenCode Cosmic Shell Showcase

## Decision: Port as a Vexart-native example, not a React adapter

The source file is React DOM plus arbitrary Tailwind/CSS. Vexart's app framework intentionally targets React-familiar JSX over Vexart/Solid runtime rather than React DOM compatibility. The showcase therefore uses `@vexart/app` `Page`, `Box`, and `Text` components plus Solid signals.

## Layout approach

- Root `Page` owns the cosmic background.
- A horizontal shell row contains optional left rail, central editor, and optional assistant panel.
- Floating Vexart nodes replace browser absolute/fixed positioning for the app overlay and dock.
- Small floating boxes approximate particles/starfield.

## Styling approach

- Use explicit Vexart props instead of unsupported arbitrary Tailwind classes.
- Use gradients, blur, shadows, borders, glows, and opacity where engine support already exists.
- Use compact text badges instead of inline SVG icons.
- Use Vexart `<canvas>` for high-fidelity non-rectangular art now that the active GPU backend resolves canvas display-lists to cached sprites.

## Interaction approach

- `createSignal` stores active app, active file, drawer visibility, and assistant queued messages.
- Vexart `onPress` replaces DOM `onClick`.
- Focusable boxes provide keyboard/mouse participation through the engine interaction system.

## Tradeoffs

- Visual parity is intentionally approximate because CSS pseudo-elements, keyframes, SVG paths, and arbitrary Tailwind values are not runtime-compatible with Vexart today.
- The example avoids changing `package.json` because the worktree already contains unrelated dirty modifications there.
- The NOVA portrait and cosmic background use canvas commands for closer parity with the JSX reference.
