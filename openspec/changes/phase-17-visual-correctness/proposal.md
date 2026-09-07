# Proposal: Phase 17 — Visual correctness and genuine Kitty validation

## Intent

Create a finite, reproducible correctness gate for the maintained Vexart
examples. Fix only confirmed engine defects, then validate the same cases in an
attributable Kitty OS window. A tab screenshot, headless green test, process
liveness, or stale golden is not an all-pass claim.

## Problem

The current evidence is narrower than the old tracker labels: the effects
gallery has only a four-view smoke; self grayscale remains orange in one report;
Box reactivity was confirmed broken in States and is now covered by a 5/5 focused
compiler-real regression while Card prop reactivity is also covered; self-filter
now has an 11-test/88-assertion focused TS regression; the native old golden
differed on exactly 2,796 perimeter pixels, now closed by a pixel-perfect
480000/480000 check; the retry native/shadow suite now passes 163/0, but the
current retry golden differs in 3,858/480,000 pixels (0.80%, max delta 78), so
the old exact golden remains historical; the current retry full visual baseline
is 2 pass / 39 fail (the intermediate after-AA run was 3/38); and rapid navigation's historical
RangeError/stack-overflow is fixed in automated 100-cycle coverage while its
current Kitty black frame remains surface-blocked. The canonical browser-unit
retry run is now 389 pass / 0 fail with 924 assertions across 57 files; the prior 387/0, 384/0, and 379/5
runs remain historical while
exact visual interaction proof is pending.
Textarea, modal, tooltip, and resize captures are blocked by attribution/focus.
Fresh black effects captures are blocked by a Kitty positive-control failure:
both a known-good red packet and kitten icat are black in new windows.
The later retry recovered a red positive control and partial effects/state
captures, but focus attribution changed during the sequence; colored shadow
bands (E1/E2) are now closed in a scoped Kitty retry after native shadow tests
and the TS per-node paint-order fix; clipped Glass third-row cards (G7-G9) are
also closed in the same scoped retry after live gallery scroll. Dialog-open
Kitty proof and transient black recovery remain OPEN.

## Scope

In scope: engine-level fixes confirmed by the case inventory; focused
TypeScript/Rust regressions; genuine Kitty proof for the exact affected case;
and an honest case-level tracker.

Out of scope: facebook-app.tsx (cancelled), mass reference refresh, legacy
showcase as current API proof, new public props/backends, speculative refactors,
and Kitty launches during specification.

### Affected packages and native boundary

The implementation scope is explicit: @vexart/app, @vexart/styled,
@vexart/headless, @vexart/engine, and libvexart. Documentation-only changes in
this proposal do not edit those packages; an implementation agent may touch only
the package/native layer responsible for a confirmed case.

## Requirements

1. Every maintained effect/state and interaction case plus global resize (R1) and
   rapid-navigation (N1) cases has an explicit status; the gate is 48
   source-derived cases plus 2 global cases, 50 IDs total. These are evidence
   cases, not 50 distinct API functions.
2. A fix needs a focused regression and attributable Kitty result, or an explicit
   OPEN/BLOCKED reason.
3. Current baselines stay visible: phase-start full visual 2 pass / 39 fail,
   latest-after-AA 3 pass / 38 fail, and retry final visual 2 pass / 39 fail;
   retry browser-unit 389 pass / 0 fail with 924 assertions across 57 files
   (prior 387/0, 384/0, intermediate 379/5, and prior 364/5 remain traceable);
   historical no-plugin run 360 pass / 4 fail; historical 2,796-pixel perimeter
   delta plus current retry golden 3,858/480,000 mismatch without refresh.
4. Rollback is the introducing commit or smallest change; captures and references
   are preserved.
5. Reviewer-confirmed grouped defects (nested-filter transform loss,
   overflow-visible clipping, and transformed/filtered scroll leakage) have
   explicit automated closure evidence and still require Kitty proof; their automated fixes do not
   inflate the 50-case evidence gate or become visual PASS automatically.
6. Final visual suite and performance remain explicit non-complete states:
   visual is 2/39, and the final 800×600 smoke regresses 13% while PRD targets
   remain unmet. No overall optimization or release claim follows from the
   automated passes.
7. A recovered Kitty positive control does not close the gate when target-window
   focus attribution changes mid-sequence; retry captures MUST remain PARTIAL
   until each case is background-safe and exact.
8. Shadow E1/E2 closure MUST preserve the signed-offset finding: native ±y tests
   are correct, and the retry closes the shifted-rect/paint-order seam only for
   the exact scoped Kitty cases; the current golden mismatch remains separate.

## Alignment

PRD: Section 5.1 visual effects, interaction, quality; Sections 7.1, 7.2, 7.4,
9.1, 10.2; Phase 4 visual-testing roadmap.

Architecture: Sections 2.1, 2.4, 2.5, 4.2, and 5.1. TypeScript remains owner of
scene/layout/render graph/focus/hit-testing/event dispatch; Rust remains owner of
WGPU paint/composite/Kitty transport.

API policy: Section 11 FFI contract; no public API change.
