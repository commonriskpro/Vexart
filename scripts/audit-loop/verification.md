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

## Prompt transport and check artifacts — 2026-09-12

Pre-gate: /root/architecture_gate (Astra/high), APPROVED. Independent final
review: /root/verify_loop (Luna/xhigh), PASSED — READY_TO_REPORT after one
bounded correction. Worktree: codex/audit-process-transport from 77a10c2.

- Reproduced OS argument failure: old correction prompt 24,025,195 bytes versus
  host ARG_MAX 1,048,576. Prompts now use stdin, not positional arguments.
- Exact 3.5 MB UTF-8/NUL input and EOF, concurrent 2 MB stdout/stderr, input
  backpressure timeout, readiness-handshaked cancellation, missing executable,
  early stdin closure and full large prompt receipts were checked.
- On this Bun runtime, a single giant Writable.end could report success after
  early stdin closure. Incremental callbacks using the writable high-water mark
  expose EPIPE; this is flow control, not a prompt-size cap.
- Full 4 MB-per-channel check artifacts are preserved with bytes/hashes and
  complete/partial/not-executed metadata. Compact event data stays below 2 KB in
  the fixture. Actual storage failure rejects publication; failed checks remain
  failed. Both channels are retained rather than choosing stderr over stdout.
- The first review reproduced loss of original child exit status at persistence.
  One bounded correction added originalExitCode separately from the effective
  fail-closed exitCode. A real early-close child with actual exit 0 persists
  effective -1, original 0, stdin error and parseOk false through production
  recordAgentResult into both receipt and event.
- Worker full focused suite: 43 passed, 346 assertions. Independent corrected
  transport suite: 10 passed, 53 assertions. Scoped TypeScript and diff passed.
- Outputs remain buffered until each check ends, then artifacts are finalized.
  No historical events/receipts were rewritten and no blocked product diff was
  discarded. No real-agent recovery or product commit is claimed by these tests.

Review rewards remain distinct from runtime product/profile rewards:
explore_astra earns 1 for the reproduced transport/oversized-log defect
(combined review total 3, including the public read/edit eligibility defect).
verify_loop earns 2 for the separately confirmed ranking and original-exit
persistence defects (combined review total 7). No runtime stars were invented.

Final integration with profile/tournament commit cd36647 was independently
reviewed in codex/audit-loop-integrated: PASSED — READY_TO_REPORT.
All 62 focused tests passed (462 assertions), scoped TypeScript and both staged
and working-tree diff checks passed. Resolved merge content preserves profile
attribution, immutable post-apply contribution proof and compact artifact events.
This validates the controller code, not recovery of the blocked product run.


## Incremental SQLite dashboard history — 2026-09-12

Pre-gate: /root/architecture_gate (Astra/high), APPROVED. Implementation:
/root/apply_astra (Astra/high), isolated codex/audit-history-sqlite from 4359de1.

- Root reproduced a valid historical verification event exceeding the former
  8 MiB observer tail. The original JSONL was valid; slicing its record created
  a false malformed-metadata warning and hid all lifetime metrics.
- SQLite preserves the authoritative JSONL and receipts. Initial streaming import
  projects complete records; subsequent refreshes process only appended bytes.
  Ready metrics, shared reducer checkpoint and byte cursor commit atomically.
- Root's pre-correction focused suite: **71 tests passed, 614 assertions**; scoped
  TypeScript and diff checks passed. Tests cover persisted-prefix credits,
  duplicate/invalid provenance, late eligible solution outcomes, oversized logs,
  concurrent requests, UTF-8 partial lines, transaction rollback/retry, stale
  source/version detection, unsafe paths and recent-event bounds.
- One-time comparison against the pre-refactor reducers on a copied live ledger:
  **98 records / 24,293,578 bytes**, complete; **1 discovery star, 0 solution
  stars, 0 commits, 0 decisions**. All four profile metrics matched exactly.
  The next unchanged query read **0 ledger bytes**; derived DB was **69,632 bytes**.
  The legacy discovery star has no proven modern-profile attribution and remains
  global rather than being invented for one of the four new profiles.
- No source ledger, receipts, audit branch, or active audit process was altered.
  The change is the dashboard's derived read model; controller event persistence
  and bounded planning behavior remain unchanged. Checkpoint provenance grows
  with essential audit identities, and one complete record is parsed transiently.

- Independent review reproduced a completeness defect: an append during import
  could publish an older prefix as complete despite observing a larger ledger.
  The single bounded correction rejects observed size/mtime drift and rolls back.
  A deterministic regression failed before the correction and passes after it,
  including preserved cursor/counts, retry and duplicate-credit protection.
  Worker DB plus dashboard checks: **22 tests passed, 238 assertions**; scoped
  TypeScript and diff checks passed.
- Review-only reward: verify_loop earns **1** for this reproduced completeness
  defect (combined review total **8**). This is not a runtime product/profile star
  and does not change the live ledger or invent a committed product fix.

Independent final verdict: /root/verify_loop (Luna/xhigh), **PASSED —
READY_TO_REPORT** after the single bounded correction. DB: **10 passed, 165
assertions**; dashboard: **12 passed, 73 assertions**; scoped TypeScript and diff
checks passed. Independent old/new reducer parity matched. The real growth-race
reproduction now reports incomplete with unchanged cursor, then imports the new
star correctly on retry. No remaining critical findings in the scoped review.
