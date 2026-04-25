# Proposal: Phase 12 OpenCode Cosmic Shell Showcase

## Intent

Port the downloaded React/Tailwind OpenCode OS Cosmic Shell mockup into a terminal-native Vexart example that exercises the newly implemented `@vexart/app` framework.

## Source documents satisfied

- `docs/PRD.md` — supports showcase-quality terminal UI and developer-facing examples.
- `docs/ARCHITECTURE.md` — keeps rendering through Vexart packages instead of DOM/CSS.
- `docs/API-POLICY.md` — consumes public framework APIs only.
- `docs/PRD-VEXART-APP-FRAMEWORK.md` — validates the React/Next/Tailwind-inspired authoring direction without claiming React DOM compatibility.

## Scope

- Add a new `examples/opencode-cosmic-shell/` app implemented with `@vexart/app` primitives.
- Add an executable example entrypoint under `examples/`.
- Preserve core interactions from the source mockup: active app switching, active file switching, drawer toggling, assistant quick actions, overlay close.
- Add lightweight self-tests for data integrity.

## Out of scope

- Full React compatibility.
- CSS/Tailwind parser expansion.
- SVG path rendering.
- Pixel-perfect parity with the downloaded DOM mockup.
- Package script changes while the worktree already has unrelated dirty `package.json` edits.

## Rollback

Remove the new example directory, entrypoint, and test file. No public API changes are required.
