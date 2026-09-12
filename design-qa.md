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
