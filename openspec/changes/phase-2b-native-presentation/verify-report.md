# Verify Report: Phase 2b Native Presentation

## Verified

- `cargo build --release` passed.
- `cargo build` passed, producing the local debug dylib used by Bun FFI.
- After visual jitter report, native and TS Kitty transmit paths were updated to include `C=1` on `a=T` image display commands so image presentation cannot move the terminal cursor and scroll the viewport.
- After interaction report, the frame compositor now re-layouts on any interaction state change (`hovered` / `active` / `focused`), not only on click, so interactive styles render in the same frame instead of waiting for resize.
- Removed the only Rust build warning (`emit_direct_rgba` dead code), then rebuilt cleanly.
- `cargo test --lib` passed: 112 passed, 0 failed.
- `bun typecheck` passed.
- `bun test packages/engine/src/ffi/native-presentation-stats.test.ts` passed.
- `bun test` passed: 230 passed, 0 failed.
- `bun --conditions=browser run scripts/perf-baseline.tsx --check` passed after interaction fix: 14.70 ms/frame vs saved 14.73 ms/frame baseline (-0.2%), under 19.15 ms threshold.
- `bun run build:dist` completed and produced `dist/` artifacts after the cursor and interaction fixes.
- `rustfmt --check native/libvexart/src/kitty/transport.rs` passed.
- Static code inspection confirms normal native layer/region presentation routes through `nativeEmitLayerTarget` / `nativeEmitRegionTarget` instead of returning RGBA payloads to JS.
- Static code inspection confirms native target-backed Rust stats set `rgba_bytes_read = 0` for normal frame/layer/region presentation stats.
- 2026-04-23 re-check: `bun run typecheck` passed.
- 2026-04-23 re-check: `bun test packages/engine/src/ffi/native-presentation-stats.test.ts` passed: 3 passed, 0 failed.
- 2026-04-23 re-check: `cargo test --lib` passed: 112 passed, 0 failed.
- 2026-04-23 re-check: `bun test` passed: 230 passed, 0 failed.
- 2026-04-23 re-check: `bun run perf:check` passed: 17.54 ms/frame vs saved 14.73 ms/frame baseline (+19.1%), under the +30% threshold (19.15 ms).
- 2026-04-23 interaction repaint fix: dirty tracking now uses a monotonic dirty version so marks created during an in-progress frame are not cleared by that frame's final `clearDirty()`. This preserves the follow-up repaint needed when `onPress` mutates Solid state (for example clicking showcase tab 2) after interaction dispatch.
- 2026-04-23 post-fix checks: `bun run typecheck` passed; `bun test packages/engine/src/reconciler/dirty.test.ts` passed: 2 passed, 0 failed; `bun test packages/engine/src/ffi/native-presentation-stats.test.ts` passed: 3 passed, 0 failed; `bun test` passed: 232 passed, 0 failed; `cargo test --lib` passed: 112 passed, 0 failed; `bun run perf:check` passed: 15.30 ms/frame vs saved 14.73 ms/frame baseline (+3.9%), under the +30% threshold.
- 2026-04-23 follow-up repaint wake fix: global dirty notifications now mark all layers dirty and wake/nudge the render loop after startup. This covers Solid updates triggered by `onPress` after the original input nudge has already been consumed.
- 2026-04-23 post-wake checks: `bun run typecheck` passed; `bun test packages/engine/src/reconciler/dirty.test.ts` passed: 2 passed, 0 failed; `bun test` passed: 232 passed, 0 failed; `bun run perf:check` passed: 17.57 ms/frame vs saved 14.73 ms/frame baseline (+19.3%), under the +30% threshold.

## Not Run

- Full `cargo fmt --check` was not used as a gate because the current Rust tree contains pre-existing formatting drift outside this change; running `rustfmt` broadly would modify unrelated files.
- Visual showcase parity is not marked complete because it requires human visual confirmation in a Kitty-compatible terminal.
- `bun run build:dist` reported pre-existing legacy native-copy warnings: missing `zig/zig-out/lib/libtge.dylib` and missing `native/kitty-shm-helper/build/libtge_kitty_shm_helper.dylib`. The build still completed successfully.

## Attempted Visual Parity Check — Blocked By Current Shell

Command attempted:

```sh
VEXART_DEBUG_KITTY=1 VEXART_DEBUG_NATIVE_PRESENTATION=1 VEXART_EXIT_AFTER_MS=3000 bun --conditions=browser run examples/showcase.tsx
```

Observed result:

```txt
[tge/terminal] transmission mode decision {
  kittyGraphics: false,
  kittyPlaceholder: false,
  tmux: false,
  transmissionMode: "direct",
}
error: TGE GPU-only renderer requires a terminal with Kitty graphics support
```

Environment evidence:

```txt
TERM=xterm-kitty
KITTY_WINDOW_ID=<unset>
```

Conclusion: this API shell identifies as `xterm-kitty`, but it does not answer the active Kitty graphics probe (`_Gi=31;OK`). Therefore it cannot be used to close manual visual parity. This is an environment limitation, not a failed rendering parity result.

## Manual Code Validation

- Final-frame native path returns `native-presented` and avoids returning final-frame RGBA to JS.
- Dirty-layer native path now emits from the Rust target via `vexart_kitty_emit_layer_target`, avoiding Rust -> JS RGBA in normal native layer presentation.
- Dirty-region native path emits from the Rust target via `vexart_kitty_emit_region_target`, avoiding Rust -> JS RGBA for regional presentation.
- Raw `vexart_kitty_emit_layer` remains as compatibility fallback only.
- Native presentation is enabled automatically when terminal probing selects SHM, unless disabled by `nativePresentation: false` or `VEXART_NATIVE_PRESENTATION=0`.
- Regional repaint keeps the target-backed path and uses native region emission instead of replacing the full terminal image with a partial target.
- Kitty image display commands use `C=1` to prevent cursor movement/terminal scrolling after the first frame.
- Interaction state updates trigger same-frame layout/paint for hover, active, and focus styles.
- Dirty marks raised during frame execution are version-protected from being cleared at frame end, so Solid state updates triggered by `onPress` are no longer swallowed until an unrelated resize.
- Dirty notifications now also wake the loop, so a Solid update that happens after the input event's first repaint request still schedules a follow-up frame.

## Remaining Verification

- Run showcase in a real interactive Kitty/Ghostty/WezTerm session and confirm visual parity manually.
- Capture terminal-output baselines for showcase, heavy text, glass/effects, scrolling, and interaction scenes from that same capable session.

## Manual Visual Check Command

```sh
VEXART_DEBUG_NATIVE_PRESENTATION=1 bun --conditions=browser run examples/showcase.tsx
```

Expected runtime evidence:

- Native presentation activates only with SHM transport.
- Debug output includes native presentation stats.
- Normal final-frame/layer/region presentation reports `rgbaBytesRead === 0` in TS-facing stats.
- If native presentation fails, fallback reason is recorded and TS raw path remains available.

Manual close criteria:

- Kitty graphics probe succeeds (`kittyGraphics: true`).
- SHM transport activates for native presentation when available.
- Showcase renders without cursor scroll/jitter.
- Hover, active, and focus visual states update in the same frame.
- Tab clicks and other `onPress`-driven Solid state changes repaint without requiring terminal resize.
- No visible regression against the TS presentation path across tabs 1-7.
