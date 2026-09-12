# Vexart Studio / Mission Control / Effects Playground — 2026-09-12

final result: blocked

The current request is for three working **native Vexart demos matching the
approved mocks**, with generated assets. This report does not accept a merely
similar screenshot as an identical result. The earlier Pi review is preserved
unchanged below this section.

## Current visual truth and implementation evidence

All paths below are relative to `/Users/dev/ve/vexart/`.

| Demo / state | Approved source | Native implementation capture |
| --- | --- | --- |
| Studio: Landscapes, dunes selected, grid, Fit, no search | `examples/demos/references/studio.png` | `examples/demos/captures/studio-1536x1024.png` |
| Mission: api selected, initial simulated metrics/logs, unpaused | `examples/demos/references/mission-control.png` | `examples/demos/captures/mission-1536x1024.png` |
| Effects: Glass, white 12%, radius 18, blur 24, saturation 140%, shadow enabled | `examples/demos/references/effects-playground.png` | `examples/demos/captures/effects-1536x1024.png` |

Source and primary implementation images are **1536 × 1024 pixels**. The native
artboard uses those same pixel coordinates at scale 1; no CSS viewport, browser
deviceScaleFactor, or Retina conversion applies. Additional native captures are
`examples/demos/captures/{studio,mission,effects}-1200x800.png`, using proportional
scale 0.78125. Source references are not runtime screenshots or loaded UI assets.
The app-owned mock title strip is rendered; an actual terminal's outer window
decoration is separate and unverified.

The source and current implementation were opened together in the same comparison
input for each demo. Root inspected full-view composition and readable native-size
regions: Studio sidebar/thumbnail captions/hero (x226–1536, y118–880), Mission
service selection/charts/log rows (x0–1536, y145–900), and Effects glass/inspector/JSX
(x297–1536, y214–938). The unscaled full-resolution inputs made labels, outlines,
code and keycaps readable; no destructive source-image cropping was necessary.
The smaller captures were separately inspected for wrapping and clipping, not
treated as a different reference design.

`capture.tsx` mounts the real demo components in Vexart's existing offscreen
renderer, dispatches input, waits for image decoding, checks image errors, and
writes Rust/WGPU RGBA readback. These are **native offscreen** receipts, not browser
captures, physical-terminal evidence, or proof of OS clipboard delivery.

## Current findings

- [P1 — Studio preview] **Modal focus/input leaks to hidden controls.** Opening
  preview focuses its close button, but `/` moves focus to the underlying search
  while the overlay stays open; Tab moves to the hidden Landscapes control and
  Enter can activate it. Independent native input verification reproduced both
  paths. `PreviewOverlay` and the global shortcut handler need a real modal focus
  scope/input boundary using existing engine/headless ownership facilities, not
  repeated focus-setting callbacks. This remained after the bounded correction
  and was not patched again in this stage.
- [P1 — visual identity] **Generated imagery is not identical to the mocks.**
  Studio's dunes and supporting photographs preserve subjects, palette and
  composition, but differ in exact contours, lighting and texture. The Effects
  ribbons also differ. All seven artwork assets were generated with Image Gen;
  provenance is in `examples/demos/ASSETS.md`. Exact asset reconstruction remains
  necessary before claiming literal identity. The runtime never substitutes a
  baked screenshot for editable UI.
- [P2 — effects] **Glass still differs in blur, saturation and shadow treatment.**
  The native specimen combines real translucent fill, backdrop filters and shadow;
  the generated artwork itself has no baked glass. Source inspection established
  that the shadow is not included in the backdrop snapshot, but the analytic
  shadow shader paints full shadow alpha inside the box (`shadow.wgsl:72–79`).
  That remains visible through translucent fill. The bounded preset correction
  removed brightness compensation and weakened shadow color to `#00000022` in
  both the native specimen and its JSX. The fresh comparison is lighter, but more
  saturated/less frosted than the source. There is no current public outer-only
  shadow option; adding one would require an explicit engine/API decision. No
  engine change or further compensation was attempted.
- [P2 — typography/tokens] **Font rendering and microgeometry still differ.**
  Helvetica Neue / Menlo provide the intended sans/mono roles, but the native
  rasterization, some weights, small text and keycap spacing are not exact matches
  to the image-generated reference. Mission traces and flat chart fills also
  differ from the drawn mock. These remain visible identity differences, not
  evidence of pixel equality.
- [P2 — Mission live logs] **New log rows leave the viewport and cannot be reached
  without filtering.** Independent native verification after approximately 4.2
  seconds found rows at global y926/y952 and beyond, while the fixed log pane ends
  at y920 and the footer starts at y952. The list has no scroll viewport or
  follow-tail behavior (`mission-control.tsx:431–441`). It now receives real local
  simulated updates, but must gain a properly owned scroll/follow-tail surface
  before this journey passes. This remains after the one bounded correction pass;
  no additional repair loop was started.
- [P2 — Studio event ownership risk] The global Enter handler's microtask
  “re-open if closed” fallback currently passes the focused Enter test, but
  depends on subscriber order rather than deterministic ownership. It should be
  resolved with the modal/input boundary above, not accepted as an engine fix.
- [Verification boundary] **Physical terminal and clipboard are not verified.**
  Computer Use denied access to Ghostty; no alternate route was used to bypass
  that denial. The repository physical Kitty/tmux test reports BLOCKED because
  this shell has no real Kitty stdin/stdout TTY. Offscreen success does not waive
  this gate. Copy dispatch is tested, not OS clipboard receipt.

## Required fidelity surfaces

- **Fonts/typography:** measured scaled font sizes are rounded to the same integer
  pixels sent to native paint, and line-height uses pixels. Regression tests prove
  “Running”, “Mission Control”, and Space/Esc keycaps no longer wrap at 1200 × 800.
  No exact font/antialiasing identity is asserted.
- **Spacing/layout:** principal dividers, panel coordinates, thumbnail grid and
  hero dimensions follow the 1536 × 1024 artboards. Studio's redundant outer clip
  was removed after source/layout/readback comparison isolated a 40px shift.
  The gallery retains its real clipping/scroll viewport. This desktop composition
  scales proportionally; a separate phone layout was not requested or built.
- **Colors/tokens:** dark neutral panels, ivory text, amber Studio selection and
  mint service state are present. The native glass/shadow mismatch remains above.
- **Image quality/assets:** seven custom raster assets and licensed Phosphor
  regular icons are local, decoded and rendered natively. No missing-image
  placeholders, handcrafted replacement icons or web recreation are used.
- **Copy/content:** service data is explicitly simulated; no actual process is
  contacted or controlled. Studio dimensions/sizes and twelve library records are
  illustrative fixtures, not claimed PNG metadata. JSX uses the actual percentage
  API (`backdropSaturate={140}`), not the mock's erroneous `1.4`. The footer says
  `VEXART DEMO`, intentionally not `DESIGN MOCK`.

## Comparison and correction history

1. Initial native captures exposed Studio's 40px paint displacement, unscaled/
   undersized type, fractional-size wrapping, incorrect glass layering, weak
   slider hit targets and an inaccurate chart fill. These blocked acceptance.
2. Corrected the redundant Studio clip, rounded typography consistently, prevented
   shortcut keycap shrink, made the glass one native effect-bearing specimen,
   expanded slider hit targets, and used seam-free opaque chart strips. Regenerated
   and opened all three 1536 × 1024 and 1200 × 800 captures. Composition/readability
   improved; image and native-effect identity still did not pass.
3. Independent source and real input audit found the interaction defects above.
   Root's mounted shared-artboard resize regression passed with the same content
   node retained and its font/position/layout updated from 1536 to 1200 width.
   Mission's reactive row styling, keyboard focus/Enter, moving chart history,
   live log generation, pause and mounted chart resize now pass independent
   re-verification (4 tests / 29 assertions). The subsequent longer-lived stream
   check exposed the remaining log-viewport P2 above. Effects' lighter native
   preset and matching JSX pass focused checks (4 tests / 24 assertions), with
   visual differences still open. Studio's filter/empty selection, correct
   arrow/Enter selection, grid scrolling and list/grid geometry pass focused
   verification (6 tests / 27 assertions), but the independent modal Tab/slash
   journey exposed the remaining P1 input-scope defect above.
4. Capture-state correction explicitly moves the synthetic pointer outside the
   artboard as well as clearing focus. The latest Mission readback no longer has
   an unintended first-row hover highlight; only the mock's selected log remains.

## Final root check receipts

- `bun run typecheck` — passed after all bounded source corrections.
- `bun run test:demos` — **17 passed / 125 assertions** after correction. These
  passing tests do not cover away the independently observed remaining issues.
- `bun run test ./examples/demos/shared.test.tsx` — 3 passed / 45 assertions,
  including the added same-instance resize regression.
- `bun run demo:capture` and `bun run demo:capture all 1200 800` — all three passed
  again after final source changes. Root opened the final Studio/source pair and
  all three smaller captures; no initial-state wrapping/overflow was observed.
- `bun run test` — **1044 passed, 1 failed, 6617 assertions**. The sole failure is
  the physical Kitty/tmux preflight (`scripts/visual-test/tmux-grid.test.ts:284`),
  which explicitly reports no real Kitty TTY. This whole-repository run preceded
  the bounded correction; the final changed-scope suite above was rerun. This is
  not an all-green full-suite claim.
- `git diff --check -- package.json design-qa.md` and new demo source whitespace
  inspection — passed. The historical Pi report is preserved byte-for-byte.

## Implementation checklist / acceptance boundary

1. This correction stage stops with Studio's modal focus scope and Mission's
   scroll/follow-tail viewport still unresolved; neither app is accepted as fully
   interaction-verified merely because the current automated suite is green.
2. Reconcile remaining imagery, typography and glass differences before claiming
   “identical”; do not silently lower the user's acceptance criterion.
3. Validate real terminal transport, resize, pointer/keyboard operation and
   clipboard delivery in an authorized compatible terminal before publishing.
4. No engine, provider, security, font installation or plugin configuration was
   changed, and no Discord post or external deployment was performed.

final result: blocked

---

# Pi / Vexart — visual acceptance

final result: blocked

## Reference and runtime

The approved reference is native app chrome, not a website. Browser scaffolding,
web hosting and CSS viewport rules do not apply; captures use Vexart's actual
Rust/WGPU renderer with Solid reconciliation and dispatched input.

Source directory: `/Users/saturno/.codex/generated_images/01a093db-6e16-73d0-85e3-5e01ce332636/`

- Conversation/sessions: `exec-b623a3d0-1a2f-46c8-9516-49af8fa07a46.png`
- Tree/models: `exec-cb2ce642-8339-47f1-a26c-6dd8a3671925.png`
- Commands/settings: `exec-21f72ec1-df8b-47a4-aade-27f6fa2c602c.png`
- Work disclosure states: `exec-ce837c5e-7bd3-4ac7-a133-639cc3d70b03.png`

## Baseline comparison

Opened source board and native `pi-agent/conversation-expanded.png` together.
Baseline capture directory:
`/Users/saturno/.codex/visualizations/2026/09/12/01a093db-6e16-73d0-85e3-5e01ce332636/pi-agent/`

Source board: 1630×965; conversation app region approximately 780×870.
Baseline runtime: 1440×1000 native pixels, no CSS/deviceScaleFactor.
Baseline content was isolated real Pi bash, not the source's populated conversation.
These state/aspect differences prohibit pixel-perfect comparison. They do not
explain the missing visual treatment and broken menu layout below.

## Initial findings (renewed stage)

- [P1] Composer: missing mint border/glow and expected compact single-surface
  editor; baseline has a grey nested textbox and unrelated submit treatment.
- [P1] Typography and hierarchy: baseline type is substantially smaller/fainter;
  user bubble, final-answer hierarchy and screen titles need populated captures.
- [P1] Navigation: baseline text glyphs do not match the approved line icons.
- [P1] Commands: suggestion rows lose layout and overflow the bounded panel.
- [P2] Surfaces/tokens: native gradients, edge highlights, shadows and panel
  framing are absent or too weak; selected states do not match the reference.
- [P0 functional] Stop/Escape does not cancel manual Bash; final source audit
  established Pi requires abort_bash for that operation.

## Required evidence before acceptance

- Same-viewport populated conversation and screen captures; compare full views
  and focused composer/sidebar/menu regions against the source.
- Explicit review of typography, spacing, color/effects, icon assets, copy and
  real empty/loading/error states. Do not fabricate model availability, costs,
  git status, tool results or elapsed time to match sample text.
- Keyboard and pointer interaction checks with real Pi RPC; both stop paths.
- Independent verifier and root integrated-diff review.
- Physical terminal transport remains a separate unverified layer: CUA denied
  Ghostty access. Offscreen GPU must not be described as physical-terminal proof.

## Iteration history

1. Luna baseline: functional smoke checks passed; critical Stop and visible
   styling/layout differences remained. Not accepted as visual match.
2. Astra medium renewed stage: corrected rich button composition, replaced
   unsupported icon glyphs with licensed Lucide assets, restored the mint
   composer treatment and added real Bash cancellation. Populated captures
   exposed inline Markdown wrapping, disclosure measurement, model overflow and
   native geometry corruption. Not accepted at this stage.
3. Native root cause fixed: the shared GPU vertex arena was reset after an
   inner target submitted while a parent encoder still referenced that memory.
   It is now released only when all target encoders have finished. A real GPU
   pixel regression fails before the fix and passes afterward. Independent
   native verification passed 219 library tests (1 ignored) plus alpha (1),
   blur (1), image transform (3) and shadow (4) integration tests. Captures in
   `/tmp/pi-render-fixed/` retain the missing surfaces and clean effects.
   App-level layout corrections remain in progress.

## Real provider evidence (separate from visual acceptance)

On 2026-09-12, the live harness used the already configured `openai-codex`
provider and `gpt-5.5`, typed through the native composer, and completed actual
read/edit/bash tool calls. The resulting disposable code passed an independent
`bun test`. No user source or credentials were copied into the test project.

Report and original runtime captures:
`/Users/saturno/.codex/visualizations/2026/09/12/01a093db-6e16-73d0-85e3-5e01ce332636/pi-agent-astra-live/`

The recorded `provider-session.jsonl` is real output from that test, not a mock
transcript. Later visual iterations replay it through Pi without repeating the
provider call. That functional result does not by itself pass visual QA.

## Final corrected comparison — 2026-09-12

**Functional verification: passed. Visual identity gate: blocked.**

Fresh corrected native captures:
`/Users/saturno/.codex/visualizations/2026/09/12/01a093db-6e16-73d0-85e3-5e01ce332636/pi-agent-verified/`

Root opened the source conversation/sessions board and the corrected native
conversation, expanded, sessions, commands and model frames together in one
comparison input, then opened tree/settings and the Tab-completion frame.
The target app regions are approximately 780×870 inside the 1630×965 boards;
corrected captures are 780×870 native pixels (no CSS/device-scale conversion).
A second 1440×1000 replay was captured by the implementer at
`/tmp/pi-correction-final1440/`. No physical terminal capture is claimed.

States use the recorded real-provider conversation rather than fabricated
messages, sessions, branch names, model choices, token percentages or timings.
The source boards show different sample content, so pixel-equality scores would
be misleading. Root inspected the composer, rail, menu and modal at readable
native resolution in addition to full-view layout.

### Required fidelity surfaces

- **Fonts/typography:** readable native sans-serif hierarchy restored; prose
  no longer collapses into narrow flex columns. Inline emphasis/code-span
  styling remains reduced. No exact font/antialiasing identity is claimed.
- **Spacing/layout:** rail, header, composer anchoring and panel hierarchy now
  closely follow the source. Header project/new-session align right. Real
  large lists use clipped ScrollView viewports. The focused editor retains
  an extra inner outline, unlike the one-outline source composer.
- **Colors/effects:** black/ivory/mint palette, native gradient, mint halo,
  shadows and model-dialog backdrop blur are present. Native geometry
  corruption was fixed at its buffer-lifetime root cause, not masked.
- **Assets:** official licensed Lucide source/raster icons replace unsupported
  glyphs. Native controls remain actual interactive controls, not screenshots.
  Exact source icon/radio microstyling is not claimed.
- **Copy/content:** Spanish screen labels and real timestamp-derived work
  duration are present. The real recording yields `Worked for 11s`, not the
  mock's invented sample duration. Actual model names/session counts differ
  intentionally. Pi has no RPC tree navigation, so the action says bifurcate.

### Remaining findings

- [P2] **Focused composer differs visibly.** Its public Textarea combines the
  caret color and focused border styling. The app preserves the visible caret
  and therefore has a second border. Exact reproduction needs a deliberate
  supported styling-contract change; masking the border/hiding the caret is
  not an acceptable workaround.
- [P2] **Some planned capabilities are absent.** Image attachments/rendering
  and the corresponding mock display control are not implemented. The
  interface does not expose a fake working image toggle.
- [P2] **Rich Markdown fidelity is incomplete.** Prose content wraps correctly,
  but inline emphasis/code spans do not have the source's rich styling.
- [P3] **Microstyle:** source icon shapes, selected-row details, search-field
  composition and surface texture are close rather than pixel-identical.

### Final functional receipts

- Root: `bun run typecheck` passed.
- Root: `bun run test examples/pi-agent` — **17 passed, 0 failed, 58 assertions**.
- Root: `git diff --check` passed.
- Root native smoke: real composer Bash, settings RPC, Stop, Escape, slash
  Enter/Tab/Down/Escape all passed. Palette operations added no provider prompt.
- Independent verifier reproduced close/restart cancellation passing after
  failing before the per-request ownership fix; final source audit passed.
- Independent native GPU suite and release build passed (details above).
- Real model/tool/code-test result passed (separate provider evidence above).

### Final status

The real RPC implementation and its focused functional verification are
complete for the documented phase. The user's stronger request for every
capability and visual identity is **not** complete. Do not label this a 1:1
mock reproduction or full Pi TUI parity. The remaining styling-contract work
is an explicit boundary, not a reason to claim a false pass.

final result: blocked
