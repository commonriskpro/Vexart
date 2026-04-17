# TGE vs Web Moderno — Gap Analysis & Roadmap

> Architectural analysis: what TGE needs to become a general-purpose terminal application engine, not just a LightCode renderer.

## Current Status: ALL PHASES COMPLETE ✅

| Phase | Name | Status | Impact |
|-------|------|--------|--------|
| Phase 0 | Foundation | ✅ COMPLETE | Transmission upgrade, Zig primitives, DX polish |
| Phase 1 | Habitable | ✅ COMPLETE | Animations, ThemeProvider, Dialog |
| Phase 2 | Productive | ✅ COMPLETE | 15 headless components, `<img>`, Router, tokens refactor |
| Phase 3 | Competitive | ✅ COMPLETE | Form validation, Combobox, Slider, data hooks, VirtualList, Tooltip/Popover |
| Backlog | Phase 0/1 cleanup | ✅ COMPLETE | FFI packed buffer, backdrop filters, opacity, focusStyle, onPress, focus trap |
| Backlog | Mouse interaction system | ✅ COMPLETE | Per-node mouse events, pointer capture, hit-area expansion, Slider/Select/Combobox mouse |

---

## What We Have (Complete Foundation)

| Category | Status | Quality |
|----------|--------|---------|
| Rendering pipeline (SDF, AA, compositing) | ✅ Done | Excellent — browser-quality |
| Layout engine (Clay FFI, flexbox, floating) | ✅ Done | Very good |
| Visual effects (shadow, gradient, blur, glow) | ✅ Done | Complete |
| Backdrop filters (brightness/contrast/saturate/grayscale/invert/sepia/hue-rotate) | ✅ Done | Complete — CSS spec order |
| Element opacity (withOpacity composite) | ✅ Done | Complete |
| Input (keyboard, mouse, paste, focus) | ✅ Done | Complete |
| Per-node mouse events (onMouseDown/Up/Move/Over/Out) | ✅ Done | Complete — NodeMouseEvent, no bubbling |
| Pointer capture (setPointerCapture/releasePointerCapture) | ✅ Done | Complete — like DOM Element.setPointerCapture() |
| Hit-area expansion (min one terminal cell) | ✅ Done | Complete — hit-testing only, no visual change |
| Text editing (Input, Textarea, syntax) | ✅ Done | Advanced |
| Layer compositing (dirty-flag, z-index) | ✅ Done | Fixed |
| Design system (@tge/void, themeColors reactive) | ✅ Done | Hot-swapable themes |
| Content rendering (Markdown, Code, Diff) | ✅ Done | Good |
| Declarative interaction (hover/active/focus styles) | ✅ Done | Complete — focusStyle wired |
| Unified onPress (mouse click + Enter/Space) | ✅ Done | Complete |
| Focusable `<box>` (like HTML tabindex) | ✅ Done | Complete — auto-registers in focus ring |
| Focus trap (Dialog scope stack) | ✅ Done | Complete — pushFocusScope/pop |
| Animations (transition, spring, easing, adaptive FPS) | ✅ Done | Complete |
| Router (flat + stack) | ✅ Done | Complete |
| Form validation (createForm) | ✅ Done | Sync + async validators |
| Data fetching (useQuery, useMutation) | ✅ Done | Complete — retry, optimistic, rollback |
| List virtualization (VirtualList) | ✅ Done | Fixed height, O(1) scroll |
| Interaction props (headless components) | ✅ Done | buttonProps, toggleProps, tabProps, itemProps, rowProps, optionProps |
| FFI ARM64 safety (all ≤8 params) | ✅ Done | Shared ArrayBuffer, zero allocs |

---

## Component Inventory

### Intrinsics (engine-level, in walkTree hot path)

| Element | Purpose |
|---------|---------|
| `<box>` | Layout container — div equivalent |
| `<text>` | Text display — span/p equivalent |
| `<img>` | Image display — decode via sharp, cache, scaleImage |

### @tge/components — Truly Headless (21 components)

All components are BEHAVIOR-ONLY — zero visual styling. Render props for interactive, theme props for content.

| Component | Pattern | Added |
|-----------|---------|-------|
| `Box` | BoxProps | Phase 0 |
| `Text` | TextProps | Phase 0 |
| `ScrollView` | ScrollViewProps | Phase 0 |
| `Button` | renderButton(ButtonRenderContext) | Phase 0 |
| `Checkbox` | renderCheckbox(CheckboxRenderContext) | Phase 0 |
| `Tabs` | renderTab(TabRenderContext) | Phase 0 |
| `List` | renderItem(ListItemContext) | Phase 0 |
| `Input` | renderInput(InputRenderContext) | Phase 0 |
| `Textarea` | theme: TextareaTheme | Phase 0 |
| `ProgressBar` | renderBar(ProgressBarRenderContext) | Phase 0 |
| `RichText` / `Span` | SpanProps | Phase 0 |
| `Portal` | PortalProps | Phase 0 |
| `Code` | theme: CodeTheme | Phase 0 |
| `Markdown` | theme: MarkdownTheme | Phase 0 |
| `Diff` | theme: DiffTheme | Phase 0 |
| `Dialog` | DialogProps, focus trap + Escape | Phase 1 + Backlog |
| `Select` | renderTrigger/renderOption/renderContent | Phase 2 |
| `Switch` | renderSwitch(SwitchRenderContext) | Phase 2 |
| `RadioGroup` | renderOption(RadioOptionContext) | Phase 2 |
| `Table` | renderCell(TableCellContext) | Phase 2 |
| `Toast` | createToaster({ renderToast }) | Phase 2 |
| `Router` / `Route` / `NavigationStack` | RouterProps | Phase 2 |
| `WrapRow` | WrapRowProps | Phase 0 |
| `Tooltip` | renderTooltip(content) | Phase 3 |
| `Popover` | renderTrigger/renderContent | Phase 3 |
| `Combobox` | renderInput/renderOption/renderContent | Phase 3 |
| `Slider` | renderSlider(SliderRenderContext) | Phase 3 |
| `VirtualList` | renderItem(item, index, ctx) | Phase 3 |

### @tge/components — Factories/Hooks

| Factory | Purpose | Added |
|---------|---------|-------|
| `createForm` | Reactive form validation (sync + async, touched/dirty/submitting) | Phase 3 |
| `createToaster` | Imperative toast system | Phase 2 |

### @tge/renderer — Hooks

| Hook | Purpose | Added |
|------|---------|-------|
| `useQuery` | Data fetching (loading/error/data, refetch, retry, interval) | Phase 3 |
| `useMutation` | Data mutation (optimistic + rollback) | Phase 3 |
| `useFocus` | Focus management (reactive focused signal) | Phase 0 |
| `useDrag` | Drag interaction (pointer capture + isDragging) | Backlog |
| `useHover` | Hover detection (enter/leave with delays) | Backlog |
| `useKeyboard` / `useMouse` / `useInput` | Input handling | Phase 0 |
| `createTransition` / `createSpring` | Animations | Phase 1 |
| `useTerminalDimensions` | Reactive terminal size | Phase 0 |

### @tge/void — Styled Design System (shadcn-compatible, 13 components)

| Component | Variants | Sizes |
|-----------|----------|-------|
| `Button` | default, secondary, outline, ghost, destructive | xs, sm, default, lg |
| `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` | default, sm | — |
| `Badge` | default, secondary, outline, destructive | — |
| `Separator` | horizontal, vertical | — |
| `Avatar` | — | sm, default, lg |
| `Skeleton` | — | — |
| `VoidDialog` / `VoidDialog.Title` / `VoidDialog.Description` / `VoidDialog.Footer` | — | — |
| `VoidSelect` | — | — |
| `VoidSwitch` | — | — |
| Typography: `H1` `H2` `H3` `H4` `P` `Lead` `Large` `Small` `Muted` | — | — |

---

## API Design Decisions (11 — All RESOLVED)

These decisions were made to minimize friction for web developers (HTML + CSS + React + Tailwind)
while maintaining TGE's performance characteristics. They are FINAL — all implementation
should follow these rules.

### Decision 1: CSS-Familiar Naming with Typed Values (Hybrid)

**Rule:** Use CSS property names as PRIMARY names. Keep TGE-specific names as aliases.

| CSS name (PRIMARY) | TGE alias (kept for compat) | Notes |
|--------------------|-----------------------------|-------|
| `borderRadius` | `cornerRadius` | Same behavior |
| `boxShadow` | `shadow` | Object/array, not CSS string |
| `flexDirection` | `direction` | Same behavior |
| `justifyContent` | `alignX` | Same behavior |
| `alignItems` | `alignY` | Same behavior |

**Why Hybrid, not full CSS syntax:**
- CSS strings (`"0 4px 12px rgba(0,0,0,0.3)"`) require runtime parsing, are error-prone, and have no type safety
- CSS implies features Clay doesn't support (grid, calc(), position sticky) — creates false expectations
- Typed values (numbers, objects) give TypeScript autocomplete and compile-time checking
- CSS names give instant recognition — a web dev reads `borderRadius={12}` and knows exactly what it is

**What we DON'T adopt from CSS:**
- No `display` property (everything is flex, no block/inline/grid)
- No string shorthand parsing (`padding: "16px 24px"` → use `padding={[16, 24]}` instead)
- No `rem`/`em`/`vh`/`vw` units (only px numbers + scale helpers like `space[4]`)

### Decision 2: Colors Accept Strings, Engine Works in u32

**Rule:** All color props accept `string | number`. Tokens export strings. Engine internally uses u32 RGBA.

```tsx
// ALL of these work with identical performance:
backgroundColor="#1a1a2e"          // CSS hex string — familiar to web devs
backgroundColor="#1a1a2eff"        // Hex + alpha
backgroundColor={0x1a1a2eff}       // u32 RGBA — direct, zero parse
backgroundColor={colors.card}      // Token — returns string "#171717"
```

**Performance guarantee:** Colors are parsed ONCE in `setProperty()` (when SolidJS sets the prop),
NOT per frame in `walkTree()`. This means string colors cost ~100ns one time, then u32 for all
subsequent frames. Zero performance difference in practice.

### Decision 3: Direct Props Primary + `style` Prop for Merging

**Rule:** Props are applied directly on JSX elements (React Native style). An optional `style` prop
merges with direct props (direct props win on conflict).

```tsx
// Direct props — primary API, best TypeScript DX:
<box backgroundColor="#1a1a2e" borderRadius={12} padding={8} />

// Style object — for reusable style definitions:
const glass = { backdropBlur: 12, backgroundColor: "#ffffff20", borderRadius: 16 }
<box style={glass} padding={24} />   // padding=24 is direct, rest from style
```

### Decision 4: Numbers Only + Scale Helpers (No CSS Units)

**Rule:** All numeric props are in pixels. No string units (`px`, `rem`, `em`, `vh`).
Use token scale helpers for semantic spacing.

```tsx
padding={16}              // always pixels
padding={space[4]}        // semantic: space[4] = 16 — typed, autocompletable
width="100%"              // string ONLY for sizing mode: "100%", "grow", "fit"
padding={[16, 24]}        // shorthand: [Y, X] — like CSS shorthand but typed
```

### Decision 5: `<box>` + `<text>` + `<img>` Are the Only Intrinsics

**Rule:** Three JSX intrinsic elements. Everything else is components.

| Web intrinsic | TGE equivalent | Package |
|--------------|----------------|---------|
| `<div>` | `<box>` | intrinsic |
| `<span>`, `<p>` | `<text>` | intrinsic |
| `<img>` | `<img>` | intrinsic |
| `<button>` | `<Button>` | `tge/components` or `tge/void` |
| `<input>` | `<Input>` | `tge/components` |
| `<textarea>` | `<Textarea>` | `tge/components` |
| `<select>` | `<Select>` | `tge/components` |
| `<table>` | `<Table>` | `tge/components` |
| `<dialog>` | `<Dialog>` | `tge/components` |

### Decision 6: Unified `onPress` + Per-Node Mouse Events

**Rule:** A single `onPress` prop handles both mouse click and keyboard activation (Enter/Space).
Per-node mouse events (`onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`) provide low-level mouse interaction. Each receives a `NodeMouseEvent` with `{ x, y, nodeX, nodeY, width, height }`.

```tsx
// Simple — one prop, works everywhere:
<box focusable onPress={() => save()}>
  <text>Save</text>
</box>

// Low-level — per-node mouse events for drag/hover:
<box
  onMouseDown={(e) => startDrag(e)}
  onMouseMove={(e) => updateDrag(e)}
  onMouseUp={(e) => endDrag(e)}
/>
```

**Implementation:** Mouse click detected via active→release-while-hovered pattern. Keyboard Enter/Space dispatched via focus system when element is focused. `onPress` events bubble up the parent chain. `onMouse*` events do NOT bubble — they dispatch directly to the target node.

**Pointer capture:** `setPointerCapture(nodeId)` locks all mouse events to a specific node (like DOM `Element.setPointerCapture()`). Essential for drag — the captured node receives `onMouseMove`/`onMouseUp` even when the pointer leaves its bounds. Auto-released on button up.

**Hit-area expansion:** Interactive elements have a minimum hit-area of one terminal cell (`cellW x cellH`). This ensures small elements like slider tracks are clickable. Only affects hit-testing, NOT visual rendering.

### Decision 7: `focusStyle` Completes the Interaction Trio

**Rule:** `focusStyle` works exactly like `hoverStyle` and `activeStyle` — a partial set of
visual props merged over base props when the element has focus.

```tsx
<box
  focusable
  backgroundColor="#1a1a2e"
  hoverStyle={{ backgroundColor: "#2a2a3e" }}
  activeStyle={{ backgroundColor: "#3a3a4e" }}
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
  onPress={() => save()}
/>
```

**Implementation:** `<box focusable>` auto-registers in the focus system (like HTML `tabindex="0"`). The reconciler calls `registerNodeFocusable()`. The render loop bridges `focusedId()` → `node._focused`. `resolveProps()` merges focusStyle when `_focused` is true.

### Decision 8: Adaptive Framerate with User Control

**Rule:** Render loop runs at adaptive framerate. 30fps idle, 60fps during animations.

```tsx
mount(() => <App />, terminal)                    // Default: adaptive 30-60fps
mount(() => <App />, terminal, { maxFps: 30 })    // Cap to 30fps (SSH)
mount(() => <App />, terminal, { maxFps: 60 })    // Full 60fps always
```

### Decision 9: Theme Tokens as Reactive Getters

**Rule:** Theme tokens use `Object.defineProperties` with getters over SolidJS signals.
When the theme changes, SolidJS re-fires `setProperty` → colors re-parsed → zero per-frame cost.

```tsx
// themeColors.card is a getter that reads a SolidJS signal:
backgroundColor={themeColors.card}     // reactive — updates on theme change

// Static tokens for non-reactive use:
backgroundColor={colors.card}          // NOT reactive — value frozen at import
```

**Important:** Void component style objects MUST be inside component functions (not module scope) for getter reactivity to work.

### Decision 10: Dual Router — Flat + Stack

**Rule:** Both navigation models. Developer chooses based on app needs.

```tsx
// FLAT routing (React Router style):
<Router>
  <Route path="home" component={Home} />
  <Route path="settings" component={Settings} />
</Router>

// STACK routing (React Navigation style):
const stack = useNavigationStack()
stack.push(SettingsScreen)
stack.pop()
```

### Decision 11: Image Decode in Bun (Not Zig)

**Rule:** Image loading uses Bun APIs or `sharp` (optional dep). Zig is NOT used for image decode.
Decode is one-time per image (not per-frame) — JS performance is sufficient.

---

## Resolved Issues

### bun:ffi >8 params on ARM64 — FIXED ✅

**Problem:** ARM64 has 8 general-purpose registers (x0-x7) for function args. bun:ffi silently corrupts parameters beyond the 8th when they spill to the stack.

**Solution:** All 12 affected FFI functions migrated to packed buffer pattern. A single shared `ArrayBuffer(64)` is reused for ALL paint calls — zero allocations per frame. TypeScript packs params via `DataView.setInt32/setUint32`, Zig unpacks via `@bitCast`. Safe because FFI calls are synchronous and single-threaded.

**Performance impact:** Eliminated ~18,000 allocations/second at 60fps with 100 nodes.

**Functions migrated:** `tge_rounded_rect`, `tge_stroke_rect`, `tge_rounded_rect_corners`, `tge_stroke_rect_corners`, `tge_stroked_circle`, `tge_line`, `tge_bezier`, `tge_blur`, `tge_halo`, `tge_linear_gradient`, `tge_linear_gradient_multi`, `tge_conic_gradient`, `tge_draw_text_font`.

---

## Architecture Notes

### The engine stays stupid, the components get smart

Only three JSX intrinsics: `<box>`, `<text>`, `<img>`. Everything else is SolidJS components.
SolidJS dissolves components at compile time → zero runtime overhead.
The render loop (walkTree → Clay → Zig → Kitty) stays minimal and fast.

### Component architecture: headless + styled layers

```
@tge/components (headless)     @tge/void (styled)
├── Button (render props)  →   VoidButton (tokens + themeColors)
├── Select (render props)  →   VoidSelect (tokens + themeColors)
├── Dialog (focus trap)    →   VoidDialog (card style + shadow)
└── ...                        ...
```

Headless components provide BEHAVIOR. Void components provide STYLING. Third-party theme packages can replace Void entirely.

### Pre-parse everything in setProperty

```
JSX prop change → reconciler.setProperty() → parse ONCE (color, sizing, interactive styles)
                                            ↓
walkTree (30-60fps) → reads pre-parsed u32 values → ZERO string parsing per frame
```

### Terminal transmission is the bottleneck, not painting

Clay layouts in microseconds. Zig paints in microseconds. TTY transmission is milliseconds.
Every optimization that reduces I/O has outsized impact:
- Layer compositing: only dirty layers retransmit
- Shared memory (t=s): near-zero TTY payload
- PNG compression (o=z): 4x smaller payloads
- Buffer diffing: skip unchanged frames entirely

---

## What TGE Can Do That Web CAN'T

1. **Zero-latency rendering** — Clay layout in microseconds, Zig paint in microseconds. No DOM, no CSSOM.
2. **GPU-composited layers** — Kitty/Ghostty composite in GPU VRAM. Unchanged layers = zero I/O.
3. **Native terminal integration** — runs where SSH does. No browser needed.
4. **Pixel-perfect anti-aliasing** — SDF-based rendering with proper sub-pixel AA.
5. **True glassmorphism** — backdrop blur + 7 filters read actual buffer content, not simulated.
6. **Sub-8KB per layer update** — typical UI change transmits 4-15KB, not megabytes.
7. **SolidJS reactivity** — no VDOM diffing, no reconciliation. Surgical signal-based updates.

The goal isn't to replicate the web. It's to bring web-quality UI to the terminal while keeping these unique strengths.
