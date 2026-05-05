# Vexart — Public API Policy

**Version**: 0.1
**Status**: Active policy
**Owner**: Founder (solo developer)
**Companion to**: [PRD](./PRD.md), [ARCHITECTURE](./ARCHITECTURE.md)

---

## ⚠️ How to read this document

This document defines **what is public and what is internal** in Vexart's codebase, and the rules that govern additions, changes, and deprecations.

**When reading this as an AI agent**: before exporting any symbol, adding any function to `public.ts`, or making any decision about what users should see, consult this document. Violations are blocking — if a task would break this policy, stop and flag it.

**When reading this as a human reviewer**: treat this document as the answer to the question "can I change this without breaking users?". If the change touches a public symbol, follow the rules in Section 5.

**Rules for changes to this document**:
- Any relaxation of the rules requires a PRD amendment.
- Tightening of rules (making something stricter) can happen without amendment but must be announced in the CHANGELOG.
- Changes to the SemVer interpretation in Section 6 require a major version bump.

---

## Table of contents

1. [Purpose](#1-purpose)
2. [Public vs. internal — the core distinction](#2-public-vs-internal--the-core-distinction)
3. [The `public.ts` contract](#3-the-publicts-contract)
4. [API surface snapshot via `api-extractor`](#4-api-surface-snapshot-via-api-extractor)
5. [Change classification — additive, breaking, internal](#5-change-classification--additive-breaking-internal)
6. [SemVer interpretation](#6-semver-interpretation)
7. [Deprecation policy](#7-deprecation-policy)
8. [Stability levels](#8-stability-levels)
9. [Component API contracts (`ctx.*Props`)](#9-component-api-contracts-ctxprops)
10. [Type stability](#10-type-stability)
11. [FFI contract (internal, not user-facing)](#11-ffi-contract-internal-not-user-facing)
12. [CI enforcement](#12-ci-enforcement)
13. [Documentation requirements](#13-documentation-requirements)
14. [Appendix A — Public API inventory (v0.9 target)](#appendix-a--public-api-inventory-v09-target)

---

## 1. Purpose

Vexart ships source-available binaries under a dual license. Users depend on the API surface that we expose. A change that seems internal to us can be a 5-hour migration for a paying customer. This policy exists to:

1. Make the distinction between **public** and **internal** explicit and enforceable.
2. Prevent accidental leakage of internals through `export *` or unreviewed exports.
3. Lock the API surface via tooling (`api-extractor`) so changes require human approval.
4. Provide clear rules for what is and isn't a breaking change.
5. Give users predictable upgrade paths with documented deprecation windows.

This document exists because **Vexart's credibility depends on API stability**. A good engine with a chaotic API loses customers. A reasonable engine with a rock-solid API keeps them.

---

## 2. Public vs. internal — the core distinction

### 2.1 Definitions

- **Public**: any symbol exported from a package's `public.ts` file. Users may depend on it. Breaking it requires a major version bump and a deprecation cycle.
- **Internal**: everything else. Not accessible via the package's main import path. May change, be renamed, or be deleted at any time without notice.

### 2.2 The `export *` ban

**No package may use `export *`** from its index or public entry file. Every exported symbol must be named explicitly in `public.ts`.

Violation:

```ts
// ❌ Forbidden — leaks everything, including future additions
export * from "./internal/render-graph"
```

Compliant:

```ts
// ✅ Explicit, reviewable, snapshot-trackable
export { buildRenderGraphFrame, createRenderGraphQueues } from "./internal/render-graph"
export type { RenderGraphFrame } from "./internal/render-graph"
```

CI rejects any PR that introduces `export *` in a `public.ts` or `index.ts` at package root.

### 2.3 The `index.ts` vs. `public.ts` convention

- `public.ts` — the **authoritative** list of public exports. Written by humans. One entry per exported symbol.
- `index.ts` — the **package main entry**. Re-exports from `public.ts` (for compatibility with tooling that expects `index.ts`). No new symbols added here.

Layout in every public package:

```
packages/{name}/src/
├── public.ts    ← authoritative; this is the API
├── index.ts     ← one line: export * from "./public" (the ONLY place export * is allowed)
└── ... (internal modules)
```

The one allowed `export * from "./public"` in `index.ts` is safe because it re-exports only what `public.ts` already declared explicitly.

### 2.4 Internal imports from user code are not supported

Users importing from paths like `@vexart/engine/src/internal/foo` are **unsupported**. Such imports may break in any release without notice. The official import path is always the package name alone:

```ts
// ✅ Supported
import { mount } from "vexart/engine"

// ❌ Unsupported — breaks at any release
import { internalThing } from "@vexart/engine/src/internal/foo"
```

If a user needs access to an internal for legitimate reasons, they open a feature request. We evaluate and either promote the symbol to public (with tests and docs) or propose an alternative.

For application code, the recommended public entry point is `@vexart/app` and its managed `createApp()` API. `@vexart/engine` remains public for low-level integrations.

---

## 3. The `public.ts` contract

### 3.1 Structure

Every `public.ts` is organized into labeled sections with comments. Example for `@vexart/engine/src/public.ts`:

```ts
// ══════════════════════════════════════════════════════
// @vexart/engine — public API
// ══════════════════════════════════════════════════════

// ── Mount & lifecycle ─────────────────────────────────
export { mount, unmount } from "./mount"
export { createTerminal } from "./terminal/detect"
export type { Terminal, Capabilities, TerminalSize } from "./terminal/caps"

// ── Core types ────────────────────────────────────────
export type { TGEProps } from "./types"
export type { PressEvent, NodeMouseEvent, InteractionMode } from "./reconciler/node"

// ── Handles ───────────────────────────────────────────
export { createHandle } from "./reconciler/handle"
export type { NodeHandle } from "./reconciler/handle"

// ── Hooks ─────────────────────────────────────────────
export { useFocus, setFocus, focusedId, setFocusedId, pushFocusScope } from "./hooks/use-focus"
export { useKeyboard, useMouse, useInput, onInput } from "./hooks/use-input"
export { useDrag } from "./hooks/use-drag"
export { useHover } from "./hooks/use-hover"
export { useQuery, useMutation } from "./hooks/use-query"

// ── Animation ─────────────────────────────────────────
export { createTransition, createSpring, easing } from "./animation/transition"
export type { TransitionConfig, SpringConfig, EasingFn } from "./animation/transition"

// ── Extension points ──────────────────────────────────
export { setRendererBackend, getRendererBackend } from "./ffi/backend"
export type { RendererBackend } from "./ffi/backend"

// ── Observability ─────────────────────────────────────
export {
  toggleDebug,
  setDebug,
  getRendererResourceStats,
  getFontAtlasCacheStats,
  debugDumpTree,
} from "./debug/toggle"

// ── Fonts ─────────────────────────────────────────────
export { registerFont, getFont, clearTextCache } from "./text/register"
export type { FontDescriptor } from "./text/register"

// (etc.)
```

### 3.2 Rules for `public.ts`

1. **Every export is explicit**. No `export *`. Every symbol listed by name.
2. **Every export has a comment section header**.
3. **Types and values are separated into groups** for readability.
4. **Internal paths referenced in `public.ts` are stable**. The file `./reconciler/node` exists and keeps that name; moving it requires updating `public.ts`.
5. **Alphabetical order within sections is preferred but not enforced** — readability wins.
6. **New exports require a PR that updates `.api.md`** (see Section 4).

---

## 4. API surface snapshot via `api-extractor`

### 4.1 Tooling

We use Microsoft's [`api-extractor`](https://api-extractor.com/) to generate a stable, reviewable snapshot of each package's API.

Per package, we produce a `.api.md` file capturing:
- Every exported name
- Its type signature
- Its JSDoc annotations
- Its stability level (`@public`, `@beta`, `@alpha`, `@internal`)

Example of a generated `.api.md` line:

```
// @public
export function mount(component: () => TGENode, terminal: Terminal): MountHandle;
```

### 4.2 Generated files

```
vexart/
├── packages/engine/etc/engine.api.md
├── packages/primitives/etc/primitives.api.md
├── packages/headless/etc/headless.api.md
├── packages/styled/etc/styled.api.md
├── packages/app/etc/app.api.md
```

Each `.api.md` is committed to git.

### 4.3 The CI gate

On every PR:
1. `api-extractor run` regenerates all `.api.md` files.
2. CI diffs the regenerated files against what's committed.
3. If any difference exists → CI fails with a message: *"Public API surface changed. Review the diff in `{package}/etc/*.api.md` and commit it if intentional."*
4. Committing the updated `.api.md` files is the author's explicit approval of the API change.

This ensures:
- No unintended API changes slip through.
- The PR reviewer sees exactly what changed.
- The change is paired with the matching code change in one commit.

### 4.4 Example CI flow

```
Developer:  opens PR that adds useMutationBatch()
CI:         runs api-extractor
CI:         detects new export in engine.api.md
CI:         fails with diff
Developer:  runs bun run api:update locally
Developer:  commits regenerated engine.api.md
CI:         passes
Reviewer:   sees the exact new signature in the .api.md diff, approves
```

---

## 5. Change classification — additive, breaking, internal

Every change to the codebase falls into exactly one category. The category determines the version bump and migration story.

### 5.1 Internal change

**Definition**: No `.api.md` files change. No user-visible behavior change. No performance regression >10%.

**Examples**:
- Refactoring `loop.ts` internal structure.
- Replacing a cache implementation (as long as stats output format stays the same).
- Adding comments.
- Reorganizing directory structure within `src/internal/`.

**Version bump**: Patch (`0.9.0 → 0.9.1`).
**Changelog entry**: Required, under `## Internal`.
**Migration story**: None.

### 5.2 Additive change

**Definition**: New symbols in `public.ts`, new optional fields on existing types, new optional parameters at the end of existing functions. No existing behavior changes.

**Examples**:
- Adding `<Accordion>` to headless.
- Adding a new hook `useClipboard()`.
- Adding a new optional prop `priority?: number` to an existing component.
- Adding a new variant to `Button` (e.g., `variant="warning"`).

**Version bump**: Minor (`0.9.0 → 0.10.0` during 0.x; `1.2.3 → 1.3.0` after 1.0).
**Changelog entry**: Required, under `## Added`.
**Migration story**: None — existing code works unchanged.

### 5.3 Breaking change

**Definition**: Removing, renaming, or re-signaturing any public symbol. Changing the type of a required parameter. Changing the return type. Changing observable behavior of an existing function in a way that could break correct code.

**Examples**:
- Renaming `setFocus` to `setFocused`.
- Removing `useQuery` (or moving it to a different package).
- Changing `mount()` to require a config object instead of positional params.
- Changing the shape of `PressEvent` (removing a field).
- Raising the minimum supported Node/Bun version.
- Changing default behavior of a prop (e.g., `focusable` defaulting to `true` instead of `false`).

**Version bump**: Major (`0.9.0 → 0.10.0` during 0.x; `1.2.3 → 2.0.0` after 1.0).
**Changelog entry**: Required, under `## Breaking`.
**Migration story**: **Mandatory**. Must include:
- What changed.
- Why.
- Before/after code snippet.
- Deprecation timeline (if applicable).

### 5.4 Performance regression

**Definition**: A benchmark in `bench:showcase` or `bench:optimizations` regresses by >10% vs. `main`.

**Classification**: Treated as **breaking** if unintentional. If intentional (e.g., accepting slower cold start in exchange for correctness), documented in the PR with rationale.

**Version bump**: Same as breaking when unintentional.
**Changelog entry**: Required, under `## Performance`.

### 5.5 Deleting a deprecated symbol

**Definition**: Removing a symbol that was marked `@deprecated` in a previous release.

**Classification**: Breaking, but with documented migration (the deprecation notice).

**Version bump**: Major.
**Required**: the deprecation was in place for at least **2 minor versions** before deletion.

---

## 6. SemVer interpretation

Vexart follows [Semantic Versioning 2.0.0](https://semver.org/) with the following interpretations specific to v0.x and v1.x:

### 6.1 During v0.x (pre-v1.0, developer preview)

- Version format: `0.{minor}.{patch}`.
- **Minor bump** (`0.9.0 → 0.10.0`): breaking OR additive changes.
- **Patch bump** (`0.9.0 → 0.9.1`): internal changes, bugfixes with no API change.
- **No major bumps** during 0.x (that's reserved for 1.0).

Rationale: during developer preview, users accept faster iteration. The signal "this is pre-1.0" communicates that the API is evolving.

### 6.2 After v1.0 (production)

- Version format: `{major}.{minor}.{patch}`.
- **Major bump** (`1.2.3 → 2.0.0`): any breaking change.
- **Minor bump** (`1.2.3 → 1.3.0`): additive changes only.
- **Patch bump** (`1.2.3 → 1.2.4`): internal changes, bugfixes with no API change.

Rationale: production users need reliable SemVer contracts. A `patch` bump from 1.2.3 to 1.2.4 guarantees no breaking changes.

### 6.3 Pre-release tags

Release candidates for a major version use `-rc.{N}` suffix:

- `0.9.0-rc.1` → `0.9.0-rc.2` → `0.9.0`.
- `1.0.0-rc.1` → `1.0.0-rc.2` → `1.0.0`.

### 6.4 What `v1.0` means

Moving from v0.9 to v1.0 signals:
- API surface will only grow additively; breaking changes require v2.0.
- Performance targets in PRD §7.3 are permanent contracts (regression = breaking).
- Supported terminals in PRD §7.4 are permanent (dropping support = breaking).
- Error codes (Section 10.3 of ARCHITECTURE) are permanent.

---

## 7. Deprecation policy

### 7.1 The deprecation cycle

Before deleting a public symbol, we must deprecate it for **at least 2 minor versions**.

```
Version 1.2:  foo() exists, no deprecation mark
Version 1.3:  foo() marked @deprecated, docs show migration to bar()
Version 1.4:  foo() still present, warning on usage (runtime console.warn)
Version 1.5:  foo() still present, final warning
Version 2.0:  foo() deleted — breaking change
```

**Minimum window**: 2 minor versions between deprecation and deletion.

### 7.2 Marking a deprecation

In the source:

```ts
/**
 * @deprecated Use {@link bar} instead. This function will be removed in v2.0.
 *
 * Migration:
 * ```ts
 * // Before
 * foo(x, y)
 * // After
 * bar({ x, y })
 * ```
 */
export function foo(x: number, y: number): void {
  // Runtime warning (idempotent, throttled)
  warnOnceDeprecated("foo", "Use bar() instead. See CHANGELOG v1.3.")
  return internalFoo(x, y)
}
```

### 7.3 Deprecation metadata

- `@deprecated` JSDoc tag.
- Target removal version explicitly stated.
- Migration example in the JSDoc body.
- `api-extractor` picks this up automatically and surfaces it in `.api.md`.
- CHANGELOG entry under `## Deprecated`.

### 7.4 Runtime warnings

- `warnOnceDeprecated(name, message)` prints once per process per name.
- Controlled by `VEXART_WARN_DEPRECATED=1` (default: on).
- Can be silenced with `VEXART_WARN_DEPRECATED=0` for production.

---

## 8. Stability levels

Each public symbol has a stability level, enforced via JSDoc tags and surfaced in `.api.md`.

| Level | Tag | Meaning |
|---|---|---|
| **Public** | `@public` | Stable. Subject to full deprecation policy. |
| **Beta** | `@beta` | Usable but subject to change in next minor version without deprecation cycle. |
| **Alpha** | `@alpha` | Experimental. May disappear at any point. |
| **Internal** | `@internal` | Not part of the public API, even if exported from `public.ts` for technical reasons. Users must not depend on it. |

### 8.1 Default stability

Symbols in `public.ts` are **`@public`** unless explicitly tagged otherwise.

### 8.2 Upgrading stability

- `@alpha` → `@beta`: after at least 1 minor version of usage without major issues.
- `@beta` → `@public`: after at least 1 minor version of `@beta` and positive real-world feedback.

Downgrading stability (`@public` → `@beta`) is a **breaking change** and triggers a major version bump.

### 8.3 Using `@internal` in `public.ts`

Sometimes a symbol must be exported for technical reasons (e.g., consumed by a generated JSX runtime) but is not intended for user code. Tag it `@internal`:

```ts
/**
 * @internal
 * Consumed by the generated jsx-runtime.d.ts. Not for user code.
 */
export { __createElementInternal } from "./reconciler/internal"
```

The `__` name prefix is a visual reminder. Users who import these despite the tag assume full breakage risk.

---

## 9. Component API contracts (`ctx.*Props`)

Headless components expose their integration points via `ctx` objects. These are first-class public API.

### 9.1 The render-prop pattern

```tsx
<Button
  onPress={() => save()}
  renderButton={(ctx) => (
    <box {...ctx.buttonProps} padding={8}>
      <text>Save</text>
    </box>
  )}
/>
```

`ctx.buttonProps` is a stable object shape: `{ focusable: true, onPress: ..., ...hoverState }`.

### 9.2 Stability contract for `ctx.*Props`

- **Adding a field** to `ctx.buttonProps` (e.g., a new prop `ariaRole`) → additive, minor bump.
- **Removing a field** or renaming → breaking, major bump.
- **Changing the type** of an existing field → breaking, major bump.
- **Changing which primitive the props are meant for** (e.g., from `<box>` to `<button>`) → breaking, major bump.

### 9.3 Context objects are frozen

`ctx` objects passed to render props are **frozen** (`Object.freeze`) in development builds. Attempting to mutate them throws. In production builds they are non-frozen for performance but mutation is still unsupported.

---

## 10. Type stability

TypeScript types are part of the public API. Changes to types follow the same classification rules as runtime values.

### 10.1 Rules for exported types

| Change | Classification |
|---|---|
| Adding an optional field to a public type | Additive (minor) |
| Adding a required field to a public type | Breaking (major) |
| Removing any field | Breaking (major) |
| Narrowing a field's type (e.g., `string` → `"a" \| "b"`) | Breaking (major) |
| Widening a field's type (e.g., `"a"` → `string`) | Additive if backwards-compatible |
| Renaming a type | Breaking (major) |
| Marking a field `readonly` | Additive if field was never mutated by users; breaking otherwise |

### 10.2 Generated types

`jsx-runtime.d.ts` is **auto-generated** from `TGEProps` in `@vexart/engine/src/types.ts`. When `TGEProps` changes, the generated file changes. Both are committed to git. The regeneration step runs in CI (`bun run gen:jsx-runtime`) and commits produce a diff, just like `api-extractor`.

### 10.3 `never` and `unknown` policy

- Avoid `any`. Prefer `unknown` with narrowing.
- Use `never` for intentional unreachability only.
- Never export `any` as part of a public type.

---

## 11. FFI contract (internal, not user-facing)

The FFI between TypeScript (`@vexart/engine`) and Rust (`libvexart`) is **internal**. Users never call FFI directly.

However, the FFI contract is stable within a single Vexart release: TS and Rust are shipped together, and their versions must match. On startup, `@vexart/engine` checks:

```ts
const rustVersion = vexart_version()
if (rustVersion !== EXPECTED_BRIDGE_VERSION) {
  throw new VexartError(`Version mismatch: TS expects ${EXPECTED_BRIDGE_VERSION}, native reports ${rustVersion}`)
}
```

The FFI contract is bumped every time `lib.rs` exports change. This is an internal concern — users see one Vexart version number.

---

## 12. CI enforcement

The following CI gates enforce this policy. Every PR must pass all.

### 12.1 API surface gate

- `api-extractor run` on all public packages.
- Diff against committed `.api.md` files.
- Fail if any difference is unreviewed.

### 12.2 `export *` lint

- Scan all `public.ts` and root `index.ts` files.
- Fail on any `export *` that is not the single allowed `export * from "./public"` in `index.ts`.

### 12.3 Stability tag lint

- Every export in `public.ts` must have a JSDoc with a stability tag (`@public`, `@beta`, `@alpha`, `@internal`).
- Untagged exports fail CI.

### 12.4 Deprecation format lint

- `@deprecated` tags must include a target removal version.
- Missing removal version fails CI.

### 12.5 Package boundary lint (see ARCHITECTURE §3)

- `dependency-cruiser` enforces that packages import only from their allowed downstream layers.
- Upward or lateral imports fail CI.

### 12.6 SemVer bump check

- On PR merge to `main`, compare `package.json` version to previous.
- If `.api.md` changed but version is patch → fail.
- If breaking marker in CHANGELOG but version is not major → fail.

### 12.7 Generated files gate

- `jsx-runtime.d.ts` regenerated in CI.
- Diff against committed version. Fail on mismatch.

---

## 13. Documentation requirements

Every public symbol must have documentation. This is enforced via JSDoc.

### 13.1 Minimum JSDoc per public export

```ts
/**
 * Create a managed Vexart app and start the render loop.
 *
 * @param component - Root component function.
 * @param options - Optional app and terminal configuration.
 * @returns A handle with lifecycle controls.
 *
 * @example
 * ```tsx
 * const handle = await createApp(() => <App />)
 * // ... later
 * handle.unmount()
 * ```
 *
 * @public
 */
export async function createApp(component: () => JSX.Element, options?: CreateAppOptions): Promise<AppContext> {
  // ...
}
```

Required JSDoc elements per public symbol:

- One-line summary (first sentence).
- `@param` per parameter.
- `@returns` (if return value matters).
- `@example` with at least one runnable snippet (for non-trivial API).
- Stability tag (`@public`, `@beta`, `@alpha`, `@internal`).
- `@since` tag with the version when the symbol was added (for additions in v0.10+).

### 13.2 CI checks for docs

- Every symbol in `public.ts` must have JSDoc. Missing → CI fails.
- Every `@param` must match a real parameter. Missing or extra → CI fails.
- Every `@example` code block must typecheck. Failed typecheck → CI fails.

### 13.3 Docs site generation

The user-facing docs site (in `docs/` Starlight/Fumadocs) is partially auto-generated from the `.api.md` files. Hand-written prose lives alongside generated reference material:

```
docs/
├── getting-started.md           ← hand-written
├── concepts/                    ← hand-written
├── api/                         ← auto-generated from .api.md
│   ├── engine.md
│   ├── primitives.md
│   ├── headless.md
│   └── styled.md
└── examples/                    ← hand-written
```

---

## Appendix A — Public API inventory (v0.9 target)

This appendix enumerates the complete expected public API surface at v0.9 release. If you are reviewing `public.ts` in a pull request and a symbol is on this list but missing, flag it. If a symbol is on the PR but not on this list, evaluate whether the list should be updated.

### A.1 `@vexart/engine`

**Mount & lifecycle**
- `mount(component, terminal, options?): MountHandle` `@public`
- `unmount(handle): void` `@public`
- `createTerminal(options?): Promise<Terminal>` `@public`
- `Terminal`, `Capabilities`, `TerminalSize` (types) `@public`

**Core types**
- `TGEProps` (type) `@public`
- `PressEvent`, `NodeMouseEvent`, `InteractionMode` (types) `@public`

**Handles**
- `createHandle(node): NodeHandle` `@public`
- `NodeHandle` (type) `@public`

**Hooks**
- `useFocus`, `setFocus`, `focusedId`, `setFocusedId`, `pushFocusScope` `@public`
- `useKeyboard`, `useMouse`, `useInput`, `onInput` `@public`
- `useDrag`, `useHover` `@public`
- `useQuery`, `useMutation` `@public`

**Animation**
- `createTransition`, `createSpring`, `easing` `@public`
- `TransitionConfig`, `SpringConfig`, `EasingFn` (types) `@public`

**Pointer capture**
- `setPointerCapture(nodeId): void` `@public`
- `releasePointerCapture(nodeId): void` `@public`

**Router (data hook only; components in @vexart/headless)**
- `createRouter`, `createNavigationStack`, `useRouter` `@public`

**Selection**
- `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal` `@public`
- `TextSelection` (type) `@public`

**Animation helpers**
- `hasActiveAnimations()` `@public`

**Resource observability**
- `getRendererResourceStats()` `@public`
- `getFontAtlasCacheStats()`, `getTextLayoutCacheStats()`, `getImageCacheStats()` `@public`
- `ResourceStats` (type) `@public`

**Font registration**
- `registerFont`, `getFont`, `clearTextCache` `@public`
- `FontDescriptor` (type) `@public`

**Debug**
- `toggleDebug`, `setDebug`, `isDebugEnabled` `@public`
- `debugFrameStart`, `debugUpdateStats`, `debugState`, `debugStatsLine`, `debugDumpTree`, `debugDumpCulledNodes` `@public`
- `DebugStats` (type) `@public`

**Extension points**
- `setRendererBackend`, `getRendererBackend`, `getRendererBackendName` `@public`
- `RendererBackend`, `RendererBackendFrameContext`, `RendererBackendPaintContext`, `RendererBackendPaintResult`, `RendererBackendFramePlan`, `RendererBackendFrameResult`, `RendererBackendLayerBacking`, `RendererBackendLayerContext` (types) `@public`
- `createSlotRegistry`, `createSlot` `@public`

**Errors**
- `VexartError`, `VexartNativeError`, `VexartTerminalError` (classes) `@public`

**Constants & enums**
- `RGBA` (class) `@public`
- `MouseButton` (enum) `@public`
- `ATTACH_TO`, `ATTACH_POINT`, `POINTER_CAPTURE`, `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y` (constants) `@public`

**Scroll handles**
- `createScrollHandle`, `resetScrollHandles` `@public`
- `ScrollHandle` (type) `@public`

**Extmarks (for editor-like UI)**
- `ExtmarkManager` (class) `@public`
- `Extmark`, `CreateExtmarkOptions` (types) `@public`

**Syntax highlighting (integrated)**
- `TreeSitterClient`, `getTreeSitterClient`, `addDefaultParsers` `@public`
- `SyntaxStyle`, `ONE_DARK`, `KANAGAWA` `@public`
- `highlightsToTokens` `@public`
- `Token`, `SimpleHighlight`, `FiletypeParserConfig`, `StyleDefinition`, `ThemeTokenStyle` (types) `@public`

### A.2 `@vexart/primitives`

- `Box`, `Text`, `Image`, `Canvas`, `Span`, `RichText` (components) `@public`
- `BoxProps`, `TextProps`, `ImageProps`, `CanvasProps`, `SpanProps`, `RichTextProps` (types) `@public`

### A.3 `@vexart/headless`

**Inputs**
- `Button`, `Checkbox`, `Switch`, `RadioGroup`, `Input`, `Textarea`, `Slider`, `Select`, `Combobox` (components) `@public`
- Corresponding props types and render-context types `@public`

**Display**
- `ProgressBar`, `Badge`, `Avatar`, `Skeleton`, `Separator`, `Code`, `Markdown` (components) `@public`

**Containers**
- `ScrollView`, `Tabs`, `Card`, `Portal` (components) `@public`

**Collections**
- `List`, `VirtualList`, `Table` (components) `@public`

**Overlays**
- `Dialog`, `Tooltip`, `Popover`, `Toast`, `createToaster` `@public`

**Navigation**
- `Router`, `Diff` (components) `@public`

**Forms**
- `createForm` factory `@public`

### A.4 `@vexart/styled`

**Theme system**
- `ThemeProvider`, `createTheme`, `useTheme`, `setTheme` `@public`
- `Theme`, `ThemeOverrides` (types) `@public`

**Tokens**
- `colors`, `radius`, `space`, `shadows`, `font`, `weight` (named constants) `@public`

**Styled components** (void theme)
- `Button`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` `@public`
- `Badge`, `Separator`, `Avatar`, `Skeleton` `@public`
- `VoidDialog`, `VoidSelect`, `VoidSwitch` `@public`

**Typography**
- `H1`, `H2`, `H3`, `H4`, `P`, `Lead`, `Large`, `Small`, `Muted` `@public`

### A.5 `@vexart/app`

`@vexart/app` ships during the `0.9.0-beta` line. Symbols below are public entrypoints, but the app-framework compatibility contract is beta-level until Vexart 1.0: names are tracked by API reports, while behavior can still change with changelog notes as filesystem routing, dev mode, and className coverage mature.

**Runtime**
- `Page`, `createApp`, `mountApp`, `useAppTerminal` `@public`
- `PageProps`, `CreateAppOptions`, `AppContext`, `MountAppOptions` (types) `@public`

**Components**
- `Box`, `Text` app-framework wrappers with `className` support `@public`
- `AppBoxProps`, `AppTextProps`, `ClassNameProps` (types) `@public`

**Styling**
- `resolveClassName`, `mergeClassNameProps`, `CLASS_NAME_UNKNOWN_BEHAVIOR` `@public`
- `ClassNameResolveOptions`, `ClassNameResolveResult`, `ClassNameDiagnostic`, `VexartStyleProps` (types) `@public`

**Router**
- `createAppRouter`, `matchRoute`, `normalizePath`, `RouterProvider`, `RouteOutlet`, `useRouter`, `ROUTE_FOCUS_ID` `@public`
- `discoverAppRoutes`, `routeFilePathToRoutePath`, `writeRouteManifestModule`, `ROUTE_FILE_KIND` `@public`
- `AppRouteDefinition`, `AppRouter`, `AppRouterState`, `RouteParams`, `RouteComponent`, `RouteLayoutComponent`, `RouteErrorComponent` (types) `@public`
- `CreateAppRouterOptions`, `AppRouterFocusRestorer`, `FileSystemRouteManifest`, `FileSystemRoute`, `FileSystemRouteFile`, `RouteManifestOptions`, `WriteRouteManifestOptions` (types) `@public`

**Config / CLI**
- `defineConfig`, `mergeConfig`, `runCli` `@public`
- `CliResult`, `VexartAppConfig` and nested config types `@public`

### A.6 `vexart` (dist barrel)

The published npm package `vexart` bundles all internal packages into two entry
points. The barrel (`vexart.js`) re-exports a curated subset from all packages so app
developers need a single import. The engine (`engine.js`) provides the full low-level
surface for power users.

**Barrel rule**: if a consumer needs an import to use any component in the barrel, that
import must also be in the barrel. Forced mixed imports (`vexart` + `vexart/engine`)
for common use cases are considered an API surface bug.

**Collision resolution** (documented in `packages/app/src/barrel.ts`):
- `Box`/`Text`: `@vexart/app` wins (className support)
- `Button`/`ButtonProps`: `@vexart/styled` wins (themed)
- `Switch` (headless): renamed to `ToggleSwitch` to avoid SolidJS `Switch`
- `useRouter`: `@vexart/app` wins (app-level file-based router)

---

**END OF API-POLICY v0.1**
