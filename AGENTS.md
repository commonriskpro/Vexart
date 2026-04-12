# TGE — Terminal Graphics Engine

## What is TGE

Pixel-native terminal rendering engine. Developers write JSX (SolidJS), TGE renders browser-quality UI in the terminal with anti-aliased corners, shadows (single + multi), gradients (linear + radial), glow effects, backdrop blur (glassmorphism), and per-corner radius.

## Architecture

```
JSX (SolidJS createRenderer)
  → Clay layout (C via FFI, microsecond perf)
    → Pixel paint (Zig via FFI, SDF primitives)
      → Output backend (Kitty/placeholder/halfblock)
        → Terminal
```

## Modules

| Module          | Purpose                                           | Status    |
| --------------- | ------------------------------------------------- | --------- |
| @tge/terminal   | Terminal detection, caps, lifecycle, raw I/O      | ✅ Done   |
| @tge/input      | Keyboard/mouse parsing, focus                     | ✅ Done   |
| @tge/pixel      | Pixel buffer, SDF paint primitives                | ✅ Done   |
| @tge/output     | Kitty, placeholder, sixel, halfblock backends     | ✅ Done   |
| @tge/renderer   | SolidJS reconciler + Clay layout integration      | ✅ Done   |
| @tge/components | Built-in JSX components (Box, Text, Scroll, etc.) | ✅ Done   |
| @tge/tokens     | Design tokens, theming                            | ✅ Done   |
| @tge/void       | shadcn-inspired design system (Button, Card, etc) | ✅ Done   |

## Key Dependencies

- **Clay** (vendor/clay.h) — Layout engine. Single C header, renderer-agnostic, microsecond performance. Called via bun:ffi. Forked with space-between alignment extension.
- **SolidJS** (solid-js/universal) — createRenderer for JSX reconciliation. 10 methods, no VDOM.
- **Zig** (zig/) — Pixel painting shared library. 17 FFI exports. SDF primitives, blend, composite, gradients, blur.
- **Bun** — Runtime. FFI for native libs, TypeScript execution.

## Build Order

1. **Phase 1**: terminal + input + pixel + output → "paint a rounded rect in the terminal"
2. **Phase 2**: Clay FFI + SolidJS renderer → "write JSX and it renders"
3. **Phase 3**: components + tokens → "reusable Box, Text, Scroll"
4. **Phase 4**: input integration, scroll, focus → "interactive UI"

## Style Guide

### General

- Prefer single-word variable names
- Use `const` over `let`
- Early returns over `else`
- Avoid `try/catch` where possible
- Avoid `any` type
- Prefer functional array methods over for loops
- Use Bun APIs when possible

### Zig

- snake_case for all names
- Minimize allocations — use arena/stack where possible
- All FFI exports prefixed with `tge_`
- Test every public function

### TypeScript

- Prefer type inference over explicit annotations
- Avoid destructuring — use dot notation
- Avoid mocks in tests — test real implementations

## Commands

- `bun install` — install deps
- `cd zig && zig build test --summary all` — run Zig tests
- `cd zig && zig build -Doptimize=ReleaseFast` — build Zig shared lib
- `bun typecheck` — TypeScript type check
- `bun run examples/hello.tsx` — run example

## Visual Effects (Zig → JSX)

All visual effects are implemented in Zig SDF primitives and exposed as JSX props.

| Effect | Prop | Example |
| ------ | ---- | ------- |
| Drop shadow | `shadow={{ x, y, blur, color }}` | `shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}` |
| Multi-shadow | `shadow={[...]}` | Array of shadow objects, painted in order |
| Outer glow | `glow={{ radius, color, intensity? }}` | `glow={{ radius: 20, color: 0x56d4c8ff, intensity: 60 }}` |
| Linear gradient | `gradient={{ type: "linear", from, to, angle? }}` | `gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 90 }}` |
| Radial gradient | `gradient={{ type: "radial", from, to }}` | `gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }}` |
| Backdrop blur | `backdropBlur={radius}` | `backdropBlur={12}` — blurs content behind element |
| Per-corner radius | `cornerRadii={{ tl, tr, br, bl }}` | `cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}` |
| Uniform radius | `cornerRadius={n}` | `cornerRadius={16}` |

### Interactive states

Declarative hover/active styles — no manual signal boilerplate needed:

```tsx
<box
  backgroundColor={0x1e1e2eff}
  hoverStyle={{ backgroundColor: 0x2a2a3eff }}
  activeStyle={{ backgroundColor: 0x3a3a4eff }}
/>
```

Props available in `hoverStyle`/`activeStyle`: `backgroundColor`, `borderColor`, `borderWidth`, `cornerRadius`, `shadow`, `glow`, `gradient`, `backdropBlur`.

### Architecture note

```
JSX prop → loop.ts reads prop (ns) → effectsQueue → paintCommand calls Zig FFI (μs)
```

Effects are painted BEFORE the rect (shadow/glow) or INSTEAD of it (gradient). Backdrop blur reads the buffer region behind the element, blurs it in a temp buffer, then composites. All effects use isolated temp buffers to avoid corrupting neighboring pixels.

## Layout defaults

- Default `<box>` direction is **column** (TOP_TO_BOTTOM) — terminal-native vertical flow
- Use `direction="row"` explicitly for horizontal layout
- Responsive: terminal resize triggers automatic re-layout via `onResize` → Clay redimension

## TGEProps — Complete reference (50 props)

### Layout
| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `direction` | `"row" \| "column"` | `"column"` | Flex direction |
| `flexDirection` | `"row" \| "column"` | — | Alias for direction |
| `padding` | `number` | — | Uniform padding |
| `paddingX` / `paddingY` | `number` | — | Axis padding |
| `paddingLeft/Right/Top/Bottom` | `number` | — | Per-side padding |
| `gap` | `number` | — | Child gap |
| `alignX` | `"left" \| "right" \| "center" \| "space-between"` | `"left"` | Horizontal alignment |
| `alignY` | `"top" \| "bottom" \| "center" \| "space-between"` | `"top"` | Vertical alignment |
| `justifyContent` | same as alignX + `"flex-start" \| "flex-end"` | — | Alias for alignX |
| `alignItems` | same as alignY + `"flex-start" \| "flex-end"` | — | Alias for alignY |

### Sizing
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `width` / `height` | `number \| string` | number=fixed, `"grow"`, `"fit"`, `"100%"` |
| `flexGrow` | `number` | Makes width=grow (compat) |
| `flexShrink` | `number` | Accepted for compat |
| `minWidth` / `maxWidth` | `number` | Constraints |
| `minHeight` / `maxHeight` | `number` | Constraints |

### Visual
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `backgroundColor` | `string \| number` | `"#ff0000"` or `0xff0000ff` |
| `cornerRadius` | `number` | Uniform radius |
| `cornerRadii` | `{ tl, tr, br, bl }` | Per-corner radius |
| `borderColor` | `string \| number` | — |
| `borderWidth` | `number` | Uniform border |
| `borderLeft/Right/Top/Bottom` | `number` | Per-side border |
| `borderBetweenChildren` | `number` | Between children |

### Effects
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `shadow` | `object \| array` | Drop shadow(s) |
| `glow` | `{ radius, color, intensity? }` | Outer glow |
| `gradient` | linear or radial config | Gradient fill |
| `backdropBlur` | `number` | Glassmorphism |
| `hoverStyle` | partial visual props | Merged on hover |
| `activeStyle` | partial visual props | Merged on active |

### Compositing & Scroll
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `layer` | `boolean` | Own compositing layer |
| `scrollX` / `scrollY` | `boolean` | Scroll clipping |
| `scrollSpeed` | `number` | Scroll tick speed |
| `scrollId` | `string` | Stable ID for programmatic scroll |

### Floating
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `floating` | `"parent" \| "root" \| { attachTo }` | Positioning mode |
| `floatOffset` | `{ x, y }` | Offset from attach |
| `zIndex` | `number` | Z-order |
| `floatAttach` | `{ element?, parent? }` | Attach points (0-8 grid) |
| `pointerPassthrough` | `boolean` | Pass-through clicks |

### Text
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `color` | `string \| number` | Text color |
| `fontSize` | `number` | Font size (px) |
| `fontId` | `number` | Runtime font atlas ID |
| `lineHeight` | `number` | Line height |
| `wordBreak` | `"normal" \| "keep-all"` | — |
| `whiteSpace` | `"normal" \| "pre-wrap"` | — |
| `fontFamily` | `string` | — |
| `fontWeight` | `number` | 400/500/600/700 |
| `fontStyle` | `"normal" \| "italic"` | — |

## Zig FFI exports (17 functions)

| Function | Purpose |
| -------- | ------- |
| `tge_fill_rect` | Solid rectangle fill |
| `tge_rounded_rect` | Rounded rectangle (SDF anti-aliased) |
| `tge_stroke_rect` | Rounded rectangle stroke |
| `tge_rounded_rect_corners` | Per-corner radius fill |
| `tge_stroke_rect_corners` | Per-corner radius stroke |
| `tge_filled_circle` | Ellipse fill |
| `tge_stroked_circle` | Ellipse stroke |
| `tge_line` | Anti-aliased line segment |
| `tge_bezier` | Quadratic bezier curve |
| `tge_blur` | Box blur (3-pass ≈ Gaussian) |
| `tge_halo` | Radial glow with plateau+falloff |
| `tge_linear_gradient` | Linear gradient fill |
| `tge_radial_gradient` | Radial gradient fill |
| `tge_draw_text` | Text with built-in font atlas |
| `tge_measure_text` | Measure text width |
| `tge_load_font_atlas` | Load runtime font (id 1-15) |
| `tge_draw_text_font` | Text with specific font atlas |

## @tge/renderer exports (54 values, 31 types)

### Core
- `createRenderLoop`, `mount`, `createTerminal`

### Reconciler (SolidJS)
- `createComponent`, `createElement`, `createTextNode`, `insertNode`, `insert`, `spread`, `setProp`, `mergeProps`, `effect`, `memo`, `use`, `solidRender`

### Control Flow
- `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`

### Input
- `useKeyboard`, `useMouse`, `useInput`, `onInput`
- `useFocus`, `setFocus`, `focusedId`, `setFocusedId`

### Utilities
- `markDirty`, `createHandle`, `createScrollHandle`, `resetScrollHandles`
- `registerFont`, `getFont`, `clearTextCache`
- `useTerminalDimensions`, `decodePasteBytes`

### Selection
- `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal`

### Debug
- `toggleDebug`, `setDebug`, `isDebugEnabled`, `debugFrameStart`, `debugUpdateStats`, `debugState`, `debugStatsLine`

### Plugins
- `createSlotRegistry`, `createSlot`

### Syntax highlighting
- `ExtmarkManager`, `TreeSitterClient`, `getTreeSitterClient`, `addDefaultParsers`
- `SyntaxStyle`, `ONE_DARK`, `KANAGAWA`, `highlightsToTokens`

### Classes
- `RGBA` — `.fromHex()`, `.fromInts()`, `.fromValues()`, `.toU32()`, `.valueOf()`, `.toString()`
- `MouseButton` — `{ LEFT, MIDDLE, RIGHT, RELEASE, SCROLL_UP, SCROLL_DOWN }`

### Constants
- `ATTACH_TO`, `ATTACH_POINT`, `POINTER_CAPTURE`, `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y`

## @tge/components (17 components)

| Component | Props | Purpose |
| --------- | ----- | ------- |
| `Box` | BoxProps | Layout container |
| `Text` | TextProps | Text display |
| `ScrollView` | ScrollViewProps | Scrollable container with visual scrollbar |
| `Button` | ButtonProps | Interactive button |
| `ProgressBar` | ProgressBarProps | Progress indicator |
| `Checkbox` | CheckboxProps | Toggle checkbox |
| `Tabs` | TabsProps | Tab switcher |
| `List` | ListProps | Scrollable list |
| `Input` | InputProps | Single-line text input |
| `Textarea` | TextareaProps | Multi-line editor (2D cursor, syntax, keybindings) |
| `RichText` | RichTextProps | Multi-span text |
| `Span` | SpanProps | Inline text span |
| `Portal` | PortalProps | Render at root level |
| `Code` | CodeProps | Syntax-highlighted code block |
| `Markdown` | MarkdownProps | Markdown renderer (inline styling) |
| `WrapRow` | WrapRowProps | Flex-wrap workaround |
| `Diff` | DiffProps | Unified diff viewer |

## @tge/void — Design system (shadcn-compatible)

Import: `import { Button, Card, Badge, colors, space } from "tge/void"`

### Tokens

```typescript
colors.background     // 0x141414ff — app background
colors.foreground     // 0xfafafaff — default text
colors.card           // 0x262626ff — elevated surfaces
colors.primary        // 0xe5e5e5ff — brand/actions
colors.secondary      // 0x333333ff — secondary actions
colors.muted          // 0x333333ff — subtle surfaces
colors.mutedForeground // 0xa3a3a3ff — low-emphasis text
colors.accent         // 0x333333ff — hover/focus
colors.destructive    // 0xdc2626ff — errors
colors.border         // 0xffffff1a — borders (white 10%)
colors.input          // 0xffffff26 — input borders (white 15%)
colors.ring           // 0x737373ff — focus rings

radius.sm/md/lg/xl/xxl/full   // 6/8/10/14/18/9999
space[1]..space[10]            // 4..40px
font.xs/sm/base/lg/xl/2xl/3xl/4xl  // 10..36px
weight.normal/medium/semibold/bold  // 400..700
shadows.sm/md/lg/xl           // preset shadow configs
```

### Components

| Component | Variants | Sizes |
| --------- | -------- | ----- |
| `Button` | default, secondary, outline, ghost, destructive | xs, sm, default, lg |
| `Card` | default, sm | — |
| `CardHeader` | — | — |
| `CardTitle` | — | — |
| `CardDescription` | — | — |
| `CardContent` | — | — |
| `CardFooter` | — | — |
| `Badge` | default, secondary, outline, destructive | — |
| `Separator` | horizontal, vertical | — |
| `Avatar` | — | sm, default, lg |
| `Skeleton` | — | — |

### Typography

`H1`, `H2`, `H3`, `H4`, `P`, `Lead`, `Large`, `Small`, `Muted`

## npm package structure (dist/)

```
tge-0.0.1.tgz (440KB)
├── tge.js              — engine bundle (64KB minified)
├── tge.d.ts            — engine types
├── components.js       — UI components bundle (55KB)
├── components.d.ts     — component types
├── void.js             — design system bundle (11KB)
├── void.d.ts           — design system types
├── jsx-runtime.d.ts    — JSX intrinsic elements (50 props)
├── solid-plugin.ts     — Babel JSX transform (moduleName: "tge")
├── vendor/
│   ├── tge/arm64-darwin/libtge.dylib   — Zig shared lib (85KB)
│   └── clay/arm64-darwin/libclay.dylib — Clay shared lib (188KB)
├── tree-sitter/
│   ├── parser.worker.ts
│   └── assets/         — .wasm grammars + .scm highlights
└── package.json
```

### Exports map

```json
{
  ".":            { "types": "./tge.d.ts",        "default": "./tge.js" },
  "./components": { "types": "./components.d.ts", "default": "./components.js" },
  "./void":       { "types": "./void.d.ts",       "default": "./void.js" },
  "./jsx-runtime": { "types": "./jsx-runtime.d.ts" },
  "./solid-plugin": "./solid-plugin.ts"
}
```

## Reference

- Clay docs: https://github.com/nicbarker/clay
- SolidJS universal: https://github.com/solidjs/solid/tree/main/packages/solid/universal
- Kitty graphics protocol: https://sw.kovidgoyal.net/kitty/graphics-protocol/
- LightCode TGE (origin): /Users/dev/lightcodev2-identity/packages/opencode/src/tge/
