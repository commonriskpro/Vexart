# Vexart demo applications

Three interactive **native Vexart** apps based on the approved image mockups in
`references/`. They use the existing Solid reconciler, TypeScript scene/layout
and Rust/WGPU rendering. There is no web view, browser recreation, or baked UI
screenshot in the running apps.

**Work in progress, not accepted as an identical reproduction.** Generated
imagery/native glass still differ from the mocks. Studio's preview still needs a
modal focus scope (Tab and `/` can reach hidden controls), and Mission Control's
live log list needs scrolling/follow-tail (new rows eventually leave the viewport).
The current demo findings are at the top of the repository-root `design-qa.md`;
its earlier Pi review is preserved below them.

From the repository root, in a Kitty-graphics-compatible terminal:

```sh
bun run demo:studio
bun run demo:mission
bun run demo:effects
```

Exit with **Ctrl+C**. The apps share the reference's 1536 × 1024 coordinate system
and scale proportionally to the terminal's pixel viewport. A large terminal
window gives the most readable result; this is a desktop-oriented demo, not a
mobile layout. The terminal emulator's own window decoration is outside the
rendered content.

## Studio

Browse the local generated photographs, select thumbnails, filter by filename,
switch grid/list mode and open the large preview. The reference's example
filenames, dimensions, file sizes and twelve library records are **illustrative
fixture metadata**, not metadata read from the generated PNG files. Six original
photographs are reused for paired detail views. Architecture and Abstract
collections show an empty state instead of pretending to load remote content.

## Mission Control

Service selection, native CPU/memory plots, log filtering and pause/resume.
**All service data is simulated** and labeled as such. No process is started,
stopped, inspected or contacted. The deterministic initial state is used for
visual captures; interactive mode advances the simulation locally.

## Effects Playground

The ribbons are an image asset. The glass surface, backdrop filters, corner
radius and shadows are rendered by Vexart and respond to the property controls.
The JSX output follows the actual Vexart API rather than copying erroneous
numbers from the illustrative mock. Copy uses the managed terminal's OSC 52
clipboard method; whether the OS clipboard accepts it depends on the terminal.

## Verification and captures

```sh
bun run typecheck
bun run test:demos
bun run demo:capture                   # all three, 1536 × 1024
bun run demo:capture studio 1200 800    # proportional smaller viewport
```

`capture.tsx` mounts the **same components** in the existing internal offscreen
test renderer, waits for image decoding to settle and saves WGPU RGBA readback as
PNG under `captures/` (git-ignored). This verifies the native rendering path, not
physical terminal transport, window appearance or OS clipboard delivery.

See the repository-root `design-qa.md` for the comparison evidence and remaining
limitations. Asset provenance and icon licensing are in [ASSETS.md](ASSETS.md).
