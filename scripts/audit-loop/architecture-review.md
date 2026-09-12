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
