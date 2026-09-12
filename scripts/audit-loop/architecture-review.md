# Architecture pre-review

**Verdict:** APROBADO for the bounded implementation in this directory.

**Provenance:** `/root/architecture_gate`, Astra (`gpt-6-astra`, `high`).

The approved invariants are implemented as code-governed transitions: no star
or apply without independently confirmed real evidence; strict structured
output fails closed; proposals are tied to the recorded baseline SHA; ambiguous
contract/API/ownership work is blocked for a human; writes occur only in the
dedicated audit worktree; dirty main-checkout paths are excluded; exact paths,
clean index, unchanged `HEAD`, post-verifier checks, one correction maximum,
and preserved branch/diff receipts are required. Negative results and
disadvantages are retained and bounded evidence-backed lessons affect the next
planner cycle without changing the permanent controller, prompts, models, or
security policy.

This pre-review is provenance, not a substitute for the runtime gates or the
focused tests. `README.md` documents the concrete state machine, CLI, models,
and limitations.

## Controller-owned source extraction — 2026-09-12

Pre-implementation review by `/root/architecture_gate` (Astra/high): **APPROVED**.
This changes ownership of quotation, not standards for bug acceptance: agents
select references and reason; the controller owns literal extraction from an
immutable dispatch-time SHA. Only known evidence positions are enriched; model
`excerpt` fields are rejected, not rewritten. Raw response text remains separate
from enriched source/provenance, and extraction is never labeled proof of reading
or semantic correctness. Existing reproduction, scope and architecture gates stay
mandatory. No deleted historical receipts are reconstructed.

The fix is implemented separately in `codex/evidence-capture-fix` from baseline
`245ea42c2c5fd05ca04d5ea52289cc08d1436162`. Interrupted tournament work is preserved
in the separate `codex/solution-tournament-checkpoint` worktree and is not part of
this fix or the resumed runner.

## Stable strategy profiles and solution tournament — 2026-09-12

**Pre-gate approved** by `/root/architecture_gate` (Astra/high), before changes in
`codex/audit-profiles-tournament` (baseline `c450f92`). A profile identifies a
versioned reusable strategy, not a persistent model instance. The controller owns
profile attribution, assignments and attempt IDs. Legacy scope+strategy identities
are historical only and are never guessed into the new profile ledger.

Historical rewards influence invitations only. Discovery and solution denominators
are separate, deduplicated by eligible attempt; abstention, malformed output and
infrastructure failure are operational outcomes, not evidence of a bad solution.
Parked opportunities do not contribute to solution success metrics. One invitation
is reserved for exploration; remaining invitations use recorded history with a
deterministic tie-break and no replacement. Formula/version/selection must be
inspectable. The evaluator receives opaque candidates without profile identity or
scoreboard; stars cannot override a gate or substitute for source evidence.

Up to three independent Astra/high proposers may participate or abstain. A separate
Luna/xhigh evaluator chooses one exact proposal, a substantive synthesis with at
least two contributors, or none. The existing architectural gate, Astra apply,
Luna postverification and controller commit remain mandatory. Solution rewards
are an atomic post-commit event with explicit implemented contribution proof:
winner 1; synthesis 0.5 per actual contributor. Finding+commit deduplication prevents
replayed rounds from creating new points. Opportunities remain read-only selected
plans parked in isolated worktrees, never fabricated failing Findings.

The observed `public.ts` issue is a separate root-cause fix: public-export source
is admissible for read-only contract evidence, while public-export edits remain
prohibited. All other source safety, scope and snapshot restrictions remain.

## Prompt transport and check-output ownership — 2026-09-12

Independent pre-implementation gate: /root/architecture_gate (Astra/high),
APPROVED. Implemented in the separate codex/audit-process-transport
worktree from 77a10c2; this is not a change to product-fix acceptance policy.

The process invocation owns a bounded argv and a separate stdin prompt channel.
Exact bytes and EOF, concurrent stdout/stderr draining, and cancellation/deadline
coverage of backpressure are mandatory. Spawn, input and storage failures remain
explicit failures with owned cleanup; no failure can count as approval.

Full check logs belong to finalized per-check artifacts under the owned run
store. Ledger events and correction prompts carry status, command, exit/timeout,
byte counts and artifact references, rather than embedding entire logs. Both
stdout and stderr must remain available. Existing fixed checks are not weakened,
failures are not truncated away, and historical events are not rewritten. The
blocked run and its uncommitted product diff remain preserved without automatic
restart or an unverified commit.
