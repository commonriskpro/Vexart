# Vexart Examples

All examples require [Bun](https://bun.sh/) and a [Kitty-compatible terminal](https://sw.kovidgoyal.net/kitty/graphics-protocol/) (Kitty, Ghostty, WezTerm).

Build the native library before running any example:
```bash
cargo build --release
```

---

## Running examples

Each example has a convenience npm script. All scripts set `--conditions=browser` for SolidJS.

```bash
bun run <script>
# or directly:
bun --conditions=browser run examples/<file>.tsx
```

Press `q` or `Ctrl+C` to exit any example.

---

## Example index

| File | Script | Description |
|------|--------|-------------|
| [`hello.tsx`](hello.tsx) | `bun run example` | Hello World — first JSX render with Box and Text |
| [`interactive.tsx`](interactive.tsx) | `bun run demo4` | Interactivity — focus, signals, keyboard events, hover/active styles |
| [`layers.tsx`](layers.tsx) | `bun run demo5` | Layer compositing — per-component Kitty image layers |
| [`dashboard.tsx`](dashboard.tsx) | `bun run demo6` | Multi-widget dashboard — 5 layers, real-world app layout |
| [`scroll.tsx`](scroll.tsx) | `bun run demo7` | Scroll containers — mouse wheel, programmatic, nested scroll |
| [`components.tsx`](components.tsx) | `bun run demo8` | Component showcase — Button, Input, Select, Dialog, Tabs, List, Table, Combobox, Slider |
| [`effects.tsx`](effects.tsx) | `bun run demo9` | Visual effects — drop shadows, glow, multi-shadow |
| [`input.tsx`](input.tsx) | `bun run demo10` | Text input form — Input, Checkbox, Slider, form validation |
| [`text-wrap.tsx`](text-wrap.tsx) | `bun run demo11` | Text wrapping — word-break, white-space, long text scenarios |
| [`scroll-programmatic.tsx`](scroll-programmatic.tsx) | `bun run demo13` | Programmatic scroll — `createScrollHandle`, scroll-to-item |
| [`textarea.tsx`](textarea.tsx) | `bun run demo14` | Multi-line editor — Textarea with 2D cursor, keybindings |
| [`syntax.tsx`](syntax.tsx) | `bun run demo15` | Syntax highlighting — Code component, Tree-sitter grammars, One Dark theme |
| [`markdown.tsx`](markdown.tsx) | `bun run demo16` | Markdown rendering — Markdown component with inline styling |
| [`showcase.tsx`](showcase.tsx) | `bun run showcase` | Comprehensive 7-tab showcase — every engine feature in one app |

### GPU / visual validation examples

These examples test specific rendering paths and are useful for debugging.

| File | Script | Description |
|------|--------|-------------|
| [`backdrop-corner-radii-gpu.tsx`](backdrop-corner-radii-gpu.tsx) | — | Backdrop blur with per-corner radius |
| [`backdrop-corner-radii-test.tsx`](backdrop-corner-radii-test.tsx) | — | Backdrop blur + corner radius regression test |
| [`backdrop-overlap-test.tsx`](backdrop-overlap-test.tsx) | — | Overlapping backdrop blur elements |
| [`backdrop-transform-gpu.tsx`](backdrop-transform-gpu.tsx) | — | Backdrop blur with GPU transform |
| [`backdrop-transform-test.tsx`](backdrop-transform-test.tsx) | — | Backdrop blur transform regression test |
| [`showcase-gpu-visual.tsx`](showcase-gpu-visual.tsx) | — | GPU rendering full showcase validation |
| [`void-showcase-gpu-visual.tsx`](void-showcase-gpu-visual.tsx) | — | `@vexart/styled` (void) component showcase on GPU backend |
| [`void-showcase.tsx`](void-showcase.tsx) | — | `@vexart/styled` design system components |
| [`transform-test.tsx`](transform-test.tsx) | — | Transform hierarchy — rotation, scale, translation |
| [`transform-hierarchy-test.tsx`](transform-hierarchy-test.tsx) | — | Nested transform hierarchies |
| [`layer-scroll.tsx`](layer-scroll.tsx) | — | Layer compositing with scroll containers |
| [`zindex-test.ts`](zindex-test.ts) | `bun run ztest` | Z-index ordering validation |

---

## Showcase tabs

`showcase.tsx` (`bun run showcase`) is the most comprehensive demo — use it to explore all engine features:

| Tab | Key | Content |
|-----|-----|---------|
| 1 — Visual Effects | `1` | Shadows, glow, gradients (linear/radial), per-corner radius, multi-shadow |
| 2 — Backdrop Filters | `2` | Blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate, glassmorphism |
| 3 — Interactive | `3` | focusStyle, onPress, hover/active states, Dialog focus trap |
| 4 — Forms | `4` | `createForm` validation, Combobox, Slider |
| 5 — Data + Virtual | `5` | `useQuery` mock data fetching, VirtualList with 1000 items |
| 6 — Styled | `6` | Button variants, Card, Badge, Avatar, dark/light theme switch |
| 7 — Event Bubbling | `7` | `onPress` bubbling, `stopPropagation`, component boundaries |

Navigate with `←` / `→` arrow keys or number keys `1`–`7`.

---

## Performance benchmarking

```bash
bun run perf:baseline   # measure frame time and save baseline
bun run perf:check      # compare current frame time vs saved baseline
```

Baseline is saved to `scripts/perf-baseline.json`.

---

## Visual regression tests

```bash
bun run test:visual          # compare against golden PNG references
bun run test:visual:update   # regenerate golden PNG references
```

Scene definitions live in `scripts/visual-test/scenes/`.
Reference PNGs live in `scripts/visual-test/references/`.
