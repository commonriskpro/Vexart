# Tasks: Phase 2b — Native Presentation

## 0. Baseline And Phase 0 Closure

- [x] 0.1 Record approved architecture decisions in the change artifacts.
- [x] 0.2 Capture initial offscreen baseline metrics and save `scripts/perf-baseline.json`.
- [x] 0.3 Document current normal-presentation Rust -> JS RGBA transfer points.
- [ ] 0.5 Capture terminal-output baselines for showcase, heavy text, glass/effects, scrolling, and interaction scenes. Blocked in current API shell: `TERM=xterm-kitty` is present, but active Kitty graphics probe does not return OK, so `kittyGraphics=false` and showcase exits before rendering.
- [x] 0.4 Confirm feature flags and env fallback behavior.

## 1. Native Stats Contract

- [x] 1.1 Define `NativePresentationStats` packed struct in Rust.
- [x] 1.2 Add TS mirror type and decoder.
- [x] 1.3 Add unit tests for stats struct size/version decoding.

## 2. Native SHM Presentation Exports

- [x] 2.1 Harden or wrap `vexart_kitty_emit_frame` for SHM presentation with stats.
- [x] 2.2 Add native layer presentation export.
- [x] 2.3 Add native region presentation export.
- [x] 2.4 Add native delete-layer export.
- [x] 2.5 Add FFI signatures in `packages/engine/src/ffi/vexart-bridge.ts`.

## 3. Backend Contract And Feature Flag

- [x] 3.1 Add `native-presented` result mode to renderer backend types.
- [x] 3.2 Add `nativePresentation` feature flag and `VEXART_NATIVE_PRESENTATION=0` override.
- [x] 3.3 Ensure fallback path remains the default when native presentation is disabled or unsupported.

## 4. Final-Frame Native Presentation

- [x] 4.1 Route final-frame presentation through native SHM output when enabled.
- [x] 4.2 Avoid returning final-frame RGBA to JS in normal presentation mode.
- [x] 4.3 Preserve `renderToBuffer` and screenshot/offscreen readback behavior.

## 5. Dirty-Layer Native Presentation

- [x] 5.1 Route dirty layer presentation through native SHM output when enabled.
- [x] 5.2 Route layer deletion through native output when enabled.
- [x] 5.3 Route region presentation through native output when regional repaint is active.
- [x] 5.4 Preserve TS raw layered path as fallback.

## 6. Debug And Observability

- [x] 6.1 Surface native presentation mode in debug stats.
- [x] 6.2 Surface native bytes emitted, bytes read back, encode time, write time, and total time.
- [x] 6.3 Add debug logs for fallback activation reasons.

## 7. Verification

- [x] 7.1 Run Rust tests for native Kitty presentation and stats.
- [x] 7.2 Run TS tests for backend contract/fallback behavior.
- [ ] 7.3 Run visual showcase parity check in a Kitty-compatible terminal. Blocked in current API shell for the same probe reason as 0.5; must be run from an interactive Kitty/Ghostty/WezTerm session that answers the Kitty graphics probe.
- [x] 7.4 Compare after metrics against baseline.
- [x] 7.5 Confirm normal native presentation transfers 0 raw RGBA bytes to JS.
