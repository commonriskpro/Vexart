# Tasks: Phase 17 — Visual correctness and Kitty evidence

## 1. Inventory and baseline

- [x] 1.1 Replace tab-level all-pass labels with case-level states in
  docs/visual-qa-vexart.md.
- [x] 1.2 Enumerate 48 maintained effects/states/interactions plus global R1/N1
  (50 evidence IDs total); include the Glass Filter contract card, mark independent filter swatches, legacy
  historical/source-only, and Facebook out of scope. The count is not a count
  of distinct API functions.
- [x] 1.3 Record current baselines: phase-start full visual 2/39, after-AA
  intermediate 3/38, and retry final visual 2/39; retry production browser-unit 389/0 (prior 387/0, canonical 384/0; intermediate 379/5;
  historical no-plugin 360/4),
  and pixel-perfect 480000/480000 golden check after the historical 2,796-pixel
  perimeter delta was corrected.
- [x] 1.4 Add proposal, Given/When/Then spec, design, and task list.

## 2. Isolate confirmed defects

- [x] 2.1 Reproduce self-filter grayscale (C3); focused TS regression is 11 tests
  / 88 assertions. Kitty visual proof remains pending.
- [x] 2.2 Fix the confirmed Box stale-state reproduction with the smallest
  TypeScript seam and focused regression; compiler-real result is 5/5 with 36
  assertions (Card covered in the same reactivity pass).
- [x] 2.3 Reproduce N1 black rapid-navigation frames and historical RangeError;
  automated 100 right/tab cycles no longer stack-overflow. Current Kitty black
  remains BLOCKED by the positive-control surface failure.
- [x] 2.4 Reconcile Tabs/List/Table browser failures and conflicting Table keyboard
  reports; retry final browser gate is 389/0, with Kitty cases still pending.
- [ ] 2.5 Reconcile the retry native/shadow golden without mass regeneration;
  focused native evidence is 163/0, but `/tmp/vexart-retry-final-golden.log`
  remains 3858/480000 (0.80%, max delta 78). Preserve the historical exact
  480000/480000 result.
- [x] 2.6 Fix and regress the three reviewer-confirmed grouped defects:
  transformed container + nested filter loses transform, overflow-visible
  children clip to parent dimensions, and transformed/filtered output leaks
  outside scroll. Final automated effects contracts pass; Kitty proof remains
  pending.
- [x] 2.7 Close E1/E2's confirmed shifted-rect/source paint-order defect in the
  scoped retry; native signed ±y/shadow tests and TS per-node paint order pass.
  G7-G9 also pass after live gallery `scrollY` and targeted wheel×3. Broader
  golden reconciliation remains task 2.5.

## 3. Automated checks

- [x] 3.1 Run the smallest relevant TypeScript test for each confirmed TS fix;
  final evidence covers typecheck, self-filter 11/88, layout 12/29,
  reactivity 5/36, and retry canonical browser 389/0.
- [x] 3.2 Run the smallest relevant native test for the confirmed alpha/shadow
  fix; retry native evidence is 163/0. The current golden remains OPEN separately.
- [ ] 3.3 Re-run typecheck, production browser-unit tests, cargo tests, and full
  visual suite; final automated checks are recorded, but the frozen visual suite
  remains 2/39 and requires reconciliation without blanket stale-reference claims.

## 4. Genuine Kitty validation

- [ ] 4.1 Validate exact case IDs with background-safe Kitty OS-window input and
  platform-window capture. A retry red positive control passes, but effects/state
  focus attribution changed mid-sequence, so the gate remains open.
- [ ] 4.2 Re-run blocked Textarea, Table keyboard, Dialog, Toast, Tooltip, and
  R1 resize cases; retain BLOCKED when attribution fails.
- [ ] 4.3 Re-run effects C1-C4 and known C3 after its focused fix.
  E1/E2/E3/G7-G9 are now scoped PASS in the retry; Composition/States/C3 and
  remaining exact cases still need background-safe Kitty proof.
- [ ] 4.4 Keep screenshots, commands, case IDs, and stderr observations together.

## 5. Closeout and rollback

- [ ] 5.1 Mark PASS only after the exact Kitty gate; leave OPEN/BLOCKED reasons.
- [ ] 5.2 Revert the introducing commit/smallest change on regression and rerun
  focused checks without deleting evidence.
- [ ] 5.3 Archive only after baselines and inventory remain honest.

## Exit gate

No completion from a green unit test or one tab capture. Completion requires
explicit state for every listed case, focused regressions for confirmed defects,
attributable Kitty proof or an OPEN/BLOCKED reason, traceable current baselines,
and Facebook still excluded.
