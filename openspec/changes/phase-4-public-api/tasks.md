# Tasks: Phase 4 — Public API & Visual Testing

## Phase 1: API surface

- [x] 1.1 Replace `export *` in `packages/engine/src/public.ts` with explicit named exports, grouped by `docs/API-POLICY.md` section headers.
- [x] 1.2 Convert `packages/primitives/src/index.ts`, `packages/headless/src/index.ts`, and `packages/styled/src/index.ts` to explicit named exports with no barrel chains.
- [x] 1.3 Verify the explicit export lists still satisfy sibling package and example imports.

## Phase 2: Entry points + generated JSX runtime

- [x] 2.1 Point `packages/engine`, `packages/primitives`, `packages/headless`, and `packages/styled` `package.json` `main`/`types` at their public entry files.
- [x] 2.2 Reduce each `packages/*/src/index.ts` to the single allowed re-export: `export * from "./public"`.
- [x] 2.3 Add `scripts/gen-jsx-runtime.ts` to extract `TGEProps` from `packages/engine/src/ffi/node.ts` and emit `types/jsx-runtime.d.ts`.
- [x] 2.4 Add `bun run gen:jsx-runtime` to the root `package.json` and confirm the generated file matches the committed one.

## Phase 3: Type tightening

- [x] 3.1 Remove `as any` casts in `packages/engine/src/`, starting with `reconciler/`, `loop/walk-tree.ts`, and `ffi/`.
- [x] 3.2 Remove remaining `as any` casts in other packages only where they block public API typing.
- [x] 3.3 Run strict typecheck (`bun run typecheck` / strict equivalent) and fix resulting errors.

## Phase 4: Visual testing

- [ ] 4.1 Add an offscreen render path in `packages/engine/src/` that paints to a pixel buffer without terminal I/O.
- [ ] 4.2 Build the golden runner under `scripts/visual-test/` to render scenes and diff PNGs against references.
- [ ] 4.3 Add `bun run test:visual` and `bun run test:visual:update` scripts.
- [ ] 4.4 Create starter scenes: `hello`, `effects`, `components`, `text`, and `scroll`.

## Phase 5: Verification / cleanup

- [ ] 5.1 Run `bun typecheck` and `bun run showcase` after entry-point changes.
- [ ] 5.2 Clean up temporary generation artifacts and add brief usage notes for new commands if needed.
