# Design: Phase 11 - Vexart App Framework

## Technical Approach

Build the app framework as a TypeScript control-plane layer above the existing Vexart packages. The runtime remains a Bun process. Rendering remains Vexart primitives/headless/styled components through `@vexart/engine` and `libvexart`.

```txt
Bun process
  -> app-framework router/style/template layer
  -> @vexart/styled / @vexart/headless / @vexart/primitives
  -> @vexart/engine
  -> Bun FFI
  -> libvexart
  -> terminal
```

## Runtime Boundary

The app framework MUST NOT depend on Next.js at runtime. Next.js concepts are used only as design inspiration.

Allowed runtime dependencies:

- Bun APIs.
- Existing Vexart packages.
- Lightweight parser/build utilities approved by package policy.

Forbidden runtime assumptions:

- DOM.
- CSSOM.
- React DOM.
- Next.js server runtime.
- Hydration.
- HTML streaming.

## Package Boundary Options

Founder decision: use **Option A** for the first implementation. Vexart App Framework starts as one public package, `@vexart/app`, with internal modules split by concern. Split packages remain a later extraction path if adoption proves the need.

### Option A: Single Package

```txt
@vexart/app
```

Contains router, styles, CLI helpers, template runtime, and app-level components.

Tradeoff:

- Best for initial adoption and simpler docs.
- Risk of one package becoming too broad.

### Option B: Split Packages

```txt
@vexart/app
@vexart/router
@vexart/styles
@vexart/create-app
```

Tradeoff:

- Cleaner long-term boundaries.
- Higher early maintenance and user cognitive load.

### Recommended First Decision

Start with `@vexart/app` as the public user-facing entry, but keep internal folders split by concern so extraction remains possible.

Target internal structure:

```txt
packages/app/src/
|-- public.ts
|-- index.ts
|-- router/
|-- styles/
|-- cli/
|-- config/
|-- components/
`-- runtime/
```

## Styling Design

The className mapper converts supported utility classes to Vexart props.

```txt
className
  -> tokenize
  -> resolve variants
  -> resolve theme tokens
  -> merge conflicts
  -> emit Vexart props
```

Supported output targets:

- Base props.
- `hoverStyle`.
- `activeStyle`.
- `focusStyle`.

The mapper should prefer static compilation later, but the first prototype may use runtime parsing to validate semantics.

## Router Design

Route discovery maps an `app/` file tree into a terminal route tree.

Supported first-pass files:

- `layout.tsx`
- `page.tsx`
- `loading.tsx`
- `error.tsx`
- `not-found.tsx`

The router must own terminal-specific behavior that web routers do not:

- Focus restoration after route changes.
- Keyboard navigation defaults.
- Modal/stack route extension points.
- Route metadata for command palettes.

## CLI Design

CLI commands should be Bun-first.

```bash
bun create vexart-app my-app
bun dev
bun run build
vexart routes
vexart doctor
```

The CLI must report terminal capability problems clearly instead of failing with renderer internals.

## Verification Strategy

Before implementation:

- Verify package boundary decision against `docs/ARCHITECTURE.md`.
- Verify new public exports against `docs/API-POLICY.md`.

During implementation:

- Parser unit tests.
- Router unit tests.
- Generated template `bun run typecheck`.
- Minimal visual test for className equivalence to props.
- Interaction test for route navigation and focus restoration.

## Open Technical Questions

1. Should `className` be accepted by primitives globally or only via framework wrappers?
2. Should route discovery happen at runtime first, then move to build-time generation?
3. What utility conflict resolver is acceptable without importing Tailwind itself?
4. Should generated apps default to Solid-compatible JSX or a React-style adapter facade?
5. How much CLI behavior belongs in `@vexart/app` versus a separate create-app package?
