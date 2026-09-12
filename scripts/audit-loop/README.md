# Reusable audit loop

This directory contains a bounded, fail-closed audit runner. It is deliberately
internal and is not imported by the Vexart runtime.

The implementation pre-review is recorded in [`architecture-review.md`](./architecture-review.md)
with its Astra provenance and approved invariants.
Read [`verification.md`](./verification.md) for checked evidence, the
implementation-review star register, and the conservative correction-pass
limitation before running unattended.

## Architecture

`index.ts` detects the repository root and Git common directory, records the
current `HEAD` and dirty paths, acquires an atomic per-repository lock under
`<git-common-dir>/audit-loop/`, and creates `codex/audit-<id>` from that exact
`HEAD` in `<git-common-dir>/audit-loop/worktrees/<id>`. The main checkout is
never used as an agent write target. A run writes append-only
`events.jsonl`, versioned strategy profiles, historical scope+strategy identities, and per-attempt receipts
(prompt, argv, JSON response, JSONL events, stdout, stderr, and exit status).

Each cycle is:

1. Astra (`gpt-6-astra`, `high`) plans at most two scopes using bounded prior
   lessons (negative results, false positives, regressions, disadvantages, and
   coverage).
2. One or two independent Astra (`gpt-6-astra`, `high`) investigators inspect
   the clean baseline. A real finding must have baseline path/lines/excerpt,
   expected contract, and an exact executable regression command that fails on
   baseline with a nonzero exit plus a verbatim stable assertion excerpt.
   Receipt matching decodes literal shell quoting and one known sh/bash/zsh
   `-c`/`-lc` wrapper without execution, then compares exact argv; argument
   boundaries and embedded whitespace are preserved. Shell operators, expansion,
   malformed quoting, and nested/unknown wrappers do not qualify as proof.
   `finding.paths` contains only files intended for the fix; evidence may read
   other baseline files inside the requested audit scope without granting write
   access. Every investigation also returns a separate source-backed analysis:
   end-to-end caller/consumer flow, responsibilities, lifecycle invariants, actual
   scenarios, counterevidence, and optional improvement opportunities with their
   own evidence, expected benefit, tradeoffs, and validation plan. Tests validate
   source reasoning; a made-up assertion or environment failure is not a defect.
   Analysis evidence is checked against the recorded baseline and requested read
   scope, then saved as `analysis_recorded` before candidate rejection or any fix
   advances the baseline, including negative/blocked findings. Missing, malformed,
   or invalid evidence emits `analysis_rejected`; legacy missing analysis is null,
   never synthesized. The full event retains run/cycle/scope/SHA/agent/attempt
   attribution. Compact baseline-tagged summaries inform later planning as
   `DATA_ONLY`, not current proof. Opportunities are unverified proposals: they
   never award stars, authorize changes, or bypass human architectural decisions.
3. For a mechanically valid finding, up to three independent Astra/high solvers
   receive the same immutable source topic and may propose or abstain. A separate
   Luna/xhigh evaluator receives opaque candidate IDs, evidence and proposals,
   **not profile identities or scores**. It chooses an exact winner, a substantive
   synthesis of at least two contributions, or none. Each solver/evaluator call
   is limited to five minutes and the remaining run deadline. A selection alone
   cannot authorize implementation or earn stars.
4. A separate Luna pre-gate independently reads the source. It can approve only
   an internal root-cause fix tied to the recorded SHA and exact paths. API,
   contract, ownership, migration, hotfix, ad-hoc, magic-limit, controller,
   prompt, security-policy, and dependency changes fail closed for human review.
5. The Astra high apply worker receives only the approved paths and does not stage or
   commit. A Luna verifier inspects the actual diff, lifecycle/ownership
   invariants, regressions, and fixed safe checks. At most one bounded correction
   is attempted. After the verifier and checks pass, the controller stages only
   those named paths, verifies the index, creates exactly one commit on the
   audit branch, records its SHA, and advances the next cycle's baseline. The
   post-verifier must rerun the same command and provide a matching successful
   JSONL command witness; free-form check labels are not proof. Rust changes
   additionally require the fixed offline Cargo test command. A failed apply,
   verifier, check, or commit leaves the branch and diff blocked for review. A
   gate that explicitly requires a human architectural decision parks a clean
   baseline worktree with alternatives, disadvantages, and receipt recorded,
   then continues other bounded audit scopes; the parked branch is never edited
   or merged automatically. Security, dirty-worktree, stale, and unsupported
   contract decisions remain blocked.

The controller awards one star only after an independent gate confirms a real
finding. Stars are the count of unique canonical root-cause keys, not fixes,
tests, proposals, or repeated observations. Duplicate keys are retained as
events but are not awarded again. The program, prompts, model mapping,
safeguards, and security policy are never self-edited; “automejora” means only
that the next Astra plan consumes evidence-backed lessons and the controller
uses versioned profile results to select bounded consultations. It cannot loosen policy or rewrite itself.

## Stable profiles and solution rewards

The four code-defined profiles are `lifecycle`, `contract-flow`,
`state-transitions` and `minimal-invariant`, initially version 1. They identify
reusable investigation approaches, not persistent model instances. The controller
assigns each attempt its profile/version, role and scope. Historical identities
are not guessed into these profiles, and deleted receipts are not reconstructed.

Discovery and solution stars/eligible-attempt denominators are separate. Each
score is `(stars + 1) / (eligibleAttempts + 2)`. One consultation is reserved for
the least-invited exploration profile; remaining distinct profiles are ranked by
score, with fixed profile order breaking ties. A sole investigation assignment
uses the exploration slot. Selection events persist the formula, ranking rule,
selected profiles, scores, prior eligible attempts and invitation counts.
Abstentions, malformed output, timeouts and blocked technical outcomes do not
count as unsuccessful solution proposals. Metrics affect invitations only; no
stars are passed to the evaluator or allowed to bypass source/architecture gates.

After a real fix passes the independent architecture gate, implementation,
postverification, the unchanged regression witness and fixed checks, the controller
commits it. Only then can a solution award be recorded: one star to the winning
proposal or half a star to each substantive implemented synthesis contributor.
The post-verifier supplies current-file references; the controller extracts them
from a frozen post-apply snapshot. Ordered event replay and finding/commit/attempt
identity prevent duplicate rewards. This is outcome-driven routing, not model
fine-tuning or autonomous policy rewriting.

The first eligible improvement opportunity from each investigation may also enter
a tournament when its baseline remains current. Its selected plan is only parked
as an artifact in an isolated decision worktree; it cannot fabricate a failing
finding, apply code, accrue solution stars or enter the solution denominator.
Other source-backed opportunities remain available in the analysis records.

## Source evidence ownership

Agents return source references (`path`, `startLine`, `endLine`), not quoted code.
For each investigator or gate call, the controller captures the baseline commit
SHA at dispatch and extracts the exact inclusive line slices from that immutable
Git snapshot. It enriches only the known finding, analysis, opportunity, solver, evaluator and gate
evidence fields before downstream parsing. Comments, indentation, blank lines,
backticks and literal ellipses are preserved; no fuzzy search or range repair is
performed. Unsafe paths, invalid ranges and model-supplied legacy `excerpt`
fields fail closed instead of being silently corrected. A malformed finding does
not erase independently captured valid analysis; any capture error still prevents
the candidate from reaching the implementation gate.

Receipts preserve the original structured response text separately from the
enriched response and record controller-extracted provenance with the captured
SHA. Post-verifier contribution references instead carry a frozen post-apply
snapshot ID because their source includes the uncommitted fix. This proves what the snapshot contains, **not** that an agent read those
lines, that its interpretation is correct, or that a bug exists. Independent
source/contract review, exact failing-command witnesses, architectural approval
and post-implementation verification remain separate mandatory gates.

## Usage

```sh
bun run scripts/audit-loop/index.ts --help
bun run scripts/audit-loop/index.ts run --cycles 3 --minutes 60 --scope packages/engine
bun run scripts/audit-loop/index.ts status
bun run scripts/audit-loop/index.ts stop
```

`run` is the only command that starts work. Importing `index.ts`, invoking it
without arguments, or running `--help` does not start a loop. The default is
three cycles or sixty minutes, whichever ends first. `stop` writes a
run-specific request token; the runner consumes it and terminates only its own
tracked Codex process and observed descendants, so a reused PID can never kill
an unrelated process. Partial artifacts are preserved. Timeout handling
likewise terminates the owned Codex process tree and records a timeout receipt.
A leftover lock is fail-closed and requires manual recovery after confirming
the owner is stopped.

### Local dashboard observer

The optional read-only dashboard is a separate Bun server:

```sh
bun run scripts/audit-loop/dashboard.ts --port 4318
```

It binds only to `127.0.0.1` (default port `4318`). `GET /` serves the local
`dashboard.html`; `GET /api/snapshot` returns a bounded, sanitized view of the
persisted state, recent current-run events, finished receipts, agent registry,
and lifetime totals. Host and Origin headers must match the loopback server
origin, and there are no mutation routes or CORS headers. Missing, malformed,
truncated, or symlinked metadata becomes an explicit warning or unknown value;
the observer never fabricates active-agent execution. Missing, malformed or
truncated ledger history makes lifetime totals unavailable rather than zero;
profile metrics are hidden until complete history can be read.

The sidebar separates persistent profile metrics, current-run attempts and a
collapsed legacy-identity history. Attempt starts/finishes are controller events,
not a live stream of internal reasoning or shell activity. Invitation details and
solution rounds expose the recorded criteria, proposals, selection and awards.
Updating this observer does not upgrade a running controller: the next clean
batch must start the verified new controller to produce the new profile events.

Codex is invoked with `exec --ephemeral --json --output-schema
--output-last-message`, `--disable multi_agent --disable multi_agent_v2`, and
the role mapping above. Investigators, gates, planners, and verifiers use
`-s read-only`; only the isolated apply worker uses `-s workspace-write`.
No dependency installation or external write is performed. When available, the
runner makes one isolated copy of the existing `node_modules` tree. Absolute
links into the source checkout are rewritten to equivalent links inside the
isolated worktree, while external and transitive escapes are rejected. Missing
dependencies fail verification rather than silently skipping behavioral checks.

## Safety and limitations

- The controller never checks out, stashes, resets, cleans, pushes, publishes,
  or auto-cherry-picks. It commits only a verified fix in the isolated audit
  branch, never in the user's checkout, and leaves that branch available for
  human review.
- User dirty files are recorded as excluded evidence and are not copied into
  the worktree. The baseline SHA must remain unchanged before apply.
- Structured output is strict. Missing, malformed, stale, ambiguous, or
  unsupported output is recorded as negative/blocked and cannot apply.
- Agent-provided test claims are not arbitrary controller commands. The runner
  executes only fixed checks (`git diff --check`, Bun checks when isolated
  dependencies and scripts exist, and offline Cargo checks for native paths).
- The loop is intentionally bounded and conservative. It does not prove GPU,
  terminal, network, or production behavior; it does not infer public API or
  architecture decisions. Those remain human gates; deferred decisions are
  retained as data for later planning and never treated as permission.

## Process transport and check logs

Agent argv ends with the Codex stdin marker. The original prompt is delivered as
exact UTF-8 bytes over stdin and retained separately in its receipt; it is not
embedded in OS arguments. Input delivery, EOF, concurrent stdout/stderr draining,
deadline, cancellation and owned cleanup are one process lifetime. Spawn or I/O
failure is a failed attempt even when a child exits zero.

Fixed check output is stored under the current run's checks directory, with
separate full stdout/stderr files and a manifest containing command, exit status,
timeout/cancellation, byte counts, hashes and complete/partial/not-executed status.
Artifacts are finalized before their references are published. Ledger events and
correction prompts contain compact results and artifact paths, not full logs.
The correction agent must inspect those files. Failed checks still block commit;
a storage error also fails closed. Historical oversized events are not rewritten,
so an old ledger can still make the bounded observer report incomplete history.
