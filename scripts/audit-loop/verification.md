# Implementation verification — 2026-09-12

Independent reviewer: `/root/verify_loop` (Luna xhigh). Architectural pre-review:
`/root/architecture_gate` (Astra High). The reviewer approved the final bounded
correction for launch with the limitations below.

## Evidence

- `bun run test ./scripts/audit-loop`: 10 passed, 32 assertions.
- `bunx tsc -p scripts/audit-loop/tsconfig.json --noEmit`: passed.
- Real temporary Git repositories exercised named-file commits, baseline
  advancement, canonical-key deduplication and retained learning events.
- Independent descendant-cancellation reproduction completed in approximately
  1.07 seconds with the one-second termination grace; the old implementation
  waited approximately three seconds.
- Stopping a run no longer signals a PID from lock metadata: an unrelated live
  process survived the independent stop-marker regression check.
- Nested dependency links outside the isolated worktree are rejected.
- Authenticated Astra High and Luna xhigh CLI calls, structured responses,
  source reads, and failing Bun tests were exercised in a temporary repository.
  Earlier live attempts demonstrated rejection of malformed scopes and
  unsupported evidence. Final authenticated fixture run `mtyvbi9t-f173a24e`
  completed discovery, independent gate, apply, post-verification and commit
  `ba3c7fb6486e8647ca0d0ad2b7a6542cf82d9ae0`, awarding one deduplicated
  fixture star. This establishes the fixture cycle, not any Vexart product fix.

## Known limitations

- Correction verification now fingerprints each attempt before review and binds the successful snapshot to commit. Internal absolute dependency links relocate into the isolated worktree; external links remain rejected.
- Stop-marker paths assume internally generated, unmodified lock metadata.
  Manually corrupted lock identifiers are not supported. Do not edit a live
  lock. A stale lock requires manual inspection before recovery.
- Evidence must describe a real, failing executable regression and contain
  literal logged output. Unsupported or malformed model output is rejected,
  not credited as a discovery. Coverage and successful fixes are not guaranteed.
- Self-improvement means feeding observed outcomes into subsequent planning;
  it does not mean self-modifying code or relaxing acceptance rules.

## Implementation-review stars

`/root/verify_loop`: **2 stars**, one each for independently reproduced,
distinct defects: PID-based stop ownership and descendant cancellation after
parent exit. Other review leads were not awarded speculative stars. These
implementation-review stars are separate from the runtime product-finding
ledger in `<git-common-dir>/audit-loop/events.jsonl`.

Final independent re-review: **PASSED — READY_TO_REPORT**. Decision parking,
per-attempt snapshots, dependency relocation, and native checks were inspected.

## Local browser observer — 2026-09-12

Independent pre-gate approved a separate localhost read-only observer; no runner
or telemetry format change. Final independent post-review: **PASSED**.

- `bun run test ./scripts/audit-loop`: 15 passed, 68 assertions.
- Scoped TypeScript check and `git diff --check`: passed.
- Real HTTP tests cover snapshot refresh, missing/malformed data, Host/Origin,
  fixed routes, method rejection, and omission of raw private receipt fields.
- A real unrelated live `sleep` PID is not reported as an active audit runner.
- Live browser inspection confirmed the actual Vexart run, model/effort receipts,
  view-only pause/resume, decision filtering and automatic snapshot updates.
- Mobile viewport inspection: document client width equals scroll width (375px),
  no horizontal overflow. Normal viewport restored and panel left open.
- Oversized receipt/event reads are deliberately bounded and surfaced as
  warnings. An omitted receipt is not a missing or unfinished agent attempt;
  the complete original remains in the local ledger. No live per-command stream.

Dashboard-review stars: `/root/verify_loop` earns **1** for reproducing false
runner liveness from an unrelated PID. Combined controller/dashboard review
stars: **3**. These remain separate from product-finding runtime stars.

## Source analysis and exact witnesses — 2026-09-12

- Source-work role configuration: planner, investigator and apply use Astra high;
  independent gate and post-verifier remain Luna xhigh. Actual argv construction
  is covered by tests; previous run receipts remain historical and unchanged.
- Architectural analysis is recorded independently of candidate acceptance, with
  baseline-validated line references, full flow, responsibilities, invariants,
  scenarios, counterevidence and improvement opportunities. These references do
  not prove the interpretation. Opportunities are proposals, not star awards or
  permission to implement architectural decisions.
- Literal argv normalization was reproduced against real completed receipts,
  without executing their commands. Exact argv + exit + output matches after the
  fix: animation 4, scheduler 2, input 1, focus 1, router 1.
- The first normalization implementation missed the actual Homebrew zsh path.
  Root replay caught this after synthetic tests passed. The bounded correction
  includes the exact observed wrapper and a regression copied from the actual
  scheduler command/argv (not prompts or raw output).
- Scope and source-range failures in those old candidates remain rejected;
  matching a command does not establish a Vexart product bug or approve a fix.
- `bun run test ./scripts/audit-loop`: 22 passed, 147 assertions. Scoped
  TypeScript check and diff check passed. No unrelated type errors were changed.

`/root/explore_astra`: **1 implementation-review star** for the independently
confirmed argv representation defect. `/root/verify_loop` retains its prior
**3** review stars. No product-finding stars were awarded for these tool changes.

## Controller-owned evidence capture — 2026-09-12

Independent pre-gate: `/root/architecture_gate` (Astra/high), approved before
implementation in `codex/evidence-capture-fix`. Independent final post-review:
`/root/verify_loop` (Luna/xhigh), **PASSED — READY_TO_REPORT**.

- Agent schemas request path/inclusive-line references only; controller snapshot
  extraction owns literal quotations. Original response text and enriched evidence
  with SHA provenance are separate. This is not proof of agent reading or meaning.
- Real-Git fixture tests cover comments, blank lines inside nonblank excerpts,
  indentation, tabs, backticks, captured SHA after HEAD advances, related read-only
  references, malformed/legacy fields, forbidden paths, symlink/tree blobs, and
  invalid inclusive ranges. Existing command-witness and architecture gates remain.
- Root directly exercised extraction on the actual forms and virtual-list baseline
  ranges: public comments, blank lines and Markdown backticks were preserved. No
  deleted receipts were reconstructed and no product fix is claimed by this check.
- First independent review reproduced two capture regressions: malformed finding
  evidence discarded independent valid analysis; blank-only ranges obtained
  provenance. One bounded correction isolated the two evidence domains and rejected
  blank ranges before provenance. The actual receipt-to-analysis recording path is
  covered; a capture error still blocks candidate dispatch.
- Final focused suite: **32 passed, 289 assertions**. Scoped TypeScript check and
  `git diff --check` passed. Test success establishes the controller boundary, not
  a completed live discovery/apply/commit cycle under the new schema.

`/root/verify_loop` earns **2 additional implementation-review stars** for the two
independently reproduced capture regressions (combined review total **5**).
`/root/explore_astra` retains **1** for the earlier argv defect. These remain
separate from the runtime product-finding ledger; no runtime stars were created.


## Public contract evidence eligibility — 2026-09-12

- Separate pre-approved fix `77a10c2` allows `public.ts` as read-only contract
  evidence while retaining the ban on edits/planner assignments to that surface.
- Exact capture errors survive into rejection events instead of being replaced by
  a generic malformed-output message. Other scope/security restrictions remain.
- Independent frozen review: **33 tests, 293 assertions**, scoped TypeScript and
  diff checks passed. Six actual retained investigator receipts passed mechanical
  reference/witness replay after the fix; no commands were rerun and this is not
  semantic approval of six product bugs. Deleted receipts were not reconstructed.

`/root/explore_astra` earns **1 additional implementation-review star** for the
confirmed read-versus-edit eligibility defect (combined total **2**).

## Stable profiles and solution tournament — 2026-09-12

- Four fixed versioned strategies retain separate discovery/solution outcomes
  across assignments and runs. Unique attributed attempts define denominators;
  malformed/timeout/abstain/opportunity results are not losing solutions.
- Score affects actual invitations, with a reserved exploration slot. The blind
  evaluator receives opaque candidates, not profile identities or star history.
- Exact selected proposals still pass independent architectural review, one apply,
  postverification and fixed checks. Contribution quotes use a frozen post-apply
  source snapshot, and solution rewards require an ordered commit-backed ledger.
- Parked opportunities do not become defects or earn solution credit.
- Root and independent reviewer reproduced an unintended eligibility-first
  comparator. The single bounded correction restores score-first ranking, with
  an explicit regression for zero stars in 100 attempts versus an unseen profile.
- Dashboard checks: **12 passed, 72 assertions**. Stable profiles, current attempts
  and historical identities are distinct. Partial/malformed ledger reads cannot
  display exact lifetime totals or apparent zero profile scores. Invitation
  criteria and post-apply provenance are sanitized and inspectable.
- The new observer was served on port 4318 from the isolated feature worktree and
  its actual browser view verified. This does not prove the feature controller
  has executed a live solution tournament.

### Observed runtime blocker (old controller; preserved separately)

Run `mtyyyka5-46c46216`, using `77a10c2`, stopped at 18:54:53 EDT with
`E2BIG`. Its correction prompt embedded 24,025,195 bytes of check output as a
process argument, exceeding the host argument limit. A 24,008,117-byte check
event also exceeds the observer's bounded tail reader. The original ledger and
uncommitted parser change remain intact; a focused verifier approval did not
satisfy all fixed checks, so no product commit or safe restart is claimed. The
separately pre-gated transport correction is not part of the profile feature.

Independent final feature review: `/root/verify_loop` (Luna/xhigh),
**PASSED — READY_TO_REPORT** after the single correction. Focused full suite:
**52 tests passed, 409 assertions**; scoped TypeScript and diff checks passed.
No additional critical defects were found. Runtime transport recovery remains
separate; these checks do not certify an unattended live product fix.
