# TGE GPU-Only Refactor Roadmap

## Goal

Actualizar el roadmap del refactor para reflejar una realidad importante:

- ya hubo una primera pasada fuerte de migración,
- ya existen facades y boundaries públicos mejores,
- pero el repo todavía no quedó estructuralmente limpio.

Por eso, el trabajo que sigue ya no es solo “seguir la migración original”.
Ahora hace falta una etapa explícita de:

> auditoría,
> reducción,
> retiro de bridges,
> y simplificación del core oficial.

---

## Strategic reset

## We are optimizing for now

- understanding the engine as it exists today
- reducing fake architectural layers
- isolating compat from the official path
- converging duplicate abstractions
- making ownership physically real
- only then recovering performance

## We are NOT optimizing for now

- adding more package names just to look modular
- preserving every bridge forever
- treating facade packages as if they were real owners
- reintroducing optimizations before the system is simpler
- shipping more UI features while ownership is still muddy

---

## Migration rules

### Rule 1
No new engine-adjacent product features while the current-state audit and bridge reduction are incomplete.

### Rule 2
Every change must reduce ambiguity in ownership, not just move code around.

### Rule 3
If a package is only a reexport bridge, it must be documented as such or retired.

### Rule 4
A compatibility path may survive publicly, but must not keep dominating the core mental model.

### Rule 5
Minimal repros like `examples/window-drag-repro.tsx` and targeted profiling harnesses stay as official diagnostics.

### Rule 6
Optimization work is allowed only after a simpler correct path is proven and easier to reason about.

---

## Status of the original phases after the first bridge pass

The original P0-P7 plan is still useful, but its state must be described honestly.

| Phase | Current status | Reality |
| --- | --- | --- |
| P0 — freeze / prepare | completed | Direction accepted: GPU-only + cleaner split |
| P1 — package boundaries | mostly complete | weak facades were retired; remaining public bridges still exist by choice |
| P2 — split `loop.ts` | partial but materially improved | helpers extracted and fallback paths removed, but `loop.ts` still coordinates too much |
| P3 — explicit render identity | partial | `renderObjectId` exists, heuristic fallback still remains |
| P4 — formalize GPU-only core | strong partial | CPU backend, output compat, selectable ANSI and loop fallback were removed from the official path |
| P5 — move UI policy to runtime | partial | some coupling reduced, but runtime semantics still sit too low |
| P6 — real overlays/portal roots | partial | overlay root exists, but the broader runtime/overlay model is not fully clean |
| P7 — optimization recovery | not started | helper grouping happened, but optimization reintroduction is still pending by the roadmap's own rules |

### Important interpretation

The first pass solved **migration pressure**.
It did **not** finish architectural cleanup.

---

## New roadmap track: reduction and clarification

This is the roadmap that should guide work **today**.

## R0 — Current-state architecture audit

### Objective
Map the real architecture instead of the intended one.

### Actions
- document real owners of hot-path files
- mark every facade package as **real owner** or **temporary bridge**
- identify duplicate abstractions (`SceneCanvas` vs `RetainedGraph`, etc.)
- identify compat paths still present in the official runtime path

### Exit criteria
- the repo has a written map of what is real, what is bridge, what is legacy

---

## R1 — Bridge retirement plan

### Objective
Stop relying on facade packages as internal architecture.

### Actions
- decide which bridges remain public compat only
- reduce internal imports through facade layers where they hide real ownership
- retire low-value facades that are not part of the published story

### Likely targets
- `@tge/compositor`
- `@tge/render-graph`
- `@tge/scene`
- `@tge/text`
- `@tge/compat-text-ansi`

### Exit criteria
- every surviving bridge has a reason
- fake package layering no longer dominates internal reasoning

---

## R2 — Core path reduction

### Objective
Make the official engine path materially simpler.

### Actions
- reduce remaining raster staging in the hot path (`gpu-raster-staging`, `surface-transform-staging`, `canvas.ts`)
- keep copy-to-image/readback/upload staging folded into explicit helper boundaries instead of leaking raw bridge calls through the backend
- remove dead transform staging branches when they are proven unused
- keep the official path clearly GPU-first + Kitty-first
- separate implementation staging from the conceptual renderer model
- decide whether compositor is a real package or just internal modules

### Exit criteria
- the core official path can be explained without centering `PixelBuffer`, CPU fallback, or output compat logic

---

## R3 — Converge duplicated abstractions

### Objective
Reduce conceptual duplication.

### Actions
- keep `SceneCanvas` as the primary retained drawing abstraction
- retire `RetainedGraph` after migrating the remaining consumers
- finish cleanup after moving `windowing` source ownership into its actual package

### Exit criteria
- one primary visual scene abstraction survives
- package ownership and source ownership match for windowing

---

## R4 — Runtime clarification

### Objective
Draw a hard line between engine primitives and runtime semantics.

### Actions
- move focus policy, bubbling and widget semantics higher
- keep only hit-test/pointer/layout primitives in core
- clarify scroll ownership and overlay behavior

### Exit criteria
- the engine core can be described without widget language

---

## R5 — Heuristic retirement

### Objective
Finish replacing compatibility heuristics with explicit ownership.

### Actions
- make `renderObjectId` mandatory where possible
- remove fallback matching by color/radius/path from the base model
- simplify layout ownership/writeback rules

### Current status
- `image` / `canvas` / `effect` attachment in `render-graph.ts` already moved to `renderObjectId`-only matching
- remaining heuristic retirement work is now outside that base path (border/text/writeback/layer ownership)

### Exit criteria
- ownership bugs are traceable by explicit IDs, not guesswork

---

## R6 — Controlled optimization recovery

### Objective
Recover performance on top of a simpler architecture.

### Candidate optimizations
- partial updates
- move-only placement refresh
- stable layer reuse
- regional repaint
- retained interaction layers
- GPU readback minimization

### Condition
Each optimization returns only if it has:

- minimal repro,
- success criteria,
- rollback strategy,
- instrumentation/logging.

### Exit criteria
- measurable gains without correctness regressions in repros and product demos

---

## Public API strategy during reduction

## APIs that should remain stable as long as possible

- terminal creation
- input parser
- `mount()`
- core runtime hooks that truly belong to the runtime layer
- headless components already adopted by examples/apps

## APIs that should be deprecated aggressively

- direct public CPU backend usage
- `PixelBuffer` as central user-facing abstraction
- imperative canvas as strategic drawing API
- strategy tuning APIs exposed from renderer internals
- facade-only domains pretending to be first-class architecture

## APIs that may survive only as public compat

- software raster helpers
- fallback output helpers
- temporary reexport packages needed during external transition

---

## Risks

### 1. False halfway states
The worst outcome is staying too long in “half clean, half facade, half legacy”.

### 2. Package churn without clarity
Moving names without moving ownership creates more confusion, not less.

### 3. Scene/runtime duplication
Keeping multiple first-class visual abstractions raises every future cost.

### 4. Optimization pressure too early
Performance work done before structural simplification will reintroduce hidden coupling.

---

## Success metrics

## Structural
- facade packages are either retired or explicitly documented as compat bridges
- package ownership is physically real where it matters
- `windowing` ownership matches its package
- `loop.ts` stops being the explanation for everything

## Technical
- the official engine path is explainable without centering compat-software
- ownership is traceable through explicit IDs and stage boundaries
- compositor strategy becomes understandable and testable

## Product-level
- windowing, overlays and complex UI stop forcing engine hacks
- new features stop requiring special cases in the renderer core

---

## Recommended order of work today

1. Audit the current architecture as it really exists.
2. Mark bridges vs real owners.
3. Retire or collapse fake boundaries.
4. Remove CPU/output compat/selectable fallback paths from the official renderer.
5. Reduce raster staging from the official hot path.
6. Converge duplicate abstractions.
7. Clarify runtime vs engine responsibilities.
8. Remove heuristic fallback where explicit identity already exists.
9. Only then reintroduce optimizations.

---

## Final recommendation

Do not treat the next stage as “more refactor of the same kind”.

Treat it as a **reduction program**.

The correct success condition now is not:

> “we created more packages”

The correct success condition is:

> “the engine became simpler, more honest and easier to reason about than the bridge-heavy intermediate state”.
