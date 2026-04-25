# Tasks: Phase 11 - Vexart App Framework

## Phase 1: Product Lock

- [x] 1.1 Review `docs/PRD-VEXART-APP-FRAMEWORK.md` with founder and mark approved decisions.
- [x] 1.2 Confirm the runtime statement: Next-like DX, Bun runtime, Vexart renderer.
- [x] 1.3 Decide initial package shape: single public package `@vexart/app` with internal router/styles/cli/config/components/runtime modules.
- [x] 1.4 Decide whether `className` lands globally on primitives or only through framework wrappers.

## Phase 2: Architecture And API Amendments

- [x] 2.1 Draft `docs/ARCHITECTURE.md` amendment for `@vexart/app` package boundary.
- [x] 2.2 Draft `docs/API-POLICY.md` amendment for app-framework public exports.
- [x] 2.3 Add package API inventory once names are approved.
- [x] 2.4 Define compatibility policy for experimental app-framework APIs.

## Phase 3: Styling Spec

- [x] 3.1 Write supported utility matrix for layout, spacing, sizing, color, typography, border, shadow, opacity, and state variants.
- [x] 3.2 Specify conflict resolution rules for utility classes.
- [x] 3.3 Specify unsupported-class diagnostics.
- [x] 3.4 Specify theme token mapping from utility names to Vexart colors/radius/space/font/shadow tokens.
- [x] 3.5 Specify className-to-props output shape for base, hover, active, and focus styles.

## Phase 4: Router Spec

- [x] 4.1 Specify route discovery for `app/layout.tsx`, `app/page.tsx`, nested folders, route groups, and private folders.
- [x] 4.2 Specify dynamic params and route matching.
- [x] 4.3 Specify loading/error/not-found behavior.
- [x] 4.4 Specify `useRouter()` API and navigation semantics.
- [x] 4.5 Specify focus restoration and keyboard navigation after route changes.

## Phase 5: CLI And Template Spec

- [x] 5.1 Specify `bun create vexart-app` generated files.
- [x] 5.2 Specify `vexart dev`, `vexart build`, `vexart routes`, and `vexart doctor` commands.
- [x] 5.3 Specify default starter template UX.
- [x] 5.4 Specify terminal capability diagnostics.

## Phase 6: Prototype Implementation

- [x] 6.1 Implement minimal className mapper prototype.
- [x] 6.2 Implement minimal route tree prototype with two routes and one layout.
- [x] 6.3 Implement minimal Bun starter app.
- [x] 6.4 Add visual test proving className output matches explicit props.
- [x] 6.5 Add interaction test proving route navigation restores focus.

## Phase 7: Verification

- [x] 7.1 Run `bun run typecheck`.
- [x] 7.2 Run `bun test`.
- [x] 7.3 Run app-framework targeted tests.
- [x] 7.4 Run visual tests for app-framework scenes.
- [x] 7.5 Update verify report with evidence and remaining risks.
