# Verify Report: v0.9 Release Readiness Audit

## Current status

Date: 2026-04-24

Status: technical readiness gaps are closed or have an explicit migration boundary. Final PRD/v0.9 closeout still requires founder/manual evidence for external release criteria.

## Closed technical blockers

- Canonical tracker: this `v0.9-release-readiness-audit` change is the active readiness tracker until release.
- Native render graph: supported fully-covered retained layers dispatch through Rust `vexart_scene_paint_dispatch`; unsupported semantics are fallback-gated instead of approximated.
- Native visual coverage verified by `bun run test:visual:native-render-graph`: 40/40 passing with native render graph usage and 0.00% diffs.
- Golden visual suite refreshed and verified by `bun run test:visual`: 40/40 passing with 0.00% diffs.
- Retained layout/damage/hit-testing reconciled in `phase-3c-native-layout-hit-test`:
  - layout parity covers core layout, constraints, alignment, text containers, nested scroll containers, border/padding, multiline text, and floating positioning.
  - damage coverage includes layout-transition, visual prop, text visual prop, and interactive style updates.
  - hit-testing coverage includes transforms, scroll clipping, pointer capture, focus traversal, bubbling/stopPropagation, pointer passthrough, and minimum hit-area expansion.
- API lock:
  - root package `index.ts` files only use the single `export * from "./public"` pattern explicitly allowed by `docs/API-POLICY.md` §2.3.
  - public package exports remain explicit in `public.ts`.
  - `bun run api:check` completed successfully.
- Versioning: root and public packages now use `0.9.0-beta.0` instead of `0.0.1`.
- PRD surface:
  - `margin`, `marginX`, `marginY`, and per-side margin props are implemented in TS props and Rust retained layout.
  - JSX intrinsics include `<box>`, `<text>`, `<image>`, and `<canvas>`; `<img>` and `<surface>` remain compatibility aliases.
  - package ownership is documented as `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, and `@vexart/styled`.
  - WGPU PipelineCache is active in the paint context when the adapter supports `PIPELINE_CACHE`, and safely disabled otherwise.
- Docs/examples:
  - user-facing docs were refreshed from stale `@tge/*`/Clay/Zig guidance to current Vexart/Rust/WGPU/Taffy guidance.
  - examples were refreshed with Vexart wording and `VEXART_*` env names while keeping legacy env fallbacks.
  - `bun run docs:build` completed successfully: 10 static pages built.
- Security: `bun audit` reports `No vulnerabilities found` after dependency updates and Hono override.
- Performance evidence collected locally:
  - `bun run perf:check`: 15.51 ms/frame at 800×600, within ±30% threshold.
  - `bun run bench:dashboard-1080p`: dashboard-1080p p95=7.71 ms, p99=9.36 ms, avg=6.28 ms across 300 frames.
  - retained categories from the same run: noop-retained p95=0.00 ms, dirty-region p95=4.76 ms, compositor-only p95=3.00 ms.
- Terminal transport probe collected locally by `bun run validate:terminal-transport`: non-interactive local probe detected Kitty graphics support but native presentation was off in this shell.

## Verification commands run

- `cargo test`
- `cargo build`
- `bun run typecheck`
- `bun test`
- `bun run gen:jsx-runtime`
- `bun run api:check`
- `bun audit`
- `bun run docs:build`
- `bun run test:visual:update`
- `bun run test:visual`
- `bun run test:visual:native-render-graph`
- `bun run perf:check`
- `bun run bench:dashboard-1080p`
- `bun run validate:terminal-transport`

## Explicit remaining non-automatable / release-owner evidence

- Docs deployment evidence: build passes, but the actual deployment URL/status must be confirmed by the founder/release owner.
- Real terminal matrix: the local non-interactive probe is not a full manual matrix. Kitty, Ghostty, and WezTerm need real interactive validation before final release.
- Private beta evidence: 10 active users cannot be fabricated from repo state; founder/release owner must provide it or explicitly descope it in the PRD.
- Zero P0 bug evidence: requires issue tracker/release-owner signoff.
- First-paint, idle CPU, memory baseline, MSDF throughput, and compositor-animation latency require dedicated measurements beyond the local frame breakdown run.
- OpenSpec archive hygiene remains pending for older active changes that require release-owner decision or separate archive passes.

## Release-readiness conclusion

The repo now has the technical evidence needed to close the implementation/documentation/API/security/visual/performance gaps tracked in this audit. The PRD/v0.9 release can only be fully closed after the manual/external evidence above is recorded or explicitly descoped by founder-approved PRD decision.
