# Tasks: v0.9 Release Readiness Audit

## 1. Establish release-readiness inventory

- [x] 1.1 Audit `docs/PRD.md` §5.1, §7.3, §9.1, and §11 against repo evidence.
- [x] 1.2 Audit active `openspec/changes/*` for unchecked tasks and stale active changes.
- [x] 1.3 Create release-readiness proposal, design, delta spec, tasks, and verify report.
- [x] 1.4 Decide whether this audit becomes the canonical v0.9 readiness tracker until release.

## 2. Release blockers — implementation

### 2.1 Native render graph / retained visual path

- [x] 2.1.1 Finish `phase-3d-native-render-graph` task reconciliation.
- [x] 2.1.2 Verify native scene + layout can generate full render ops for normal retained path.
- [x] 2.1.3 Wire or verify coverage for rect, rounded/per-corner rect, borders, shadows, glow, gradients, blend modes, backdrop filters, self filters, images, transforms, opacity, text, and canvas.
- [x] 2.1.4 Add or confirm effect-specific golden coverage for native render graph paths.
- [x] 2.1.5 Make TS render graph generation fallback-only for normal presentation, or record explicit remaining migration boundary.

### 2.2 Retained layout, damage, and hit-testing

- [x] 2.2.1 Reconcile `phase-3c-native-layout-hit-test` unchecked tasks against current implementation.
- [x] 2.2.2 Prove retained layout parity across representative fixtures, including text containers and nested scroll containers.
- [x] 2.2.3 Prove retained visual damage ownership for hover/focus/text/visual-prop updates.
- [x] 2.2.4 Prove retained hit-testing parity for transforms, scroll clipping, pointer capture, focus, bubbling, and pointer passthrough.

### 2.3 API lock and public surface

- [x] 2.3.1 Remove or justify package entry-point `export *` usage according to `docs/API-POLICY.md`.
- [x] 2.3.2 Ensure all public package exports are explicit and snapshotted.
- [x] 2.3.3 Run `bun run api:check` and record clean state or approved snapshot diff.
- [x] 2.3.4 Decide v0.9 package versioning plan; current packages report `0.0.1`.

### 2.4 PRD product surface gaps

- [x] 2.4.1 Verify and implement missing `margin` props if still absent.
- [x] 2.4.2 Verify JSX intrinsic names match PRD: `<box>`, `<text>`, `<image>`, `<canvas>`; add aliases or update PRD with founder approval.
- [x] 2.4.3 Verify the headless/styled/primitives component split matches PRD intent, or record the final package ownership model.
- [x] 2.4.4 Verify WGPU PipelineCache is active in the real context path, not only implemented as a manager.

## 3. Release blockers — documentation and examples

- [x] 3.1 Replace stale `@tge/*` references in user-facing docs/examples with final `@vexart/*` package names.
- [x] 3.2 Remove or update stale Clay/Zig wording from docs/examples.
- [x] 3.3 Validate at least 15 working examples with current package names and terminal support assumptions.
- [x] 3.4 Build docs site with `bun run docs:build` and record output.
- [ ] 3.5 Record docs deployment evidence or keep `docs deployed` as founder/manual evidence required.

## 4. Release blockers — validation evidence

- [x] 4.1 Run golden visual suite: `bun run test:visual`.
- [x] 4.2 Run native render graph parity visual suite: `bun run test:visual:native-render-graph` if still required.
- [x] 4.3 Run 1080p/dashboard and retained category performance gates on reference hardware.
- [ ] 4.4 Run real terminal matrix for Kitty, Ghostty, and WezTerm; mark unsupported terminals explicitly.
- [ ] 4.5 Record private beta evidence for 10 active users or mark as founder/manual evidence required.
- [ ] 4.6 Record zero P0 bug evidence or mark as founder/manual evidence required.
- [x] 4.7 Run dependency/security audit and record zero known vulnerabilities.
- [ ] 4.8 Record first-paint, idle CPU, memory baseline, MSDF throughput, and compositor-animation latency evidence.

## 5. OpenSpec reconciliation and archive hygiene

- [ ] 5.1 Reconcile or archive stale `phase-2-native-consolidation` tasks.
- [ ] 5.2 Complete or archive `phase-2b-native-presentation` after real terminal parity evidence.
- [ ] 5.3 Complete or archive `phase-2c-native-layer-registry` after layer ownership evidence.
- [ ] 5.4 Complete or archive `phase-3b-native-scene-graph` after example/native flag verification.
- [x] 5.5 Complete or archive `phase-3c-native-layout-hit-test` after retained layout/damage/hit-test evidence.
- [ ] 5.6 Complete or archive `phase-3d-native-render-graph` after native visual path completion.
- [ ] 5.7 Archive completed active changes that have no substantive blockers.
- [ ] 5.8 Reconcile orphan/spec-only active directories: `phase-4c-native-image-asset-handles`, `phase-4d-native-canvas-display-list`, `phase-8-retained-cleanup`.

## 6. Verification for this audit change

- [ ] 6.1 Review this audit with the founder and confirm priority order.
- [x] 6.2 Update `verify-report.md` as each release blocker is closed.
- [ ] 6.3 Do not archive this audit until all v0.9 release criteria are either satisfied or explicitly descoped by founder-approved PRD decision.
