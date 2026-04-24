# Proposal: Phase 9d — Transport Performance Gates

## Problem

Phase 9c proved the transport policy matters: SHM meets the 1080p/dirty-region targets, file is near target, and direct is too expensive for performance gating. Without automated gates, future changes can regress the SHM/file happy paths.

## Intent

Add repeatable performance gates for SHM and file transport while explicitly treating direct as compatibility-only.

## Scope

- Add a frame-breakdown gate script that checks p95 thresholds from the generated JSON report.
- Add package scripts for SHM and file transport gates.
- Add a CI workflow for transport performance gates.
- Keep direct out of the performance target gate.

## Non-goals

- Do not make direct transport pass 1080p performance targets.
- Do not replace existing unit/API/visual gates.
