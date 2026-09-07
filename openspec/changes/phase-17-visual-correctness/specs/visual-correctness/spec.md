# Visual correctness capability delta

## Requirement: finite case accounting

The tracker MUST enumerate each source-derived effect/state and interaction case
for effects-showcase.tsx and void-showcase.tsx with stable IDs and an evidence
state, plus global runtime cases for resize and rapid navigation. The current
gate is 48 source-derived rows plus 2 global cases (50 IDs). These are evidence
cases, not 50 distinct API functions. Gallery rows MAY group props that are
intentionally exercised together and MUST say so; independent filter swatches
SHOULD remain independently enumerable.
showcase-legacy.tsx MUST be historical/source-only. facebook-app.tsx MUST remain
excluded.

### Scenario: a complete tab capture is reviewed

- Given a Kitty capture showing one complete showcase tab
- When the tracker records the result
- Then it MUST use SMOKE unless each case has isolated evidence
- And it MUST NOT infer that all effects/components passed.

### Scenario: attribution is unreliable

- Given a black, foreign-window, full-screen, or focus-lost capture
- When the image cannot be tied to the target Kitty OS window
- Then the case MUST be BLOCKED, not PASS or product FAIL.

### Scenario: attributable Kitty content is black

- Given the target OS window and child window are identified and the captured
  content is completely black with the process alive
- When the frame is attributable and settled
- Then the case MUST be recorded as a product FAIL or OPEN product-fail
  candidate only if a known-good Kitty positive control renders on that same
  physical capture surface
- And the run MUST retain the capture and command for diagnosis.

### Scenario: Kitty positive control is also black

- Given a target Vexart capture is black and a synthetic known-good Kitty packet
  plus official kitten icat are also black in fresh windows
- When the capture surface has no visible positive control
- Then the Vexart case MUST be BLOCKED as Kitty/WindowServer surface evidence
- And the historical rapid-navigation RangeError MUST remain separate from the
  current blocked presentation result; automated 100-cycle coverage may close
  the stack-overflow investigation without closing Kitty proof.

## Requirement: ownership-preserving minimal fixes

Confirmed fixes MUST preserve the DEC-014 boundary: TypeScript owns scene graph,
reactivity, Flexily layout, render graph, focus, hit-testing, and events; Rust
owns WGPU paint, compositing, Kitty encoding/transport, and native resources.
This contract follows ARCHITECTURE.md Sections 2.5, 4.2, and 5.1.

### Scenario: a case has a reproducible defect

- Given a listed case fails in a focused test or attributable Kitty run
- When an implementation agent proposes a fix
- Then it MUST be the smallest responsible-layer change
- And it MUST add a focused regression.

### Scenario: a suspected defect is not isolated

- Given a remaining suspected cause such as Kitty black presentation, an
  unreconciled visual mismatch, or an unmet performance target (self-filter,
  crop-equivalence, grouped defects, and N1 now have focused automated coverage,
  while Kitty proof remains a separate gate)
- When the tracker is updated
- Then status MUST remain OPEN and no speculative refactor or reference refresh
  is allowed.

## Requirement: genuine Kitty validation

A visual PASS MUST use a dedicated Kitty OS window, child-window-targeted input,
platform-window-targeted capture, live process/stderr observation, and a settled
frame. The command and case ID MUST be recorded.

### Scenario: an exact case is validated

- Given its focused regression is green
- When the case is exercised in Kitty
- Then the capture MUST show the expected visual/state transition
- And the process MUST remain alive with no unexpected stderr
- And only that case may be marked PASS.

### Scenario: Kitty evidence is unavailable

- Given the target frame cannot remain attributable
- When validation is attempted
- Then the case MUST remain BLOCKED with reason and next bounded retry.

## Requirement: rollback safety

- Given a before/after regression
- When the owner rejects the change
- Then the introducing commit or smallest change MUST be revertible
- And references/captures MUST be preserved and focused checks rerun after rollback.
