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
