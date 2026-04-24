# Proposal: Phase 9e — Real Terminal Transport Validation

## Problem

Phase 9c/9d proved the SHM/file transport policy in mock-terminal benchmarks, but the real user environment still needs validation across terminal emulators, tmux, and SSH. Without a reproducible matrix, we cannot distinguish runtime probing bugs from performance regressions.

## Intent

Add a real terminal transport validation tool that records detected terminal capabilities, transport manager state, native presentation status, fallback reason, and optional p95 benchmark data.

## Scope

- Add a terminal transport matrix script.
- Support non-interactive/static mode for CI-safe smoke.
- Support active terminal probe when run inside a real TTY.
- Optionally run the frame breakdown benchmark using the detected transport.
- Add package scripts and ignore generated reports.

## Non-goals

- Do not automate SSH/tmux spawning in this slice.
- Do not force real terminal validation in PR CI.
