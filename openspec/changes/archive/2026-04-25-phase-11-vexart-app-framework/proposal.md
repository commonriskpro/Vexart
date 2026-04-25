# Proposal: Phase 11 - Vexart App Framework

## Intent

Create the product and technical track for a Bun-native application framework on top of Vexart. The goal is to let frontend developers build terminal-native applications with React-style JSX familiarity, Tailwind-like utility styling, TypeScript-first templates, and Next-inspired app routing while keeping Vexart's renderer, retained engine, and terminal presentation model intact.

This change satisfies `docs/PRD-VEXART-APP-FRAMEWORK.md` and depends on the existing engine contract in `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/API-POLICY.md`.

## Scope

### In Scope

1. **Bun-native runtime contract** - Generated apps and framework tooling run on Bun. Next.js is not used as the runtime.
2. **App framework package design** - Ship the initial public API as a single package, `@vexart/app`, with internally separated router, styles, CLI, config, components, and runtime modules.
3. **Tailwind-like styling contract** - Specify `className` support, supported utility subsets, conflict resolution, state variants, theme token mapping, and unsupported-class diagnostics.
4. **Next-inspired router contract** - Specify `app/layout.tsx`, `app/page.tsx`, nested routes, route groups, dynamic params, loading/error/not-found files, and terminal-specific navigation/focus behavior.
5. **Starter app and CLI contract** - Specify `bun create vexart-app`, `vexart dev`, `vexart build`, `vexart routes`, and `vexart doctor`.
6. **Testing and validation contract** - Define parser/router unit tests, interaction tests, visual tests, generated-template typecheck, and doctor diagnostics.
7. **Architecture amendment plan** - Identify required updates to `docs/ARCHITECTURE.md` and `docs/API-POLICY.md` before public packages are added.

### Out Of Scope

- Running arbitrary Next.js applications.
- Depending on the Next.js server runtime.
- React DOM compatibility.
- Browser APIs, DOM, CSSOM, hydration, SSR, or HTML streaming.
- Full Tailwind CSS compatibility.
- True React custom renderer implementation before the research phase.
- Blocking v0.9 release-readiness closeout on app-framework work.

## Capabilities

### New Capabilities

- `app-framework-runtime`: Bun-native app framework runtime contract.
- `app-framework-routing`: Next-inspired terminal route conventions.
- `app-framework-styling`: Tailwind-like utility-to-Vexart-prop styling contract.
- `app-framework-cli`: create/dev/build/routes/doctor command behavior.

### Modified Capabilities

- Package architecture will need an amendment if new public packages are introduced.
- Public API policy will need explicit app-framework package export rules.

## Approach

This phase should proceed in decision-first slices:

| Slice | Deliverable |
|---|---|
| 1 | Finalize founder decisions in `docs/PRD-VEXART-APP-FRAMEWORK.md` |
| 2 | Draft architecture amendment for the new `@vexart/app` package boundary |
| 3 | Draft detailed styling spec and utility support matrix |
| 4 | Draft detailed routing spec and route discovery algorithm |
| 5 | Draft CLI/template design and generated project structure |
| 6 | Implement the smallest vertical prototype: one Bun app, two routes, className mapper, and visual test |

## Affected Areas

| Area | Impact |
|---|---|
| `docs/PRD-VEXART-APP-FRAMEWORK.md` | Source product contract for this track |
| `docs/ARCHITECTURE.md` | Requires amendment before new public packages ship |
| `docs/API-POLICY.md` | Requires app-framework public API inventory once package names are chosen |
| `packages/` | Future package additions after architecture approval |
| `scripts/` | Future create-app/dev/build/doctor tooling |
| `scripts/visual-test/` | Future app-framework visual scenes |

## Risks

| Risk | Likelihood | Mitigation |
|---|---:|---|
| Users misunderstand this as Next.js runtime compatibility | High | Product docs must say "Next-inspired" and "Bun-native" explicitly |
| Tailwind-like mapper grows into a full CSS engine | Medium | Start with curated utility subset and unsupported-class diagnostics |
| New public packages conflict with architecture/API policy | Medium | Require architecture and API-policy amendments before implementation |
| Framework work distracts from v0.9 closeout | Medium | Keep this phase separate and do not gate v0.9 release-readiness on it |
| React custom renderer doubles maintenance cost | Medium | Keep React renderer as research-only until adoption proves need |

## Rollback Plan

Until implementation begins, rollback is documentation-only: remove this change directory and revert PRD edits. After implementation starts, each package/tooling slice must be independently revertible.

## Dependencies

- `docs/PRD-VEXART-APP-FRAMEWORK.md` founder approval.
- v0.9 engine stability sufficient for app-framework examples.
- Architecture/API policy amendments before `@vexart/app` is exported publicly.

## Success Criteria

- [ ] Founder approves Bun-native app-framework direction.
- [x] Architecture package decision is recorded: start with single public package `@vexart/app`.
- [ ] Styling utility support matrix is written.
- [ ] Router conventions and focus behavior are specified.
- [ ] CLI/template behavior is specified.
- [ ] A minimal prototype proves: Bun app + two routes + className mapper + Vexart render.
- [ ] Validation commands are defined before implementation begins.
