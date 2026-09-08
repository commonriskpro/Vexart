# tmux support

Vexart can run inside **tmux 3.4 or newer** when the outer terminal is Kitty
or Ghostty and supports Kitty Unicode placeholders. This path is experimental:
the full-frame SHM production code path passes through a real tmux 3.6a PTY with
a synthetic receiver. A qualitative human review of all six showcase tabs is now
confirmed for Kitty direct and Kitty inside tmux; this is not pixel-exact or an
exhaustive interaction check, and Ghostty/FPS remain unverified.
tmux 3.4 is the conservative lower bound; the PTY evidence does not measure
every supported tmux version.
Use the checklist below before treating a particular terminal/tmux combination as
verified. The requirement ledger is in [tmux-completion-audit.md](./tmux-completion-audit.md).

**Status — 2026-09-08:** the requested Kitty direct/tmux parity is verified by
the automated and six-tab human checks below. The snapshot below records automated
evidence from 2026-09-07; it is historical, not a new run. Kitty/Ghostty CUA
denial belongs to that historical capture attempt; the current Kitty review was
supplied manually by the user rather than captured by CUA, and no workaround was
used. Ghostty, FPS, pixel-exact measurement, and exhaustive interaction coverage
remain outside this requested closure.

**Current evidence — 2026-09-08:** the real tmux lifecycle is PASS in
`/tmp/vexart-lifecycle-production-final.59302.1064`: 8 SHM names including the
lost producer-only case, same-TTY reconnect, fresh frame, and geometry. Cleanup
review evidence is the PTY artifact `/tmp/vexart-shm-review-lifecycle.1788868930.74725.20121`;
it is not a focused-unit test log. Normal/reject/timeout remain PASS (the
negative fixture's FAIL is expected), and the latest runner order gates pass in
`/tmp/vexart-shm-runner-final-normal.1788869766.95269.19333` and
`/tmp/vexart-shm-runner-final-lifecycle.1788869768.95269.5837`. The final serial
four-mode PTY run also passes in `/tmp/vexart-resumed-final-pty.0Hc1os/`: normal
6 uploads/7 SHM/2 deletes; lifecycle 6 uploads/8 SHM/1 delete on the same TTY;
reject and timeout 1 upload/2 SHM/1 delete each, with expected producer FAIL. The
cleanup path surfaces errors; it does not guarantee cleanup when terminal writing
fails. The older FAIL
`/tmp/vexart-lifecycle.33464.2337` is historical. Automatic recovery (pause with
no client, replay the last SHM frame on reconnect, no config change) is approved
and verified by this cycle. The strict focused native styled-overlay matrix now
passes 1/1 in `/tmp/vexart-styled-overlays-ownership-green-1788870121501` after
ownership was corrected to track only actually published layer IDs in
`packages/engine/src/ffi/native-presentation-ops.ts`. The prior direct-cleanup
failure is retained as a timing-investigation artifact in
`/tmp/vexart-styled-overlays-final-matrix`. The
current TypeScript suite completed **539 pass, 0 fail, 82 files, 1781 expects**
in `/tmp/vexart-resumed-stable-tests.log`; main and scripts typechecks pass in
`/tmp/vexart-resumed-final-typecheck.log` and
`/tmp/vexart-resumed-stable-scripts-tsc.log`. The current 52-scene matrix finished
**52/52 PASS, 0 FAIL** in `/tmp/vexart-resumed-stable-matrix.nZ3get/run`, with 41
differential-only and 11 differential-plus-oracle scenes, 128 direct frames, 182
tmux frames, and 182 SHM objects; all three comparisons are exact. The audit is
in `/tmp/vexart-resumed-stable-matrix-audit.json`. The prior 51/52 run remains a
timing-investigation history:
The prior 51/52 run's only mismatch was styled overlays: 9066 channel-byte
differences (=3022 pixels), bbox `[41,216,141,251]`, only in Button. Both feature
oracles and both readbacks were exact, so there was no transport corruption. The
intentional 100 ms pressed/focus background pulse was sampled at different
moments. After a 120 ms wait plus a frame after Escape, two focused native parity
runs pass with identical SHA in
`/tmp/vexart-styled-overlay-settled-matrix-{1,2}`, and focused tests pass 2/2 in
`/tmp/vexart-styled-focused-after-settle.log`; the failed run is retained only as
timing/settling history.

Kitty normal and tmux share scene, layout, GPU, and components; tmux adds only
SHM presentation and lifecycle. Collections and ScrollView are green after
sorting only `scissorLayers`, with final image
`/tmp/vexart-collections-parity-scrollfix-final-1788868047588501000`; two scroll
background checks also pass in `/tmp/vexart-scroll-background-final-1788870228543.log`.
The shared
Button stable-getter fix removes the closed-dropdown livelock; red/green evidence
is in `/tmp/vexart-button-stable-{red,green}.log`. The styled overlay offscreen
check has 2 PASS and 5 negative expectations, with reviewed image
`/tmp/vexart-styled-overlays-final.png`; its strict native ownership gate is
also PASS 1/1 as noted above.

The stabilized final 52-scene matrix is **52/52 PASS** as described above.
Forty-two golden hashes are unchanged and pass verification in
`/tmp/vexart-resumed-final-golden-hashes.log`; no references are regenerated.
Boundary rerun remains at 5 known violations with no new ones in
`/tmp/vexart-resumed-final-boundaries.log`.
A qualitative human review of all six showcase tabs is confirmed for Kitty both
outside tmux and inside tmux: the views were reported as looking quite exact.
This is not a pixel-exact measurement or an exhaustive callback/input check;
Ghostty and FPS remain unverified, and no CUA capture or workaround was used.

This is a transport exception, not a second renderer. Vexart still renders
GPU pixels and does not fall back to ASCII, half-block, or character-art output.

## Historical verification snapshot — 2026-09-07

The focused checks recorded on 2026-09-07 are automated evidence only; they do not prove a
physical Kitty or Ghostty display:

- The TypeScript suite completed **515 pass, 0 fail, 77 files, 1604 expects**;
  `bun run typecheck` passed. Log: `/tmp/vexart-parity-final-tests.log`.
- `cd native/libvexart && cargo test --features gpu-tests` completed **186 pass,
  0 fail, 1 ignored**; the release build at 22:23 local is separate and
  predates this native test. Log:
  `/tmp/vexart-parity-finish-native.log`.
- The final focused packet/pixel matrix passed **50/50 scenes**: 41
  differential-only and 9 with scene oracles, covering 99 direct frames and
  145 tmux-SHM frames. Artifacts are in
  `/tmp/vexart-parity-final-matrix.4rdpKx/run`.
- Visual golden comparison remains **2 passed, 39 failed**; no golden files were
  regenerated. Log: `/tmp/vexart-parity-final-goldens.log`.
- Boundary lint still reports **5 pre-existing violations**; no boundary claim
  is made for that check. Log: `/tmp/vexart-parity-final-boundaries.log`.
- Focused packet/pixel parity passed for `primitives-border-padding` and
  `theme-form` in `/tmp/vexart-border-px-parity.XYaC4F/{borders,theme}`.
- The final `tmux-scenes/inputs-interaction` fixture passes direct/tmux/readback
  parity and typecheck in `/tmp/vexart-inputs-parity.MO08n1`. Its negative run
  accepts the frame and rejects 9/9 erased status markers in copied buffers; it
  makes no resource-cleanup claim. Log:
  `/tmp/vexart-parity-finish-inputs-negative-final.log`.
- The focused overlay artifact `/tmp/vexart-overlay-parity.cHRekH/summary.json`
  passes one bottom-right scene with direct/SHM parity. The six positions × two
  capability variants and Dialog Escape/unmount focus restoration belong to
  [`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx) (7 cases, 60 expectations). Toast uses
  `width="fit"` for the stack's intrinsic width. This is offscreen evidence only.
- The text path now shares the engine's prewrap behavior across Code, Markdown,
  and Diff; the text-focused parity scenes exercise that shared implementation.
- The text-free `paint-features` scene checks gradients, single/multi shadows,
  glow, corner radii, opacity, transforms, and clipping. All 7 disabled-effect
  controls passed their variant oracle and were rejected by the default oracle.
- The production `createTerminal` → native render loop → tmux 3.6a PTY run
  passed all three runner modes in `/tmp/vexart-parity-finish-pty.1x5t8X`:
  normal has 6 uploads and 7 SHM objects; reject and timeout produce the
  expected producer failures and cleanup. The receiver is synthetic; there is
  no physical display or FPS claim.

The border bug correction removed the extra inner `- aa` from `shape_rect.wgsl`
and `rect_corners.wgsl`; the 1 px border remains 1 px. Font changes predate SHM
and were unchanged in this phase; no font regression is attributed to tmux.
The 2026-09-07 snapshot recorded physical smoke as pending/blocked and the app
goal as `PAUSED`; that snapshot is historical. A current qualitative human review confirms all six showcase tabs in Kitty both
outside tmux and inside tmux, but it is not pixel-exact, does not cover every
callback/input permutation, and does not verify Ghostty or FPS. CUA access to
Kitty was denied for `net.kovidgoyal.kitty`, and Ghostty was denied in an earlier
run; those are historical denials, with no CUA workaround.

## Support matrix

| Environment | Status | Notes |
| --- | --- | --- |
| Kitty outside tmux | Supported | Existing direct, file, and SHM paths are unchanged. |
| Ghostty outside tmux | Supported | Existing direct Kitty path is unchanged. |
| tmux 3.4+ inside Kitty | Experimental / synthetic tmux-PTY SHM PASS; qualitative Kitty visual review PASS | Requires effective `allow-passthrough all`; review is human and not pixel-exact or an FPS measurement. |
| tmux 3.4+ inside Ghostty | Experimental / synthetic tmux-PTY SHM PASS; physical pending | Requires effective `allow-passthrough all`; actual Ghostty observation remains pending. |
| tmux inside WezTerm | Not claimed | WezTerm remains supported directly, but this release does not claim the Unicode-placeholder route for it. |
| tmux inside another terminal, or tmux older than 3.4 | Unsupported | No alternate pixel protocol is selected. |

The outer terminal is detected separately from the pane's `TERM`. A pane often
reports `screen-*` or `tmux-*`; that value alone is not evidence that the outer
terminal can display Kitty graphics. Vexart checks the inherited parent identity,
the live tmux passthrough option, and Kitty graphics capability before emitting
the first frame.

## Feature and transport matrix

| Feature | tmux route | Transport/performance limit |
| --- | --- | --- |
| GPU shapes and effects | Same retained WGPU effects | Presentation is one complete frame rather than independent layer updates. |
| Text | Same GPU text rendering | Copy mode sees placeholder cells, not rendered text or pixels. |
| Images and canvas | Same image/canvas content | A Kitty `U=1` placement plus a pane-sized Unicode grid; no character-art fallback. |
| Flexily layout and hit-testing | Same TypeScript ownership | Pane geometry comes from CSI `14t`/`16t`, not the outer window. |
| Keyboard, mouse, focus, paste | Fragmentation-safe parser; focused input fixture PASS; negative rejects 9/9 markers in buffer copies | tmux options, key tables, and terminfo can consume or reshape events. Physical input smoke remains pending. |
| Frame presentation | Native Rust/WGPU composition | One complete frame through local SHM is the approved tmux target; one DCS wrapper per Kitty APC. |
| SHM transport | Approved target; synthetic tmux-PTY PASS; qualitative Kitty review PASS; Ghostty/pixel-exact/FPS pending | One attached client across the tmux server; local ownership is released after `is_consumed`, error, or timeout. No automatic direct/file fallback. |
| Direct/file transport | Direct is a prior comparison baseline; file is not a tmux route | The approved tmux route does not fall back automatically when SHM is unavailable. |
| Kitty `a=f` animation updates | Not used by the current Vexart tmux route | Ghostty 1.3.1 reports the action unimplemented; changed frames are retransmitted in full. |
| Placeholder grid | Supported within protocol bound | 1–297 rows × 1–297 columns; larger grids are rejected. |
| Scroll/drag interaction | Automated SGR click/drag capture and wheel state in `scripts/visual-test/tmux-interaction.test.tsx`; physical pending | `primitives-scroll` remains differential-only; physical redraw/scroll alignment is not claimed. |
| Reattach to a different outer terminal | Not supported without reprobe | Stop and restart Vexart so parent identity and capabilities are detected again. |

## Setup (user-applied)

Vexart never edits tmux configuration. Add only the settings that match the
features your outer terminal actually supports, then restart Vexart (and source
the configuration in new or existing sessions as appropriate):

The SHM route is local-only. Vexart rejects sessions carrying
`SSH_CONNECTION`, `SSH_CLIENT`, or `SSH_TTY`; tmux over SSH is not claimed.

```tmux
# Required for Kitty graphics to cross the tmux server, including hidden panes.
set -g allow-passthrough all

# A 256-colour tmux terminfo with RGB enabled is a useful baseline.
set -g default-terminal "tmux-256color"
set -as terminal-features ",*:RGB"

# Optional input features. These affect what tmux forwards to Vexart.
set -g mouse on
set -s focus-events on
set -s extended-keys on
```

`RGB` is required for the tmux placeholder route so full image colors are not
quantized. Mouse, focus reporting, and extended keys are independent optional
input capabilities. Do not enable a feature that the outer terminal does not
support. `extended-keys`
may be reported in either tmux-supported format; Vexart's input parser accepts
fragmented CSI/SS3 and UTF-8 input, but tmux key tables and terminfo still decide
which events arrive.

## Read-only diagnostics

Run these commands from the Vexart pane. They only inspect state; they do not
change a session or a configuration file.

```bash
# Version: Vexart targets tmux 3.4+ (3.6a is the current development target).
tmux -V

# The effective pane value must print `all`; blank, `on`, `off`, or an error
# is not ready. -A includes inherited global/window values and -p respects a
# pane override.
tmux show-options -pAv -t "$TMUX_PANE" allow-passthrough

# Optional comparison with the global value (the effective value above wins).
tmux show-options -gqv allow-passthrough

# Identify the outer client and its current client dimensions.
tmux display-message -p 'client_terminal=#{client_termname} client_width=#{client_width} client_height=#{client_height}'

# Inspect the pane-side environment inherited from the outer terminal.
printf 'TERM=%s TERM_PROGRAM=%s COLORTERM=%s TMUX=%s\n' "$TERM" "$TERM_PROGRAM" "$COLORTERM" "$TMUX"

# Inspect the relevant tmux feature state without changing it.
tmux show-options -g mouse
tmux show-options -s focus-events
tmux show-options -s extended-keys
tmux show-options -g terminal-features
```

Expected results are a tmux version at least `3.4` (the current development
environment uses `3.6a`), a passthrough value of `all`, a recognized
Kitty or Ghostty client, and RGB in the attached client's features. Mouse,
focus, and extended-key settings are optional inputs. Vexart's startup probe
remains the authoritative check; these commands explain a failure and help
identify stale sessions.

## How the route works

1. TypeScript keeps ownership of the scene graph, reactivity, Flexily layout,
   render graph, hit-testing, focus, and event dispatch.
2. Rust/WGPU paints and composites **one complete frame**.
3. The approved tmux presenter transmits that frame through the existing local
   SHM primitive (one attached client across the tmux server). It creates a
   virtual Kitty placement (`U=1`) and writes the `U+10EEEE` Unicode placeholder grid through the tmux
   pane's normal text stream. Images and canvas content use this same image-grid
   route; there is no ASCII or character-art fallback.
4. Each Kitty APC is wrapped in its own tmux DCS passthrough envelope
   (`ESC P tmux; ... ESC \\`), with every `ESC` inside the APC doubled. Keeping
   APCs separate is important: tmux must forward each complete graphics
   sequence to the parent terminal. The direct baseline uses Kitty `q=2` to
   suppress both success and error responses; the SHM upload uses `q=1`, so an
   error response remains optionally observable. SHM completion is driven by
   `is_consumed`, not an ACK.

The retained GPU effects do not change in this route: rounded corners, borders,
gradients, shadows, glows, filters, opacity, transforms, text, images, and
canvas are still painted by the same GPU pipeline. What changes is presentation
and its performance envelope: the approved tmux route is one complete frame
through local SHM, with one in-flight upload and the latest pending frame. A
real tmux 3.6a PTY with a synthetic receiver now verifies the production code
path's probe, uploads, hidden-pane forwarding, burst latest-frame behavior,
runner resume (not detach/reattach), and SHM cleanup; Ghostty, pixel-exact
comparison, and FPS remain unverified beyond the qualitative Kitty review. The
**historical** direct full-frame run remains a comparison baseline. An earlier
SHM scene harness recorded 47/48 in its batch plus a corrected focused
`theme-form` PASS (48 distinct scenes, without a clean 48/48 batch); this is
historical evidence, not the current full-matrix result. There is no automatic
direct or file fallback. Native ownership is bounded through completion
(`is_consumed`),
error, or timeout cleanup; an unbounded queue or pool is not part of this route.
Kitty `a=f` animation updates are also not used: the Ghostty 1.3.1 target
reports the action unimplemented, so changed frames are retransmitted in full.
There is no current tmux SHM-speed or
animation-performance promise; do not compare this route with direct Kitty's
native transport timings or animation cadence.

The pane's current pixel area and cell size are queried separately (CSI `14t`
and CSI `16t`). This prevents an outer window's dimensions from being mistaken
for a split pane's dimensions. Resize, split, and window changes are observed
as the pane size changes and the next frame is emitted for that geometry. The
commands are grouped before a frame; this is not a separate pixel PASS for every
resize, split, or join operation.

An isolated tmux 3.6a routing check found that `allow-passthrough all` forwards
graphics from a hidden/origin pane, while `on` drops them; a returned Kitty
`ESC_G` ACK is delivered to the active pane rather than the origin. This is
transport evidence, not physical rendering proof. See the ephemeral
`/tmp/vexart-tmux-ack-routing-result.json` and reproducer
`/tmp/vexart-check-tmux-ack-routing.py`.

The Kitty row/column diacritic table currently bounds each placeholder axis to
**1–297 cells**. Vexart rejects a larger pane grid rather than wrapping a row or
column to the wrong image coordinate. This is a protocol limit of the current
placeholder route, not an ASCII fallback.

## Input and lifecycle limits

- Input reads may split at any byte boundary. The parser retains incomplete
  UTF-8, CSI/SS3, mouse, focus, and bracketed-paste sequences before dispatch.
- tmux settings and key tables can still alter or consume mouse, focus, and
  modified-key events. A successful graphics probe does not imply every input
  capability is available.
- Suspend/resume uses the normal Vexart lifecycle. Verify that the external
  process owns the terminal while suspended and that Vexart re-enters cleanly.
- Reattaching the same session through a different outer terminal is not
  supported until the terminal is reprobed. Stop and restart Vexart after such
  a reattach; do not assume the previous parent's Kitty capability still holds.
- In tmux copy mode, captured pane text contains the Unicode placeholder
  characters, not the rendered image pixels or semantic text inside the frame.

## Manual smoke checklist

Mark each item only after observing it in the exact outer terminal and tmux
version you intend to support. The six-tab Kitty review is recorded as a
qualitative human check; the checklist remains open for Ghostty, pixel-exact
comparison, and exhaustive interaction/lifecycle coverage.

- [ ] Start a fresh tmux session in Kitty and in Ghostty with effective
      `allow-passthrough all` and client `RGB`; verify the local SHM route uses
      one attached client across the tmux server.
- [ ] Render rounded corners, borders, gradients, shadows, glow, blur/filter,
      opacity, and transforms; confirm no character-art fallback appears.
- [ ] Render an image grid and a canvas scene; confirm the image follows pane
      movement and does not leave stale placements.
- [ ] Type printable UTF-8, modified keys, function keys, paste, and focus
      changes; verify the events received by the app.
- [ ] Open and close overlays/dialogs and exercise focus trapping and Escape.
- [ ] Scroll a long view; verify scrolling and redraw remain aligned to cells.
- [ ] Drag a slider or captured pointer across the pane, including a wheel event.
- [ ] Resize the pane and the outer window; split and join panes; verify the
      frame geometry and cell size update without stretching.
- [ ] Switch windows and panes; verify each active pane receives a fresh frame.
- [ ] Detach and reattach through the same outer terminal; verify cleanup and
      reprobe behavior.
- [ ] Reattach through a different terminal, stop Vexart, and restart it so the
      new outer terminal is reprobed; no stale capability is reused.
- [ ] Suspend to an external editor/process and resume; verify modes, cursor,
      mouse, focus, and the frame are restored.
- [ ] Exit normally and by signal; verify Kitty images, cursor/modes, and tmux
      state are cleaned up.

## Troubleshooting

- **`allow-passthrough` is off, `on`, or unknown**: apply the required line above,
  source/restart the tmux server or session as appropriate, then restart Vexart.
- **SHM probe or lifecycle fails**: treat the tmux route as unavailable; Vexart
  does not silently fall back to direct/file transport. Capture the diagnostic
  and stop/restart after correcting the user-owned setup.
- **Unknown parent terminal**: run the diagnostics inside the pane. A
  `screen-*`/`tmux-*` `TERM` is expected; the inherited outer identity must also
  be visible to the process.
- **Missing modified keys or focus**: inspect `mouse`, `focus-events`,
  `extended-keys`, `terminal-features`, and tmux key bindings. Configuration
  changes are user-owned and are never made automatically by Vexart.
- **Stretched output after a split/resize**: restart/reprobe after changing
  clients or outer terminals; current pane geometry is established by CSI
  `14t`/`16t` responses.
- **Placeholder characters in copy mode**: this is expected for the image-grid
  transport and is not a text-rendering failure.

## References

- [Kitty graphics protocol — Unicode placeholders](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [tmux FAQ — passthrough](https://github.com/tmux/tmux/wiki/FAQ)
- [tmux manual](https://man.openbsd.org/tmux.1)
- [Ghostty 1.3.1 Kitty graphics actions](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/terminal/kitty/graphics_exec.zig)
