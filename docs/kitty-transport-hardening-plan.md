# Kitty Transport Hardening Plan

## Goal

Harden TGE's Kitty graphics transport so local rendering uses SHM correctly and robustly, with explicit fallback behavior, integrated probing, lifecycle management, and shared policy across full-frame transmit and patch paths.

## Current State

The codebase already includes:

- `packages/output/src/kitty.ts`
  - `transmitShm(...)`
  - `transmitFile(...)`
  - `transmitDirect(...)`
  - `patchRegion(...)` with `shm` / `file` / `direct`
  - `probeShm(...)`
  - `probeFile(...)`
- `packages/terminal/src/index.ts`
  - startup probing for `shm -> file -> direct`
  - env override via `TGE_FORCE_TRANSMISSION_MODE`
- `packages/output/src/layer-composer.ts`
  - layer rendering using a selected transmission mode
- `packages/output/src/composer.ts`
  - full-frame rendering using `caps.transmissionMode`

This means the work is **not** to invent SHM support from scratch. The work is to turn the current transport implementation into a robust backend.

## Main Problems

### 1. Policy is scattered

Mode selection is split across probing, kitty transmit functions, and composers. We need one place that owns transport choice and degradation.

### 2. Runtime fallback is weak

If SHM fails, code often silently falls back to direct mode without a central health model, retry strategy, or session-level degradation cache.

### 3. SHM lifecycle is too implicit

The current implementation assumes Kitty will read and unlink SHM correctly, but the app side does not model in-flight ownership, timeout handling, or robust cleanup.

### 4. Permissions and naming need hardening

SHM currently uses permissive modes in some places and ad-hoc naming. We want conservative permissions and a unified naming/cleanup strategy.

### 5. Probing is disconnected from runtime health

Startup probing exists, but runtime failures are not folded back into transport policy in a durable, explicit way.

### 6. Full transmit and patching duplicate decisions

`transmit(...)` and `patchRegion(...)` each carry transport branching. That logic should be unified behind one policy owner.

## Target Architecture

Introduce a transport manager layer inside `@tge/output` that owns:

- transport probing result
- active mode
- preferred mode
- degradation state
- runtime failure handling
- telemetry counters

Suggested conceptual shape:

- `KittyTransportManager`
  - `selectMode(kind)`
  - `reportSuccess(mode)`
  - `reportFailure(mode, reason)`
  - `degradeMode()`
  - `getTelemetry()`

The manager should be used by:

- full frame `transmit(...)`
- raw transmit path
- `patchRegion(...)`
- layer composer
- full composer

## Phases

### Phase 1 — Centralize transport policy

#### Goal

Create a single owner for transport mode decisions.

#### Deliverables

- new transport manager module in `packages/output/src/`
- explicit session state:
  - preferred mode
  - active mode
  - probe support
  - runtime health
- unified API for mode selection and degradation

#### Expected outcome

Transport decisions stop being spread across unrelated modules.

---

### Phase 2 — Harden SHM lifecycle

#### Goal

Make SHM handling explicit and defensive.

#### Deliverables

- unified SHM object naming helper
- conservative permissions (`0o600`)
- explicit helper for:
  - create
  - resize
  - map
  - write
  - sync
  - unmap
  - close
- tracking for in-flight SHM writes
- cleanup on:
  - success
  - error
  - timeout
  - process exit

#### Expected outcome

SHM becomes a reliable transport, not best-effort glue.

---

### Phase 3 — Runtime fallback strategy

#### Goal

Handle real transport failures gracefully and predictably.

#### Deliverables

- fallback order:
  - `shm -> file -> direct`
- session-level degradation cache
- no repeated SHM retries once runtime health is bad
- clear failure reasons

#### Expected outcome

The transport layer stops oscillating or failing silently.

---

### Phase 4 — Integrate probing with runtime health

#### Goal

Merge startup probes and runtime degradation into one model.

#### Deliverables

- probe results stored in manager state
- distinction between:
  - startup support
  - runtime unstable mode
- cache of probe success/failure per session

#### Expected outcome

We no longer treat startup probe success as a permanent guarantee.

---

### Phase 5 — Telemetry and debugging

#### Goal

Make transport behavior observable.

#### Deliverables

- per-mode counters:
  - success
  - fallback
  - failure
- reasons such as:
  - `probe_failed`
  - `shm_open_failed`
  - `mmap_failed`
  - `runtime_transport_error`
  - `ack_timeout`
- integration with renderer debug stats when relevant

#### Expected outcome

Debugging transport behavior becomes evidence-based.

---

### Phase 6 — Unify full transmit and patch behavior

#### Goal

Ensure patching and full-frame upload use the same transport policy.

#### Deliverables

- remove duplicated mode branching from patch/full paths where possible
- route both through shared manager decision flow

#### Expected outcome

No more transport inconsistencies between patch and full upload.

---

### Phase 7 — Validation matrix

#### Goal

Prove the backend is robust in practice.

#### Cases

1. Kitty local, SHM healthy
2. Kitty local, SHM forced failure -> file fallback
3. Kitty local, file failure -> direct fallback
4. Remote/tmux path -> direct
5. Drag stress path using actual graph harness

#### Expected outcome

Confidence in the backend beyond “it compiles.”

## Recommended Implementation Order

1. Phase 1 + Phase 2
2. Phase 3 + Phase 4
3. Phase 5 + Phase 6
4. Phase 7

## Important Notes

- Do not re-invent SHM support; harden the existing implementation.
- Do not mix visual motion tuning with transport-layer hardening.
- Keep the fallback chain explicit and observable.
- Keep local-only assumptions explicit; remote/tmux paths must degrade predictably.
