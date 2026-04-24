# Design: Phase 3f — Native Default Cutover

## Technical Approach

Cutover is a configuration and verification phase, not a rewrite phase. The native path must already satisfy behavior and performance gates before defaults change.

## Cutover Rules

- Default feature flags enable native retained path.
- Emergency env override disables retained path.
- Debug overlay clearly reports native/fallback mode and fallback reason.
- Docs describe native path as normal behavior.

## Gates

- Golden image parity.
- Interaction parity.
- API extractor clean.
- Benchmarks meet or beat baseline.
- Fallback compatibility smoke passes.
