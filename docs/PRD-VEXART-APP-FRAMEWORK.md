# Vexart App Framework - Product Requirements Document

**Version**: 0.2
**Status**: Closed - Phase 11 implemented and archived
**Owner**: Founder
**Last updated**: April 25, 2026
**Companion to**: [PRD](./PRD.md), [ARCHITECTURE](./ARCHITECTURE.md), [API-POLICY](./API-POLICY.md), [PRD-RUST-RETAINED-ENGINE](./PRD-RUST-RETAINED-ENGINE.md)

**Implementation evidence**:

- Implemented in commit `8cdd9ec feat(app): add Bun-native app framework`.
- Source-of-truth spec: [`openspec/specs/app-framework/spec.md`](../openspec/specs/app-framework/spec.md).
- Archived change: [`openspec/changes/archive/2026-04-25-phase-11-vexart-app-framework/`](../openspec/changes/archive/2026-04-25-phase-11-vexart-app-framework/).

---

## How To Read This Document

This PRD defines a future developer-experience layer on top of the Vexart engine. It does not replace the v0.9 engine PRD. It is a proposed product track for what comes after the engine is stable enough to support application builders.

The core idea is simple:

> Build terminal-native applications with the mental model of React, Tailwind, TypeScript, and Next-style app structure, while rendering through Vexart instead of the DOM.

This document intentionally avoids claiming that Vexart can run a normal Next.js web app unchanged. Vexart has no DOM, no CSSOM, no browser layout engine, and no web server rendering pipeline. The product goal is a terminal-native app framework with familiar web ergonomics, not browser emulation.

When this document conflicts with `docs/PRD.md`, `docs/ARCHITECTURE.md`, or `docs/API-POLICY.md`, the existing master documents win until the founder approves amendments.

---

## 1. Executive Summary

Vexart already proves that terminal UI does not need to look like ASCII art. The next product opportunity is to make Vexart feel immediately familiar to modern frontend developers.

Frontend developers already know how to build with:

- JSX components.
- TypeScript props and state.
- Tailwind utility classes.
- App-level routing.
- Layouts, pages, loading states, error boundaries, and route groups.
- Component libraries and design tokens.

Vexart should package those concepts into a terminal-native application framework: **Vexart App Framework**.

The framework sits above the existing engine packages. It provides authoring ergonomics, project structure, routing, styling, templates, conventions, and build tooling. It does not replace the renderer, retained scene graph, WGPU paint pipeline, or Kitty presentation path.

The runtime decision is explicit: **Vexart App Framework is Bun-native**. React, Next.js, and Tailwind influence the developer experience, but Bun runs the process, Bun executes TypeScript/JavaScript, Bun FFI calls into `libvexart`, and Vexart owns rendering.

```txt
Bun process
  -> Vexart app framework
  -> @vexart/engine
  -> Bun FFI
  -> libvexart native Rust/WGPU
  -> Kitty/Ghostty/WezTerm terminal
```

Target developer experience:

```tsx
import { Page } from "@vexart/app"

export default function DashboardPage() {
  return (
    <Page className="h-full w-full bg-background p-6">
      <box className="rounded-xl border border-border bg-card p-4 shadow-lg">
        <text className="text-xl font-semibold text-foreground">Deployments</text>
        <text className="mt-2 text-sm text-muted-foreground">12 active services</text>
      </box>
    </Page>
  )
}
```

This should compile to Vexart primitives and props, not DOM elements or CSS files.

---

## 2. Product Vision

### 2.1 Vision Statement

Vexart App Framework lets web developers build terminal-native apps using the same mental model they use for modern frontend work: components, routes, layouts, utility styling, typed props, and fast iteration.

### 2.2 Positioning

Primary positioning:

> React-style terminal apps with Tailwind-like styling, powered by Vexart's pixel-native renderer.

Secondary positioning:

> The Next.js-inspired app framework for beautiful terminal software.

What we should not say in early versions:

- "Run Next.js in the terminal."
- "Drop-in React DOM compatibility."
- "Use any Tailwind class."
- "Port your website unchanged."

Those claims are technically misleading. The correct promise is stronger because it is honest: Vexart gives frontend developers familiar ergonomics for a different runtime.

### 2.3 Why This Matters

The engine alone proves technical capability. The app framework converts that capability into adoption.

Most developers will not start by learning engine internals, render loops, Kitty graphics protocol, WGPU, retained scene graphs, or terminal input modes. They will start if the first five minutes feel familiar:

```bash
bun create vexart-app my-terminal-app
cd my-terminal-app
bun dev
```

Then they edit:

```txt
app/page.tsx
```

And they see a beautiful terminal app update.

That is the bridge between a powerful engine and a product people can actually adopt.

---

## 3. Problem Statement

### 3.1 Current Problem

Vexart is powerful but still engine-first. Application authors need to understand too many low-level ideas:

- Which package owns primitives, headless components, and styled components.
- Which props map to layout versus paint versus interaction.
- How routing is structured.
- How to organize a real multi-screen app.
- How to build consistent design systems.
- How to style components without writing repetitive prop objects.
- How to bootstrap a project.
- How to test terminal-visible UI.

The engine can render excellent UI, but the path from "new project" to "real app" needs a productized layer.

### 3.2 User Pain

Frontend developers ask:

- Can I use JSX like React?
- Can I use Tailwind classes?
- Can I structure screens like Next.js pages?
- Can I share domain logic with my web app?
- Can I build a dashboard, editor, CLI wizard, or AI agent UI quickly?
- Can I avoid learning terminal rendering internals?

Today the truthful answer is: mostly yes at the engine level, but not yet as a polished framework.

### 3.3 Business Pain

Without a framework layer, Vexart risks being perceived as a graphics engine for experts. That narrows the market.

With a framework layer, Vexart can be positioned as a developer platform:

- Engine for rendering.
- Components for UI.
- App framework for product development.
- Templates for common use cases.
- Commercial licensing for teams building polished terminal products.

---

## 4. Goals

### 4.1 Product Goals

1. Make Vexart approachable to React/Next/Tailwind developers.
2. Provide a first-class app structure for multi-screen terminal applications.
3. Reduce styling friction with a Tailwind-like `className` authoring layer.
4. Preserve Vexart's terminal-native rendering model and performance goals.
5. Make the default project template beautiful enough to demo publicly.
6. Enable app teams to share TypeScript domain logic between web and terminal apps.
7. Create a clear path for component libraries built on top of Vexart.

### 4.2 Developer Experience Goals

The framework should make these actions feel obvious:

- Create a project.
- Add a route.
- Add a layout.
- Style with utility classes.
- Add interactive components.
- Fetch or load data.
- Show loading and error states.
- Navigate between screens.
- Add keyboard shortcuts.
- Run tests.
- Package the app.

### 4.3 Technical Goals

1. Compile utility classes to Vexart props where possible.
2. Keep styling deterministic and type-safe.
3. Avoid runtime CSS parsing in the hot path.
4. Keep the framework as TypeScript control-plane code above the engine.
5. Avoid adding any native binary beyond `libvexart`.
6. Preserve API-policy discipline for new public exports.
7. Support progressive adoption: users can use primitives directly or use the app framework.

---

## 5. Non-Goals

### 5.1 Not Next.js Runtime Compatibility

The framework is not Next.js. It should not try to run arbitrary Next.js applications.

Out of scope:

- React DOM rendering.
- Browser APIs such as `window`, `document`, layout CSSOM, DOM events.
- Next.js server runtime.
- Next.js middleware.
- Next.js route handlers as HTTP endpoints.
- Next.js image optimizer.
- HTML streaming.
- Hydration.
- Web SSR.

### 5.2 Not Full Tailwind CSS

The framework is not a full CSS engine.

Out of scope for early versions:

- Arbitrary CSS selectors.
- Cascading stylesheet files.
- Pseudo-elements.
- CSS Grid until Vexart exposes grid layout.
- Browser media queries.
- Unsupported CSS filters beyond Vexart's own props.
- Plugins that depend on DOM CSS output.

### 5.3 Not Full React DOM Compatibility

React-style authoring does not mean React DOM compatibility.

Early versions may use the existing SolidJS renderer and JSX runtime while exposing React-familiar conventions. A real React custom renderer can be evaluated later, but it is not required for the first app-framework milestone.

### 5.4 Not Replacing Existing Packages

The app framework does not replace:

- `@vexart/engine`
- `@vexart/primitives`
- `@vexart/headless`
- `@vexart/styled`

It composes them.

---

## 6. Target Users

### 6.1 Primary Persona: Frontend Developer Building CLI Products

Profile:

- Uses React, Next.js, TypeScript, Tailwind.
- Comfortable with component composition.
- Wants terminal apps that look premium.
- Does not want to learn terminal rendering internals first.

Example apps:

- AI agent dashboard.
- Deployment dashboard.
- Database client.
- Cloud resource explorer.
- Git workflow UI.
- Local dev environment manager.

Success criteria:

- Can build a multi-screen app in one day.
- Can style without reading low-level Vexart prop docs constantly.
- Can explain the framework to another React developer in one sentence.

### 6.2 Secondary Persona: DevTool Company

Profile:

- Has a CLI today.
- Wants a branded terminal UX.
- Needs stability, packaging, and commercial support.
- May already have a web dashboard in Next.js.

Example companies:

- Cloud platforms.
- Database providers.
- AI tooling vendors.
- Observability vendors.
- Framework vendors.

Success criteria:

- Can reuse TypeScript domain models and API clients.
- Can ship a branded terminal app with consistent design tokens.
- Can package and distribute reliably.

### 6.3 Tertiary Persona: Terminal App Builder

Profile:

- Wants to build ambitious terminal-native products.
- Comfortable exploring alpha APIs.
- Produces demos that market Vexart.

Example apps:

- Terminal IDE shell.
- Note-taking app.
- Music player.
- Personal dashboard.
- Game launcher.

Success criteria:

- Can compose complex UI with routing, overlays, keyboard shortcuts, and styled components.

---

## 7. Product Shape

### 7.1 Working Name

Recommended name:

```txt
Vexart App Framework
```

Initial public package:

```txt
@vexart/app
```

Founder decision: start with a single public package, `@vexart/app`, for the alpha/beta app-framework track. Router, styles, CLI helpers, config, runtime, and app-level components should be separate internal modules inside that package. If adoption proves that router or styles need independent use/versioning, they can be extracted later as `@vexart/router` or `@vexart/styles` without changing the initial user-facing entrypoint.

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

The package structure requires an architecture amendment before implementation because `docs/ARCHITECTURE.md` currently defines the v0.9 public package set.

### 7.2 Conceptual Stack

```txt
Developer app
  -> Bun runtime
  -> app/ routes, layouts, pages
  -> Tailwind-like className mapper
  -> Vexart styled/headless/primitives
  -> @vexart/engine
  -> libvexart retained renderer
  -> terminal
```

### 7.3 Product Layers

| Layer | Purpose |
|---|---|
| Project template | Fast start with routes, theme, scripts, examples |
| App router | File-system or config-driven screen routing |
| Styling layer | Tailwind-like className to Vexart props |
| Layout conventions | `app/layout.tsx`, route layouts, panels, shells |
| Data conventions | loaders, actions, query helpers, optimistic updates |
| Error/loading states | route-level pending and failure UI |
| Testing utilities | render route, simulate input, compare pixels |
| Packaging utilities | build distributable terminal app |

### 7.4 Runtime Contract

Vexart App Framework MUST run as a Bun-native terminal application framework.

Required runtime properties:

- User apps execute in a Bun process.
- Development commands are Bun-first: `bun dev`, `bun run build`, and `bun create vexart-app`.
- Framework tooling may use Bun APIs where they reduce complexity.
- Native rendering continues through Bun FFI into `libvexart`.
- No Next.js server runtime is required.
- No browser, DOM, CSSOM, hydration, or React DOM runtime is required.
- The framework may borrow file conventions and mental models from Next.js, but it must not depend on Next.js to run terminal apps.

The short positioning is:

> Next-like DX, Bun runtime, Vexart renderer.

---

## 8. Core User Experience

### 8.1 Create A New App

Target command:

```bash
bun create vexart-app my-app
```

Generated structure:

```txt
my-app/
|-- app/
|   |-- layout.tsx
|   |-- page.tsx
|   |-- loading.tsx
|   |-- error.tsx
|   |-- settings/
|   |   `-- page.tsx
|   `-- _components/
|       |-- app-shell.tsx
|       `-- sidebar.tsx
|-- src/
|   |-- actions/
|   |-- data/
|   |-- theme/
|   `-- shortcuts/
|-- vexart.config.ts
|-- package.json
|-- tsconfig.json
`-- README.md
```

### 8.2 Run In Development

Target command:

```bash
bun dev
```

Expected behavior:

- Starts the terminal app.
- Shows current route.
- Watches source files where possible.
- Restarts or hot-reloads depending on implementation phase.
- Prints clear terminal capability diagnostics.

Hot reload is a product goal, but not a first milestone requirement if it risks destabilizing the engine.

### 8.3 Build For Distribution

Target command:

```bash
bun run build
```

Expected output:

- Bundled JS entrypoint.
- Native `libvexart` platform asset included through `@vexart/engine`.
- CLI executable or script entry.
- Package metadata.

---

## 9. Routing Requirements

### 9.1 App Router Model

The framework should provide an App Router inspired by Next.js, adapted for terminal screens.

Supported concepts:

- `app/layout.tsx`: root shell.
- `app/page.tsx`: default route.
- Nested route folders.
- Route groups using folders like `(workspace)`.
- Private folders using `_components`.
- `loading.tsx` for async pending state.
- `error.tsx` for route-level failure state.
- `not-found.tsx` for missing route.

Example:

```txt
app/
|-- layout.tsx
|-- page.tsx
|-- projects/
|   |-- page.tsx
|   `-- [id]/
|       |-- page.tsx
|       |-- loading.tsx
|       `-- error.tsx
`-- settings/
    `-- page.tsx
```

### 9.2 Navigation API

Target API:

```ts
import { useRouter } from "@vexart/app"

const router = useRouter()

router.push("/projects")
router.replace("/settings")
router.back()
router.forward()
```

Requirements:

- Navigation must be keyboard-friendly.
- Route changes must mark the correct UI dirty.
- Focus should move predictably after navigation.
- Route transitions should support optional animation later.

### 9.3 Route Params

Target API:

```tsx
export default function ProjectPage(props: { params: { id: string } }) {
  return <text>Project {props.params.id}</text>
}
```

Requirements:

- Dynamic segments use `[id]` naming.
- Params are strings initially.
- Typed route generation is a later milestone.

### 9.4 Terminal-Specific Routing

Terminal apps need routing concepts web apps do not:

- Modal routes for dialogs.
- Command palette routes.
- Split-pane route regions.
- Stack navigation for wizard flows.
- Focus restoration per route.

The router should support these over time without copying browser history blindly.

---

## 10. Styling Requirements

### 10.1 ClassName Authoring

The framework should allow:

```tsx
<box className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
  <text className="text-lg font-semibold text-foreground">Status</text>
  <text className="text-sm text-muted-foreground">All systems operational</text>
</box>
```

This maps to Vexart props such as:

- `direction`
- `gap`
- `cornerRadius`
- `borderWidth`
- `borderColor`
- `backgroundColor`
- `padding`
- `shadow`
- `fontSize`
- `fontWeight`
- `color`

### 10.2 Styling Principle

Class names are an authoring convenience. Vexart remains prop-driven internally.

```txt
className string
  -> parse/compile
  -> normalized Vexart style object
  -> primitive props
  -> retained scene mutations
```

### 10.3 Compile-Time First

Preferred implementation:

- Static class strings are compiled at build time.
- Dynamic class strings are normalized through a small runtime resolver.
- Unsupported classes produce warnings in development.
- Unknown classes should not silently do nothing unless configured.

### 10.4 Supported Utility Families

Initial support:

- Layout: `flex`, `flex-row`, `flex-col`, `items-*`, `justify-*`.
- Spacing: `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`, `m-*`, `mx-*`, `my-*`, per-side margin.
- Gap: `gap-*`, `gap-x-*`, `gap-y-*` where supported.
- Size: `w-*`, `h-*`, `min-w-*`, `max-w-*`, `min-h-*`, `max-h-*`.
- Color: `bg-*`, `text-*`, `border-*` mapped through theme tokens.
- Border: `border`, `border-0`, `border-2`, `rounded-*`, per-corner rounded later.
- Typography: `text-xs` through `text-4xl`, `font-normal`, `font-medium`, `font-semibold`, `font-bold`.
- Effects: `shadow-*`, `opacity-*`, `blur-*` only where Vexart has equivalent props.
- State variants: `hover:`, `active:`, `focus:` mapped to `hoverStyle`, `activeStyle`, `focusStyle`.

### 10.5 Unsupported Utility Policy

Unsupported classes fall into three categories:

1. Impossible in terminal runtime.
2. Possible but not implemented yet.
3. Possible only after engine support exists.

Development mode should report actionable messages:

```txt
Unsupported Vexart class: grid-cols-3
Reason: CSS Grid is not available in Vexart v0.9.
Suggestion: use flex-row/gap or WrapRow.
```

### 10.6 Theme Tokens

The class mapper must use Vexart theme tokens, not arbitrary hex strings by default.

Recommended token groups:

- `background`
- `foreground`
- `card`
- `card-foreground`
- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `muted`
- `muted-foreground`
- `accent`
- `accent-foreground`
- `destructive`
- `destructive-foreground`
- `border`
- `input`
- `ring`

### 10.7 Responsive Styling

Browser breakpoints do not map directly to terminal UIs. The framework should define terminal-aware breakpoints based on pixel width or cell columns.

Example names:

```txt
sm: 80 columns
md: 120 columns
lg: 160 columns
xl: 200 columns
```

Responsive utility support is a later milestone. Initial versions can require explicit `useTerminalDimensions()` logic.

---

## 11. Component Model

### 11.1 Primitive Elements

The app framework should preserve direct access to Vexart primitives:

```tsx
<box />
<text />
<image />
<canvas />
```

The framework may add higher-level wrappers, but it must not hide primitives from serious app builders.

### 11.2 Styled Components

The framework should ship default styled components that work with `className`:

```tsx
import { Button, Card, Input } from "@vexart/app"

<Button className="w-full" variant="primary">Deploy</Button>
<Card className="p-4">...</Card>
<Input placeholder="Search projects" />
```

### 11.3 Headless Escape Hatch

Every styled component should have a headless or render-prop escape hatch. Serious teams will need custom visuals.

### 11.4 Component API Rules

All new public components must obey `docs/API-POLICY.md`:

- Explicit exports in `public.ts`.
- API extractor snapshot updates.
- JSDoc stability annotations.
- Additive changes preferred.
- Breaking changes require a version policy decision.

---

## 12. React Compatibility Strategy

### 12.1 Reality Check

Vexart currently uses SolidJS-style rendering. The framework should not pretend to be React DOM.

There are three possible compatibility levels:

| Level | Description | Recommendation |
|---|---|---|
| React-familiar JSX | Components look like React, but run on Vexart/Solid runtime | First milestone |
| React package compatibility | Support selected React APIs through adapters | Research milestone |
| Real React custom renderer | Implement a React reconciler target for Vexart | Later, only if adoption demands it |

### 12.2 First Milestone

The first milestone should optimize for familiarity, not full compatibility.

Allowed:

- Function components.
- JSX props.
- `children` composition.
- TypeScript props.
- Hooks exposed by Vexart.

Not required:

- `react-dom`.
- React Server Components.
- Hydration.
- React synthetic events.
- Full React ecosystem compatibility.

### 12.3 Future React Renderer Research

If user demand is strong, evaluate a true React custom renderer.

Research questions:

- Can React reconciliation map cleanly to retained Vexart nodes?
- What is the event model gap between React synthetic events and Vexart terminal events?
- How does React scheduling interact with Vexart's frame scheduler?
- Is the DX benefit worth maintaining two renderers?
- Can the React Compiler reduce memoization pressure in terminal apps?

No production commitment should be made until this research is complete.

---

## 13. Data And Actions

### 13.1 Loaders

Routes should support async data loading.

Target concept:

```tsx
export async function loader() {
  return getDeployments()
}

export default function Page(props: { data: Awaited<ReturnType<typeof loader>> }) {
  return <DeploymentList deployments={props.data} />
}
```

### 13.2 Actions

Terminal apps need mutation flows similar to server actions, but local-first.

Target concept:

```tsx
export async function deployAction(input: DeployInput) {
  return deployService(input)
}
```

Actions should integrate with:

- Pending state.
- Error display.
- Optimistic updates.
- Keyboard shortcuts.
- Toasts.
- Route refresh.

### 13.3 Query Integration

The framework can build on Vexart's existing `useQuery` and `useMutation` APIs.

Requirements:

- Keep data APIs optional.
- Do not force a specific backend.
- Make local filesystem, HTTP, and subprocess data sources easy.

---

## 14. Terminal-Specific Interaction Requirements

### 14.1 Keyboard First

Terminal apps are keyboard-first. The framework must treat keyboard navigation as primary, not an afterthought.

Requirements:

- Route-level shortcuts.
- Global shortcuts.
- Command palette support.
- Focus restoration.
- Focus traps for dialogs.
- Predictable Tab and Shift+Tab traversal.

### 14.2 Mouse Support

Mouse should feel natural where terminals support it.

Requirements:

- Clickable buttons, lists, tabs, menus.
- Drag interactions for sliders and panels.
- Hover states.
- Pointer capture for drag gestures.

### 14.3 Command Palette

The app framework should eventually provide a default command palette primitive:

- Open with `Cmd+K` / `Ctrl+K`.
- Search actions and routes.
- Execute commands.
- Navigate to pages.
- Integrate with route metadata.

---

## 15. Configuration

### 15.1 `vexart.config.ts`

Target config:

```ts
import { defineConfig } from "@vexart/app/config"

export default defineConfig({
  app: {
    name: "Acme Deploy",
    defaultRoute: "/",
  },
  theme: {
    preset: "void",
  },
  styles: {
    className: true,
    unknownClass: "warn",
  },
  terminal: {
    minColumns: 100,
    minRows: 30,
  },
})
```

### 15.2 Config Requirements

- Typed config.
- Safe defaults.
- Clear validation errors.
- No required config for hello-world apps.
- Explicit escape hatches for advanced users.

---

## 16. CLI Requirements

### 16.1 Commands

Target commands:

```bash
vexart dev
vexart build
vexart routes
vexart doctor
vexart test
```

### 16.2 Doctor

`vexart doctor` should check:

- Bun version.
- Native binary availability.
- Terminal type.
- Kitty graphics support.
- Mouse support.
- Font atlas availability.
- Package version consistency.

### 16.3 Routes

`vexart routes` should print the route tree:

```txt
/                  app/page.tsx
/projects          app/projects/page.tsx
/projects/[id]     app/projects/[id]/page.tsx
/settings          app/settings/page.tsx
```

---

## 17. Testing Requirements

### 17.1 Unit Tests

Required coverage:

- className parser.
- className conflict resolution.
- utility-to-prop mapping.
- router path matching.
- route params.
- route group handling.
- loading/error fallback selection.
- config validation.

### 17.2 Interaction Tests

Required coverage:

- keyboard navigation between routes.
- focus restoration after route changes.
- command palette open/close.
- dialog focus trap.
- mouse click navigation.

### 17.3 Visual Tests

Required scenes:

- starter dashboard.
- sidebar app shell.
- nested routes.
- loading state.
- error state.
- command palette.
- Tailwind-like class variants.
- responsive terminal width variants when supported.

### 17.4 Compatibility Tests

The framework must verify that direct Vexart primitive usage still works inside app routes.

---

## 18. Documentation Requirements

### 18.1 Required Docs

- Getting started.
- Routing guide.
- Styling guide.
- Theme guide.
- Data loading guide.
- Actions/mutations guide.
- Keyboard shortcuts guide.
- Testing guide.
- Packaging/deployment guide.
- Migration from primitives-only Vexart.
- Comparison with Next.js, React, and Tailwind.

### 18.2 Documentation Tone

Docs should be explicit about runtime differences.

Good:

> Vexart uses JSX and familiar app-router conventions, but renders terminal-native pixels instead of DOM nodes.

Bad:

> Vexart runs Next.js in your terminal.

---

## 19. Phased Roadmap

### Phase 0: Research And Product Lock

Deliverables:

- Finalize this PRD.
- Create OpenSpec change.
- Record the founder decision to start with single public package `@vexart/app`.
- Define supported Tailwind utility subset.
- Define routing file conventions.

Exit criteria:

- Founder approves scope.
- No conflict with existing v0.9 closeout plan.
- Architecture amendment drafted if new public packages are needed.

### Phase 1: ClassName Mapper

Deliverables:

- Static utility parser.
- Theme token resolver.
- Utility-to-prop mapper.
- State variants mapped to hover/active/focus styles.
- Development warnings for unsupported classes.

Exit criteria:

- Primitives accept `className` through the framework layer.
- Visual tests prove className output matches equivalent props.

### Phase 2: App Router

Deliverables:

- File route discovery.
- Layout/page composition.
- Dynamic params.
- Loading/error/not-found conventions.
- `useRouter()` navigation API.

Exit criteria:

- Starter app has at least 4 routes.
- Keyboard and mouse navigation work.
- Tests cover route matching and focus restoration.

### Phase 3: Starter Template And CLI

Deliverables:

- `bun create vexart-app`.
- `vexart dev`.
- `vexart routes`.
- `vexart doctor`.
- Default beautiful dashboard template.

Exit criteria:

- New user can create and run an app in under 5 minutes.
- Doctor provides useful terminal diagnostics.

### Phase 4: Data And Actions

Deliverables:

- Route loaders.
- Route actions.
- Pending and error state integration.
- Refresh/revalidate route API.

Exit criteria:

- Example deployment dashboard can fetch, mutate, refresh, and display errors.

### Phase 5: Advanced DX

Deliverables:

- Command palette.
- Route metadata.
- Typed routes.
- Responsive terminal breakpoints.
- Better dev restart or hot reload.

Exit criteria:

- App framework feels competitive with modern frontend tooling for terminal-native apps.

### Phase 6: React Compatibility Research

Deliverables:

- Technical evaluation of a React custom renderer.
- Compatibility matrix.
- Decision: continue Solid-backed JSX, support React adapter, or build real React renderer.

Exit criteria:

- Founder decision based on adoption, maintenance cost, and technical feasibility.

---

## 20. Success Metrics

### 20.1 Adoption Metrics

- 500+ weekly downloads of app framework package within 90 days of alpha.
- 20+ public starter apps or demos built by users.
- 5+ serious showcase apps.
- 3+ companies evaluating commercial use.

### 20.2 Developer Experience Metrics

- New app creation to first rendered screen under 5 minutes.
- Add new route under 2 minutes.
- Style a card with utility classes without reading API docs.
- `vexart doctor` resolves at least 80% of setup issues without maintainer support.

### 20.3 Quality Metrics

- Visual test suite passes with 0.5% diff threshold.
- Router unit tests cover all route conventions.
- ClassName parser has full supported utility coverage.
- Typecheck passes in generated starter template.
- No new native binary artifact.

---

## 21. Risks And Tradeoffs

### 21.1 Risk: Overpromising Next.js Compatibility

If messaging says "Next.js in terminal," users will expect web compatibility that Vexart cannot and should not provide.

Mitigation:

- Use "Next-inspired" or "App Router-style" language.
- Document unsupported features clearly.
- Provide migration examples for shared domain logic, not shared pages.

### 21.2 Risk: Tailwind Scope Explosion

Tailwind is huge. Full compatibility would become a CSS engine project.

Mitigation:

- Support a curated utility subset.
- Make unsupported classes explicit.
- Compile to Vexart props.
- Avoid CSS cascade.

### 21.3 Risk: React Compatibility Maintenance Cost

A real React renderer could double renderer maintenance.

Mitigation:

- Start with React-familiar API, not real React compatibility.
- Research before committing.
- Keep SolidJS renderer as the proven path until evidence says otherwise.

### 21.4 Risk: Framework Distracts From Engine Stability

The app framework only works if the engine is stable.

Mitigation:

- Keep this track separate from v0.9 release-readiness.
- Do not remove Lightcode/native validation work.
- Gate framework milestones on engine visual and interaction stability.

---

## 22. Open Questions

1. Should `className` support live in primitives or only in the app framework layer?
2. Should className parsing happen through a Bun plugin, Babel plugin, or runtime parser first?
3. How much Tailwind naming should be copied versus Vexart-specific utility naming?
4. Should route files export `loader`/`action`, or should data stay entirely hook-based in v1?
5. Should typed routes be generated from the file tree?
6. What is the minimum terminal size for generated templates?
7. Should the default starter template target dashboard apps, CLI wizard apps, or AI agent apps first?
8. When, if ever, should Vexart build a true React custom renderer?
9. Does adding `@vexart/app` require a PRD/Architecture version bump before implementation?

---

## 23. Initial Founder Decisions Proposed

Recommended decisions for v0.1 of this PRD:

1. Build a Vexart-native app framework, not a Next.js runtime.
2. Use Next.js App Router as inspiration for file conventions, not as compatibility target.
3. Add Tailwind-like `className` as an authoring layer that compiles to Vexart props.
4. Start with a curated utility subset and explicit unsupported-class warnings.
5. Keep direct primitive props as the source of truth and escape hatch.
6. Defer true React renderer work to a research phase.
7. Keep the runtime artifact model unchanged: JS packages plus `libvexart` only.
8. Do not block v0.9 release closeout on this framework track.
9. Make Bun the required runtime for app-framework tooling and generated applications.
10. Start with one public package, `@vexart/app`, with internally separated router/styles/cli/config/components/runtime modules.

---

## 24. One-Sentence Product Promise

> Vexart App Framework lets frontend developers build beautiful terminal-native applications with JSX, TypeScript, Tailwind-like styling, and Next-inspired routing, powered by Vexart's pixel-native renderer.
