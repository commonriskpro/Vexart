# Design: Phase 17 — Visual correctness and Kitty evidence

## Design goal

Use one finite source-derived inventory as the contract between engine fixes and
visual proof. This is an evidence seam, not a second renderer.

## Ownership-preserving flow

JSX examples -> SolidJS TS scene/reactivity -> walk-tree + Flexily layout ->
TS render graph + input/focus/hit-testing -> packed FFI -> Rust WGPU paint,
composite, and Kitty transport -> dedicated Kitty OS window -> targeted capture.

A focused props/reactivity/layout/focus defect belongs to TypeScript. A
paint/composite/shader/encoding defect belongs to libvexart. A capture attribution
failure belongs to QA/devtools protocol, not a product behavior fix.

## Evidence model

Each gate row stores case ID, source prop/handler or global runtime flow, evidence class,
command/log/capture path, observed result, and next action. Reviewer-confirmed
diagnostic defect rows may be unnumbered and do not expand the finite gate.
SMOKE is a parent view only. BLOCKED
covers captures that are black/foreign/focus-lost because attribution failed;
an attributable settled black frame is a product FAIL candidate. HISTORICAL
cannot satisfy a current release gate.

## Kitty protocol

1. Start one dedicated Kitty OS-window target through the existing socket/devtools
   path and record platform and child window IDs.
2. Wait for a settled frame; confirm PID and stderr.
3. Send only the case key/mouse sequence to the child window.
4. Wait for frame replacement; capture with platform-window-targeted screencapture.
5. Inspect identity, expected state delta, no empty frame, and no artifact.
6. Record case ID, exact command, result, and evidence path.
7. Require a known-good positive control on the same physical Kitty surface
   before classifying settled black content as a Vexart FAIL. If attribution,
   settlement, or the positive control fails, mark BLOCKED; do not turn it into
   PASS or a product regression.

Golden tests and Kitty proof remain separate: a golden checks a render buffer;
Kitty checks presentation and input routing.

## Dependencies and boundaries

examples -> app -> styled -> headless -> engine -> libvexart -> Kitty.
No public exports or package dependencies change. Implementation agents may touch
only the responsible package/native files for a confirmed case.

Native compatibility remains fixed at the existing wgpu 29.0.1 dependency. The
alpha correction may update a native shader/pipeline, but this change adds no
dependency and no FFI/ABI change; corrections stay inside libvexart
paint/composite/test paths.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| D1 | Case statuses over tab all-pass | A four-view smoke does not isolate every effect. |
| D2 | Background-safe target capture | Targeted capture avoids interference between parallel agents/windows; a settled, attributable black frame remains a product failure candidate. |
| D3 | Preserve mismatch history | Keep the old 0.58% / 2,796-perimeter evidence alongside the new 480000/480000 pixel-perfect check; do not hide the transition with a mass refresh. |
| D4 | Keep unresolved causes OPEN | Self-filter now has an 11-test/88-assertion TS regression and N1 stack-overflow coverage is fixed; verified effects/native contracts and the three grouped fixes are automated-only. Scoped retry closes E1/E2/E3/G7-G9 with focus false and stderr empty, but dialog-open/transient-black Kitty proof, current golden mismatch, unreconciled full visual cases, and performance targets remain open; Box/Text/Card reactivity has a compiler-real 5/5 regression. |
| D5 | Legacy historical | Preserve source coverage without making outdated patterns current proof. |
| D6 | Facebook excluded | User cancelled that review. |
