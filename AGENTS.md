# TGE — Terminal Graphics Engine

## Authoritative documents

Vexart's source of truth lives in three master documents under `docs/`. When their
guidance conflicts with anything described below, **the master documents win** and
the content below is treated as legacy TGE reference pending Phase 1 rewrite.

- [`docs/PRD.md`](docs/PRD.md) — product requirements, phased roadmap, decision log.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — target layered package structure and
  native boundary.
- [`docs/API-POLICY.md`](docs/API-POLICY.md) — public vs. internal API rules.

Every change is executed through the SDD workflow under `openspec/` (see
`openspec/README.md`). Legacy pre-PRD documents (`TGE-*`, `MIGRATION-ANALYSIS.md`,
`docs.md`) have been archived to `docs/archive/` and MUST NOT be used as a reference
for new work.

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
| @tge/void       | Design tokens, theming, shadcn-inspired components | ✅ Done   |

## Key Dependencies

- **Clay** (vendor/clay.h) — Layout engine. Single C header, renderer-agnostic, microsecond performance. Called via bun:ffi. Forked with space-between alignment extension.
- **SolidJS** (solid-js/universal) — createRenderer for JSX reconciliation. 10 methods, no VDOM.
- **Zig** (zig/) — Pixel painting shared library. 30+ FFI exports. All ≤8 params (packed buffer ARM64 safe). SDF primitives, blend, composite, gradients, blur, backdrop filters.
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
- `bun --conditions=browser run examples/hello.tsx` — run example
- `bun run showcase` — run comprehensive feature showcase (7 tabs)

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
| Backdrop brightness | `backdropBrightness={150}` | `backdropBrightness={150}` — 0=black, 100=unchanged, 200=2x |
| Backdrop contrast | `backdropContrast={120}` | `backdropContrast={120}` — 0=grey, 100=unchanged, 200=high |
| Backdrop saturate | `backdropSaturate={0}` | `backdropSaturate={0}` — 0=grayscale, 100=unchanged |
| Backdrop grayscale | `backdropGrayscale={100}` | `backdropGrayscale={100}` — 0=unchanged, 100=full grayscale |
| Backdrop invert | `backdropInvert={100}` | `backdropInvert={100}` — 0=unchanged, 100=full invert |
| Backdrop sepia | `backdropSepia={50}` | `backdropSepia={50}` — 0=unchanged, 100=full sepia |
| Backdrop hue-rotate | `backdropHueRotate={180}` | `backdropHueRotate={180}` — 0-360 degrees |
| Element opacity | `opacity={0.5}` | `opacity={0.5}` — 0.0-1.0, multiplies alpha of entire element |
| Per-corner radius | `cornerRadii={{ tl, tr, br, bl }}` | `cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}` |
| Uniform radius | `cornerRadius={n}` | `cornerRadius={16}` |

### Interactive states

Declarative hover/active/focus styles — no manual signal boilerplate needed:

```tsx
<box
  focusable
  backgroundColor={0x1e1e2eff}
  hoverStyle={{ backgroundColor: 0x2a2a3eff }}
  activeStyle={{ backgroundColor: 0x3a3a4eff }}
  focusStyle={{ borderColor: 0x4488ccff, borderWidth: 2 }}
  onPress={() => save()}
/>
```

Props available in `hoverStyle`/`activeStyle`/`focusStyle`: `backgroundColor`, `borderColor`, `borderWidth`, `cornerRadius`, `borderRadius`, `shadow`, `boxShadow`, `glow`, `gradient`, `backdropBlur`, `backdropBrightness`, `backdropContrast`, `backdropSaturate`, `backdropGrayscale`, `backdropInvert`, `backdropSepia`, `backdropHueRotate`, `opacity`.

### Event bubbling

`onPress` events bubble up the parent node chain like DOM click events. If a child node doesn't have `onPress`, the event walks up to the nearest ancestor that does. Each handler receives a `PressEvent`:

```tsx
// Parent handles click even though child has no onPress
<box focusable onPress={() => handleAction()}>
  <Button>Click me</Button>  {/* Button has no onPress — event bubbles to parent */}
</box>

// Child stops propagation — parent never fires
<box onPress={() => closePanel()}>
  <box onPress={(e) => { e?.stopPropagation(); doAction() }}>
    <text>Click me (parent won't fire)</text>
  </box>
</box>
```

### Per-node mouse events

Low-level mouse callbacks dispatched directly to the target node (no bubbling). Each receives a `NodeMouseEvent`:

```tsx
<box
  onMouseDown={(e) => { startDrag(e); setPointerCapture(nodeId) }}
  onMouseMove={(e) => updateDrag(e)}
  onMouseUp={(e) => endDrag(e)}
/>
```

`NodeMouseEvent`: `{ x, y, nodeX, nodeY, width, height }` — `x/y` are absolute pixels, `nodeX/nodeY` are relative to the node's layout origin. `width/height` are the node's layout dimensions (useful for ratio calculations like slider position).

### Interaction props (headless components)

Headless components provide interaction props in their render context. Spread them on the root element for automatic mouse+keyboard support:

| Component | Context Prop | Value | Purpose |
| --------- | ------------ | ----- | ------- |
| Button | `ctx.buttonProps` | `{ focusable, onPress }` | Click + Enter/Space |
| Checkbox | `ctx.toggleProps` | `{ focusable, onPress }` | Click to toggle |
| Switch | `ctx.toggleProps` | `{ focusable, onPress }` | Click to toggle |
| RadioGroup | `ctx.optionProps` | `{ onPress }` | Click to select option |
| Tabs | `ctx.tabProps` | `{ onPress }` | Click to switch tab |
| List | `ctx.itemProps` | `{ onPress }` | Click to select item |
| Table | `ctx.rowProps` | `{ onPress }` | Click to select row |
| VirtualList | N/A (container-level) | Container handles hover/click internally | Mouse hover + click selection |
| Dialog.Overlay | `onClick` prop | wired to `onPress` | Click overlay to close |

```tsx
<Button
  onPress={() => save()}
  renderButton={(ctx) => (
    <box {...ctx.buttonProps} padding={8} cornerRadius={6}>
      <text>Save</text>
    </box>
  )}
/>
```

### Pointer capture

Like `Element.setPointerCapture()` in the DOM. When a node captures the pointer, ALL mouse events route to it regardless of cursor position — essential for drag interactions.

```typescript
import { setPointerCapture, releasePointerCapture } from "@tge/runtime"

setPointerCapture(nodeId)     // Lock — all mouse events go to this node
releasePointerCapture(nodeId) // Unlock — auto-released on button up
```

### Hit-area expansion

Interactive elements have a minimum hit-area of one terminal cell (`cellW × cellH`, typically 7×13px). This is like mobile's 44px minimum touch target — ensures small elements (e.g. 12px slider track) are clickable. Only affects hit-testing, NOT visual rendering.

### Architecture note

```
JSX prop → reconciler.ts setProperty (pre-parse color/sizing/glow ONCE) → loop.ts walkTree reads u32 (ns) → effectsQueue → paintCommand calls Zig FFI via shared packed buffer (μs)
```

```
onPress event flow (high-level, bubbles):
  mouse click → updateInteractiveStates detects release-while-hovered
    → create PressEvent → walk parent chain:
      → each node: set focus if focusable → call onPress(event) if present
      → stop if event.propagationStopped or reached root

onMouse* event flow (low-level, per-node):
  mouse input → feedPointer (fractional cell→pixel, edge queuing)
    → updateInteractiveStates hit-tests all interactive nodes:
      → onMouseOver/onMouseOut on hover enter/leave
      → onMouseDown/onMouseUp on button press/release edges
      → onMouseMove while hovered (or captured)
      → pointer capture overrides hit-test (captured node always receives events)
```

Effects are painted BEFORE the rect (shadow/glow) or INSTEAD of it (gradient). Backdrop blur reads the buffer region behind the element, blurs it in a temp buffer, then composites. All effects use isolated temp buffers to avoid corrupting neighboring pixels.

### Scissor clipping (scroll containers)

All paint primitives respect the active scissor (scroll container bounds):
- Flat rects: `clipToScissor()` clips coordinates before `fillRect`
- Rounded rects / per-corner radius: `paintWithScissorClip()` renders to temp buffer, copies visible portion
- Borders (stroke): `paintWithScissorClip()` same approach
- Text: temp buffer + copy visible pixels with alpha blending
- Backdrop blur/filters: clip region to scissor before applying
- Shadows / glow: `overScissored()` clips composite region

### Interactive nodes auto-RECT

Any node with `onPress`, `focusable`, `hoverStyle`, `activeStyle`, `focusStyle`, or mouse callbacks automatically gets a near-transparent RECT placeholder (`0x00000001`). This ensures the node enters `rectNodes` for hit-testing without requiring explicit `backgroundColor`. Developers don't need to add `backgroundColor` for interactive elements to be clickable.

### Border space reservation

If `focusStyle`, `hoverStyle`, or `activeStyle` define `borderWidth`, the engine reserves that space in Clay with a transparent border when inactive. This prevents layout jitter when interactive styles activate — equivalent to CSS `outline` behavior.

### Click re-layout (instant feedback)

When a click is dispatched (onPress or focus change), the engine re-runs walkTree + endLayout in the same frame. This eliminates the ~33ms visual delay that would otherwise occur because layout was computed before the click callback mutated the tree.

### Scroll container hit-testing

Nodes fully outside their scroll container ancestor viewport are skipped during hit-testing. This prevents off-screen items from receiving false hover/click events at overlapping screen coordinates. The scroll container itself is NOT skipped.

## Layout defaults

- Default `<box>` direction is **column** (TOP_TO_BOTTOM) — terminal-native vertical flow
- Use `direction="row"` explicitly for horizontal layout
- Responsive: terminal resize triggers automatic re-layout via `onResize` → Clay redimension

## TGEProps — Complete reference (55 props)

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

### Interaction
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `focusable` | `boolean` | Auto-register in focus system (like HTML tabindex="0") |
| `onPress` | `(event?: PressEvent) => void` | Fires on mouse click + Enter/Space when focused. Events bubble up parent chain; call `event.stopPropagation()` to stop. |
| `onKeyDown` | `(event: any) => void` | Keyboard events when focused |
| `focusStyle` | partial visual props | Merged on focus |
| `opacity` | `number` | 0.0-1.0, element-level opacity |
| `onMouseDown` | `(event: NodeMouseEvent) => void` | Per-node mouse button pressed |
| `onMouseUp` | `(event: NodeMouseEvent) => void` | Per-node mouse button released |
| `onMouseMove` | `(event: NodeMouseEvent) => void` | Per-node pointer move while hovered (or captured) |
| `onMouseOver` | `(event: NodeMouseEvent) => void` | Pointer entered node bounds |
| `onMouseOut` | `(event: NodeMouseEvent) => void` | Pointer left node bounds |

### Backdrop Filters
| Prop | Type | Notes |
| ---- | ---- | ----- |
| `backdropBrightness` | `number` | 0=black, 100=unchanged, 200=2x bright |
| `backdropContrast` | `number` | 0=grey, 100=unchanged, 200=high contrast |
| `backdropSaturate` | `number` | 0=grayscale, 100=unchanged, 200=hyper |
| `backdropGrayscale` | `number` | 0=unchanged, 100=full grayscale |
| `backdropInvert` | `number` | 0=unchanged, 100=fully inverted |
| `backdropSepia` | `number` | 0=unchanged, 100=full sepia |
| `backdropHueRotate` | `number` | 0-360 degrees |

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

## Zig FFI exports (30+ functions)

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
| `tge_inset_shadow` | Inset shadow (SDF, packed params) |
| `tge_filter_brightness` | Backdrop brightness filter |
| `tge_filter_contrast` | Backdrop contrast filter |
| `tge_filter_saturate` | Backdrop saturation filter |
| `tge_filter_grayscale` | Backdrop grayscale filter |
| `tge_filter_invert` | Backdrop color invert filter |
| `tge_filter_sepia` | Backdrop sepia filter |
| `tge_filter_hue_rotate` | Backdrop hue rotation filter |
| `tge_blend_mode` | CSS blend modes (16 modes) |
| `tge_linear_gradient_multi` | Multi-stop linear gradient |
| `tge_radial_gradient_multi` | Multi-stop radial gradient |
| `tge_conic_gradient` | Conic/angular gradient |
| `tge_gradient_stroke` | Gradient border stroke |

All FFI functions use ≤8 params (packed buffer pattern for ARM64 safety). Shared ArrayBuffer for zero allocations.

## @tge/renderer exports (61 values, 38 types)

### Core
- `createRenderLoop`, `mount`, `createTerminal`

### Reconciler (SolidJS)
- `createComponent`, `createElement`, `createTextNode`, `insertNode`, `insert`, `spread`, `setProp`, `mergeProps`, `effect`, `memo`, `use`, `solidRender`

### Control Flow
- `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`

### Input
- `useKeyboard`, `useMouse`, `useInput`, `onInput`
- `useFocus`, `setFocus`, `focusedId`, `setFocusedId`
- `setPointerCapture`, `releasePointerCapture`
- `useDrag`, `useHover`

### Animation
- `createTransition`, `createSpring`, easing presets

### Context
- `createContext`, `useContext`

### Utilities
- `markDirty`, `createHandle`, `createScrollHandle`, `resetScrollHandles`
- `registerFont`, `getFont`, `clearTextCache`
- `useTerminalDimensions`, `decodePasteBytes`
- `clearImageCache`

### Focus
- `pushFocusScope`

### Data
- `useQuery`, `useMutation`

### Router
- `createRouter`, `createNavigationStack`, `useRouter`

### Selection
- `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal`

### Debug
- `toggleDebug`, `setDebug`, `isDebugEnabled`, `debugFrameStart`, `debugUpdateStats`, `debugState`, `debugStatsLine`

### Plugins
- `createSlotRegistry`, `createSlot`

### Syntax highlighting
- `ExtmarkManager`, `TreeSitterClient`, `getTreeSitterClient`, `addDefaultParsers`
- `SyntaxStyle`, `ONE_DARK`, `KANAGAWA`, `highlightsToTokens`

### Types
- `PressEvent` — `{ stopPropagation: () => void; readonly propagationStopped: boolean }`
- `NodeMouseEvent` — `{ x, y, nodeX, nodeY, width, height }`
- `DragOptions`, `DragProps`, `DragState` — useDrag hook types
- `HoverOptions`, `HoverProps`, `HoverState` — useHover hook types

### Classes
- `RGBA` — `.fromHex()`, `.fromInts()`, `.fromValues()`, `.toU32()`, `.valueOf()`, `.toString()`
- `MouseButton` — `{ LEFT, MIDDLE, RIGHT, RELEASE, SCROLL_UP, SCROLL_DOWN }`

### Constants
- `ATTACH_TO`, `ATTACH_POINT`, `POINTER_CAPTURE`, `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y`

## @tge/components (28 components)

| Component | Props | Purpose |
| --------- | ----- | ------- |
| `Box` | BoxProps | Layout container |
| `Text` | TextProps | Text display |
| `ScrollView` | ScrollViewProps | Scrollable container with visual scrollbar |
| `Button` | ButtonProps | Interactive button (ctx.buttonProps for mouse+keyboard) |
| `ProgressBar` | ProgressBarProps | Progress indicator |
| `Checkbox` | CheckboxProps | Toggle checkbox (ctx.toggleProps for mouse+keyboard) |
| `Tabs` | TabsProps | Tab switcher (ctx.tabProps for click) |
| `List` | ListProps | Scrollable list (ctx.itemProps for click) |
| `Input` | InputProps | Single-line text input |
| `Textarea` | TextareaProps | Multi-line editor (2D cursor, syntax, keybindings) |
| `RichText` | RichTextProps | Multi-span text |
| `Span` | SpanProps | Inline text span |
| `Portal` | PortalProps | Render at root level |
| `Code` | CodeProps | Syntax-highlighted code block |
| `Markdown` | MarkdownProps | Markdown renderer (inline styling) |
| `WrapRow` | WrapRowProps | Flex-wrap workaround |
| `Diff` | DiffProps | Unified diff viewer |
| `Dialog` | DialogProps | Modal with focus trap + Escape |
| `Select` | SelectProps | Dropdown select with keyboard nav + click selection |
| `Switch` | SwitchProps | Toggle switch (ctx.toggleProps for mouse+keyboard) |
| `RadioGroup` | RadioGroupProps | Radio option group (ctx.optionProps for click) |
| `Table` | TableProps | Data table with row selection (ctx.rowProps for click) |
| `Toast` | createToaster | Imperative toast notifications |
| `Router` | RouterProps | Flat + stack navigation |
| `Tooltip` | TooltipProps | Delayed tooltip on hover |
| `Popover` | PopoverProps | Controlled popover panel |
| `Combobox` | ComboboxProps | Autocomplete with filtering + click selection |
| `Slider` | SliderProps | Numeric range input with click-to-position and drag |
| `VirtualList` | VirtualListProps | Virtualized list (fixed height) with keyboard nav + mouse hover/click |

Also: `createForm` factory for form validation.

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
| `VoidDialog` | — | — |
| `VoidSelect` | — | — |
| `VoidSwitch` | — | — |

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
