# TGE — Terminal Graphics Engine

## What is TGE

Pixel-native terminal rendering engine. Developers write JSX (SolidJS), TGE renders browser-quality UI in the terminal with anti-aliased corners, shadows, gradients, and glow effects.

## Architecture

```
JSX (SolidJS createRenderer)
  → Clay layout (C via FFI, microsecond perf)
    → Pixel paint (Zig via FFI, SDF primitives)
      → Output backend (Kitty/placeholder/halfblock)
        → Terminal
```

## Modules

| Module          | Purpose                                           | Status  |
| --------------- | ------------------------------------------------- | ------- |
| @tge/terminal   | Terminal detection, caps, lifecycle, raw I/O      | Phase 1 |
| @tge/input      | Keyboard/mouse parsing, focus                     | Phase 1 |
| @tge/pixel      | Pixel buffer, SDF paint primitives                | Phase 1 |
| @tge/output     | Kitty, placeholder, sixel, halfblock backends     | Phase 1 |
| @tge/renderer   | SolidJS reconciler + Clay layout integration      | Phase 2 |
| @tge/components | Built-in JSX components (Box, Text, Scroll, etc.) | Phase 3 |
| @tge/tokens     | Design tokens, theming                            | Phase 3 |

## Key Dependencies

- **Clay** (vendor/clay.h) — Layout engine. Single C header, renderer-agnostic, microsecond performance. Called via bun:ffi.
- **SolidJS** (solid-js/universal) — createRenderer for JSX reconciliation. 10 methods, no VDOM.
- **Zig** (zig/) — Pixel painting shared library. SDF primitives, blend, composite.
- **Bun** — Runtime. FFI for native libs, TypeScript execution.

## Build Order

1. **Phase 1**: terminal + input + pixel + output → "paint a rounded rect in the terminal"
2. **Phase 2**: Clay FFI + SolidJS renderer → "write JSX and it renders"
3. **Phase 3**: components + tokens → "reusable Box, Text, Scroll"
4. **Phase 4**: input integration, scroll, focus → "interactive UI"

## Style Guide

### General

- Prefer single-word variable names
- Use `const` over `let`
- Early returns over `else`
- Avoid `try/catch` where possible
- Avoid `any` type
- Prefer functional array methods over for loops
- Use Bun APIs when possible

### Zig

- snake_case for all names
- Minimize allocations — use arena/stack where possible
- All FFI exports prefixed with `tge_`
- Test every public function

### TypeScript

- Prefer type inference over explicit annotations
- Avoid destructuring — use dot notation
- Avoid mocks in tests — test real implementations

## Commands

- `bun install` — install deps
- `cd zig && zig build test --summary all` — run Zig tests
- `cd zig && zig build -Doptimize=ReleaseFast` — build Zig shared lib
- `bun typecheck` — TypeScript type check
- `bun run examples/hello.tsx` — run example

## Reference

- Clay docs: https://github.com/nicbarker/clay
- SolidJS universal: https://github.com/solidjs/solid/tree/main/packages/solid/universal
- Kitty graphics protocol: https://sw.kovidgoyal.net/kitty/graphics-protocol/
- LightCode TGE (origin): /Users/dev/lightcodev2-identity/packages/opencode/src/tge/
