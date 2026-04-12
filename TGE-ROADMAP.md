# TGE vs Web Moderno — Gap Analysis & Roadmap

> Architectural analysis: what TGE needs to become a general-purpose terminal application engine, not just a LightCode renderer.

## What We Already Have (Solid Foundation)

| Category | Status | Quality |
|----------|--------|---------|
| Rendering pipeline (SDF, AA, compositing) | Done | Excellent — browser-quality |
| Layout engine (Clay FFI, flexbox, floating) | Done | Very good |
| Visual effects (shadow, gradient, blur, glow) | Done | Complete |
| Input (keyboard, mouse, paste, focus) | Done | Complete |
| Text editing (Input, Textarea, syntax) | Done | Advanced |
| Layer compositing (dirty-flag, z-index) | Done | Fixed (layer+scroll desync resolved) |
| Design tokens (@tge/tokens, @tge/void) | Done | Good |
| Content rendering (Markdown, Code, Diff) | Done | Good |
| Declarative interaction (hover/active styles) | Done | Good |

---

## What's Missing — Ordered by Impact

Think of it like building a house. We have solid foundations (rendering) and walls (layout + components). What's missing are the things that make the house HABITABLE.

---

### Tier 1 — Without this you CAN'T build real apps

#### 1. Animations and Transitions

> A house without hinges on the doors. Everything works but it feels RIGID.

Zero animation exists. No `transition`, no `spring`, no `tween`. In modern web, 80% of quality UX comes from transitions. A modal appearing, a button smoothly growing, a list animating insertion.

**What's needed:**
- `createTransition(signal, { duration, easing })` — transitions numeric values
- `createSpring(signal, { stiffness, damping })` — spring physics
- `<AnimatePresence>` — mount/unmount animations
- Easing library (ease-in-out, cubic-bezier)
- Can be built on top of the existing 30fps render loop

**Effort:** 2-3 days

#### 2. Context / Provider (Dependency Injection)

> A house where every room has to fetch water from the well instead of having plumbing.

SolidJS HAS `createContext`, but TGE doesn't re-export it. Without this:
- No runtime theming
- No passing data deep without prop drilling
- No router possible
- No form system possible

**What's needed:**
- Re-export `createContext`, `useContext` from solid-js
- This is literally a one-line change in packages/renderer/src/index.ts

**Effort:** 1 hour

#### 3. Form Components

> An office where you can only write on loose papers but you have no forms.

**Missing components:**
- Select / Dropdown
- RadioGroup
- Switch / Toggle
- Slider
- Combobox / Autocomplete
- NumberInput

**More importantly:** A form validation system (React Hook Form-style or Zod integration).

**Effort:** 1 week total for core components + validation

---

### Tier 2 — Needed for complex apps

#### 4. Router / Navigation Stack

> A house with only one room.

For multi-screen apps you need:
- Navigation stack (push/pop screens)
- `<Router>` / `<Route>` components
- Animated transitions between screens (depends on Tier 1 animations)
- History management (go back)

Terminal apps aren't URL-based, but the concept translates to a screen stack with transitions.

**Effort:** 2 days

#### 5. Runtime Theming

> A house where you can't change the paint.

`@tge/void` tokens are constants. You need:
- `ThemeProvider` (Context-based, depends on Tier 1 Context)
- Dark/light mode switching
- Custom theme creation via `createTheme(overrides)`
- Per-component theme overrides

**Effort:** 1 day

#### 6. Image Component

> The infrastructure already exists. Just need the component.

The Kitty graphics protocol is fully implemented. Just need:
- `<Image src={path} width={} height={} />` component
- PNG/JPEG decode to PixelBuffer (Bun has native image decode or use `sharp`)
- Use the layer compositor to display it
- 90% of the plumbing is already done

**Effort:** 1 day

#### 7. Dialog / Modal

> Portal already exists. Just need the component wrapper.

- `<Dialog>` component with overlay backdrop
- `<AlertDialog>` for confirmation patterns
- Focus trap inside dialog
- Escape key to close
- Animated enter/exit (depends on Tier 1 animations)

**Effort:** Half day (without animations), 1 day (with)

#### 8. Toast / Notification System

> Instant user feedback for actions.

- `toast()` function call API
- Auto-dismiss with configurable duration
- Stack multiple toasts
- Variants: success, error, warning, info
- Position: top-right, bottom-right, etc. (using floating)

**Effort:** 1 day

---

### Tier 3 — Nice to have to compete with web

#### 9. Data Fetching Patterns
- `useQuery(key, fetcher)` hook
- `useMutation(mutator)` hook
- Caching, retry, loading/error states
- **Effort:** 1 day

#### 10. Tooltip / Popover
- Floating element with delay
- Attach to trigger element
- Arrow pointing to trigger
- **Effort:** 1 day

#### 11. List Virtualization
- For lists with 10K+ items (type react-window / tanstack-virtual)
- Only render visible items
- Smooth scroll with recycled DOM nodes
- **Effort:** 2 days

#### 12. Combobox / Autocomplete
- Input + dropdown list
- Fuzzy search / filtering
- Keyboard navigation
- Async options loading
- **Effort:** 2 days

#### 13. Drag and Drop
- Mouse events already exist
- Need: draggable, droppable, drag overlay
- Reorder lists, move items between containers
- **Effort:** 2-3 days

#### 14. Grid Layout
- Clay doesn't support CSS Grid
- WrapRow is a partial workaround
- Could implement a `<Grid cols={3} gap={8}>` component using Clay's flex
- **Effort:** 1 day (approximation via flex), much more for true grid

---

## API Design Decisions (Resolved)

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

**Token change:** `@tge/void` tokens will export hex strings instead of u32:
```ts
// BEFORE: colors.card = 0x171717ff        ← alien to web devs
// AFTER:  colors.card = "#171717"          ← instantly familiar
```

### Decision 3: Direct Props Primary + `style` Prop for Merging

**Rule:** Props are applied directly on JSX elements (React Native style). An optional `style` prop
merges with direct props (direct props win on conflict).

```tsx
// Direct props — primary API, best TypeScript DX:
<box backgroundColor="#1a1a2e" borderRadius={12} padding={8} />

// Style object — for reusable style definitions:
const glass = { backdropBlur: 12, backgroundColor: "#ffffff20", borderRadius: 16 }
<box style={glass} padding={24} />   // padding=24 is direct, rest from style

// Style merge order: direct props override style object
```

**Why not style-only (React DOM pattern):**
- Direct props have better TypeScript autocomplete (no nested object)
- Less nesting = more readable JSX
- React Native, SwiftUI, Flutter all use direct props — it's the standard for non-web renderers

### Decision 4: Numbers Only + Scale Helpers (No CSS Units)

**Rule:** All numeric props are in pixels. No string units (`px`, `rem`, `em`, `vh`).
Use token scale helpers for semantic spacing.

```tsx
padding={16}              // always pixels
padding={space[4]}        // semantic: space[4] = 16 — typed, autocompletable
width="100%"              // string ONLY for sizing mode: "100%", "grow", "fit"
padding={[16, 24]}        // shorthand: [Y, X] — like CSS shorthand but typed
```

**Why no `rem`/`em`/`vh`:**
- Terminal has no concept of "viewport height" (resize is unpredictable)
- `rem` implies a global root font size, but TGE uses bitmap font atlases with fixed pixel sizes
- Parsing strings for every prop on every frame is unnecessary overhead
- Numbers are type-safe. `padding="1rem"` is not.

### Decision 5: `<box>` + `<text>` Are the Only Intrinsics

**Rule:** Only two JSX intrinsic elements: `<box>` and `<text>`. Everything else is components.

**Why not add more intrinsics (`<button>`, `<select>`, `<img>`, etc.):**
- Intrinsics are handled in `walkTree()` which runs 30x/second. Each new intrinsic = more branches in the hot path.
- SolidJS dissolves components at compile time — a `<Button>` component becomes `<box>` + `<text>` with ZERO runtime overhead.
- HTML intrinsics have complex implicit behavior (form submission, focus management, ARIA roles) that doesn't translate to terminal.
- Components can be versioned, extended, and themed. Intrinsics are frozen in the engine.

**Component equivalents for web devs:**
| Web intrinsic | TGE equivalent | Package |
|--------------|----------------|---------|
| `<div>` | `<box>` | intrinsic |
| `<span>`, `<p>` | `<text>` | intrinsic |
| `<button>` | `<Button>` | `tge/void` |
| `<input>` | `<input>` | intrinsic |
| `<textarea>` | `<textarea>` | intrinsic |
| `<select>` | `<Select>` | `tge/void` (planned) |
| `<img>` | `<Image>` | `tge/void` (planned) |
| `<table>` | `<Table>` | `tge/void` (planned) |
| `<dialog>` | `<Dialog>` | `tge/void` (planned) |

### Decision 6: Unified `onPress` for Interaction

**Rule:** A single `onPress` prop handles both mouse click and keyboard activation (Enter/Space).
Low-level events (`onMouseDown`, `onMouseUp`, `onMouseOver`, `onMouseOut`) remain available
for advanced use cases.

```tsx
// Web dev writes:
<Button onPress={() => save()}>Save</Button>

// Instead of the current ceremony:
useFocus({ onKeyDown(e) { if (e.key === "enter") save() } })
<box onMouseDown={() => save()}>...</box>
```

### Decision 7: `focusStyle` Completes the Interaction Trio

**Rule:** `focusStyle` works exactly like `hoverStyle` and `activeStyle` — a partial set of
visual props merged over base props when the element has focus.

```tsx
<box
  backgroundColor="#1a1a2e"
  hoverStyle={{ backgroundColor: "#2a2a3e" }}
  activeStyle={{ backgroundColor: "#3a3a4e" }}
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
/>
```

### Decision 8: Adaptive Framerate with User Control

**Rule:** Render loop runs at adaptive framerate. 30fps when idle, scales up to 60fps during
active animations. User can cap the maximum via `mount()` options.

```tsx
// Default: adaptive 30-60fps
mount(() => <App />, terminal)

// User caps to 30fps (e.g., for SSH or resource-constrained environments)
mount(() => <App />, terminal, { maxFps: 30 })

// User requests full 60fps always
mount(() => <App />, terminal, { maxFps: 60 })
```

**How it works:**
- Idle: 30fps (33ms interval). Only repaints when `isDirty()`.
- Animation active: switches to 60fps (16ms interval) while any `createTransition` or `createSpring` is running.
- Animation ends: drops back to 30fps after a cooldown (~200ms of no animation ticks).
- `maxFps` option clamps the upper limit. Default is 60.

**Why adaptive, not fixed 60fps:**
- 60fps when nothing is moving wastes CPU and TTY bandwidth for zero visual benefit.
- 30fps idle is imperceptible (UI is static — there's nothing to see between frames).
- Adaptive gives the BEST of both worlds: smooth animations + efficient idle.

### Decision 9: Theme Tokens as Reactive Objects (valueOf trick)

**Rule:** Theme tokens are objects with `valueOf()` that returns u32 and `toString()` that returns
hex string. Internally backed by SolidJS signals. When the theme changes, only components using
those tokens re-render.

```tsx
// Developer writes (no parentheses, looks like a constant):
backgroundColor={colors.card}

// But colors.card is actually a reactive object:
// - colors.card.valueOf() → 0x171717ff (for engine internals)
// - colors.card.toString() → "#171717" (for display/debugging)
// - colors.card is backed by a SolidJS signal (for reactivity)

// Theme switch is transparent:
setTheme(lightTheme)  // → all signals update → only affected components repaint
```

**How it works internally:**
1. `createTheme()` creates a signal for each token
2. Each token is a `ColorToken` object with `valueOf()` → signal value (u32) and `toString()` → hex
3. `parseColor()` already handles objects with `valueOf()` (line 215 of node.ts)
4. When SolidJS reads `colors.card` in a component, it subscribes to that signal
5. `setTheme()` updates all signals → SolidJS re-runs only affected computations

**Why not `colors.card()` function syntax:**
- Adding `()` to every color reference is ugly and unfamiliar to web devs
- `valueOf()` trick makes the object behave as a primitive in all contexts (math, comparison, assignment)
- The existing `parseColor()` already supports this pattern — zero engine changes needed

### Decision 10: Dual Router — Flat + Stack

**Rule:** Provide both navigation models. Same underlying engine, two interfaces.
Developer chooses based on their app's needs.

```tsx
// FLAT routing (React Router style) — for dashboards, settings, simple apps:
<Router>
  <Route path="home" component={Home} />
  <Route path="settings" component={Settings} />
</Router>
navigate("settings")

// STACK routing (React Navigation style) — for wizards, nested flows:
const stack = useNavigationStack()
stack.push(SettingsScreen)
stack.pop()       // go back
stack.goBack()    // alias
```

**When to use which:**
- **Flat**: Dashboard with tabs, settings panels, single-level navigation. Simpler, less memory.
- **Stack**: Multi-step wizards, drill-down views, terminal apps with "back" behavior (like htop → help → back).

**Both share:**
- Screen transition animations (Phase 1 dependency)
- Focus management (restore focus on navigation)
- History tracking

### Decision 11: Image Decode in Bun (Not Zig)

**Rule:** Image loading and decoding uses Bun APIs or `sharp` npm package.
Zig is NOT used for image decode.

**Why Bun:**
- Image decode is ONE-TIME per image (not per-frame) — JS performance is sufficient
- Bun has native `Bun.file()` + `ArrayBuffer` for raw file access
- `sharp` (libvips) handles PNG, JPEG, WebP, AVIF, GIF with one dependency
- Adding stb_image.h to Zig adds build complexity for minimal benefit
- If future image processing is needed (resize, crop), `sharp` already handles it

**Pipeline:**
```
<Image src="./logo.png" /> 
  → Bun reads file → sharp decodes to RGBA ArrayBuffer 
  → PixelBuffer.create(width, height, data) 
  → layer compositor renders via Kitty protocol
```

---

## Web Developer Friction Map

For reference — the 7 friction points identified and their resolution status:

| # | Friction | Impact | Resolution | Status |
|---|---------|--------|------------|--------|
| 1 | Colors export u32 — looks alien | MASSIVE | Tokens export strings, parse once in setProperty | Phase 0 |
| 2 | Prop names differ from CSS | HIGH | CSS names primary, TGE names as aliases | Phase 0 |
| 3 | No unified `onClick`/`onPress` | HIGH | `onPress` prop (mouse + keyboard) | Phase 0 |
| 4 | No `style` prop | MEDIUM | `style` prop merges with direct props | Phase 0 |
| 5 | SolidJS instead of React | MEDIUM | Can't change (perf requirement). Mitigate with docs | Docs |
| 6 | No `useContext` / Provider | HIGH | Re-export from SolidJS | Phase 0 |
| 7 | No transitions/animations | HIGH | Animation primitives | Phase 1 |

---

## Recommended Roadmap

### Phase 0: "Foundation" — Performance & Zig Visual Primitives

Everything built on top benefits from this. Do it FIRST.

#### Performance: Transmission Medium Upgrade

Currently TGE uses `t=d` (direct base64) for ALL Kitty graphics transmission.
This is the SLOWEST mode — every pixel buffer is base64-encoded and streamed through the TTY.

The Kitty protocol supports two dramatically faster local methods:

| Method | How it works | TTY payload | Latency |
|--------|-------------|-------------|---------|
| `t=d` (current) | base64 encode → escape codes → TTY stream | ~640KB per 400x300 layer | ~5-10ms |
| `t=f` (temp file) | write to `/tmp/tty-graphics-protocol-*` → terminal reads file | ~80 bytes | ~1-2ms |
| `t=s` (shared memory) | POSIX `shm_open()` → terminal reads from shared RAM | ~50 bytes | ~0.1ms |

**`t=s` is 10,000x less data through the TTY.** The terminal reads pixels directly from shared memory.
This is completely transparent to the user — the optimization lives entirely in `packages/output/src/kitty.ts`.

**Auto-detection strategy:**
1. `createTerminal()` queries terminal capabilities (send `i=31,a=q,t=s`)
2. Detects if connection is local or remote (SSH = no shared memory)
3. Selects best available method automatically:
   - Local Kitty/Ghostty → `t=s` (shared memory)
   - Local other terminal → `t=f` (temp file)
   - SSH/tmux/remote → `t=d` (direct base64, current fallback)

**Effort:** 1-2 days
**Impact:** Every frame, every layer, every animation benefits. Force multiplier for everything below.

#### Performance: Layer Compositing Optimizations

Current layer optimizations already in place:
- Dirty-flag: only repaint layers whose content changed
- Buffer comparison: skip transmission if pixels identical to previous frame
- Z-index compositing: terminal GPU composites layers, not us

Additional optimizations to implement:
- **PNG compression** (`o=z`): Kitty supports zlib-compressed payloads — ~4x smaller than raw RGBA
- **Partial updates**: Only transmit the changed REGION of a layer, not the entire buffer
- **Frame budget**: Skip non-critical repaints if frame time exceeds budget (prioritize input responsiveness)

**Effort:** 2-3 days
**Impact:** Reduces transmission size even further when shm isn't available (SSH, tmux)

#### Zig Visual Primitives — Batch 1: "Unlocks Modern Design"

| Feature | New in Zig | Effort | Impact |
|---------|-----------|--------|--------|
| Multi-stop gradient | Rewrite `gradient.zig` → accept N stops via buffer FFI | 1 day | HIGH — dashboards, modern UI needs 3+ color stops |
| Conic gradient | New in `gradient.zig` — atan2 angle interpolation | half day | HIGH — color pickers, pie charts, spinners |
| Inner shadow (inset) | New in `rect.zig` — invert SDF distance for blur | half day | HIGH — input fields, sunken surfaces |
| Text decoration | Wire `tge_line` to text renderer for underline/strikethrough | half day | MEDIUM — links, deleted text |

**Effort:** 3-4 days total

#### Zig Visual Primitives — Batch 2: "Visual Polish Pro"

| Feature | New in Zig | Effort | Impact |
|---------|-----------|--------|--------|
| Backdrop saturate/brightness/contrast | New `filter.zig` — per-pixel color transform | 1 day | MEDIUM — pro glassmorphism, dimmed backgrounds |
| Text shadow | Reuse blur pipeline on text glyph buffer | half day | MEDIUM — headings with depth |
| Gradient border (stroke) | New in `rect.zig` — stroke with gradient | half day | MEDIUM — premium buttons, cards |
| Blend modes | Extend `blend()` with multiply/screen/overlay | 1 day | LOW-MEDIUM — artistic effects |

**Effort:** 3 days total

#### Renderer: DX & API Polish

| Feature | Where | Effort |
|---------|-------|--------|
| Re-export `createContext`/`useContext` from SolidJS | renderer/index.ts | 1 hour |
| `opacity` prop (multiply alpha of entire subtree) | loop.ts layer composite | half day |
| `focusStyle` prop (like hoverStyle/activeStyle) | node.ts + loop.ts | half day |
| `onPress` unified prop (mouse click + Enter/Space) | node.ts + loop.ts | half day |
| `style` prop that merges with direct props | node.ts + reconciler.ts | half day |
| `borderRadius` as primary name (`cornerRadius` alias) | node.ts + types | 1 hour |
| `boxShadow` as primary name (`shadow` alias) | node.ts + types | 1 hour |
| Padding shorthand: `padding={[16, 24]}` → Y, X | node.ts | 2 hours |
| Tokens export strings: `colors.card` → `"#171717"` | void/tokens.ts | half day |

**Effort:** ~3 days total

```
Phase 0 Total: ~12-15 days
Impact: EVERYTHING built after this is faster, prettier, and easier to use.
```

---

### Phase 1: "Habitable" — Simple apps feel DELIGHTFUL

```
  |-- Animation primitives (transition + spring)         [2-3 days]
  |-- ThemeProvider with runtime switching                [1 day]
  |-- Dialog/Modal (Portal already exists)               [half day]
  |
  | Total: ~4 days
  | Impact: MASSIVE — transforms the entire feel of TGE apps
```

---

### Phase 2: "Productive" — Complex apps are possible

```
  |-- Select/Dropdown component                          [1 day]
  |-- Switch/Toggle component                            [2 hours]
  |-- RadioGroup component                               [2 hours]
  |-- Toast/Notification system                          [1 day]
  |-- Image component                                    [1 day]
  |-- Table component                                    [1 day]
  |-- Navigation stack / simple router                   [2 days]
  |
  | Total: ~7 days
  | Impact: Enables building real business applications
```

---

### Phase 3: "Competitive" — Competes with web frameworks

```
  |-- Form validation system                             [2 days]
  |-- Combobox/Autocomplete                              [2 days]
  |-- Slider component                                   [1 day]
  |-- Data fetching hooks                                [1 day]
  |-- List virtualization                                [2 days]
  |-- Tooltip/Popover                                    [1 day]
  |
  | Total: ~9 days
  | Impact: Feature parity with web for most use cases
```

---

## Key Architectural Insights

### Phase 0 is the force multiplier

Every optimization and primitive in Phase 0 benefits ALL subsequent phases:
- **Shared memory transmission** makes animations cheap (60fps becomes feasible)
- **PNG compression** makes SSH/tmux viable for complex UIs
- **Multi-stop gradients** unlocks 80% of design system visual patterns
- **opacity + focusStyle** are prerequisites for polished components
- **Context/Provider** unlocks theming, routing, and form systems

### The engine stays stupid, the components get smart

Only two JSX intrinsics: `<box>` and `<text>`. Everything else is SolidJS components.
SolidJS dissolves components at compile time → zero runtime overhead.
The render loop (walkTree → Clay → Zig → Kitty) stays minimal and fast.

### Terminal transmission is the bottleneck, not painting

Clay layouts in microseconds. Zig paints in microseconds.
But transmitting pixels to the terminal is milliseconds.
Every optimization that reduces TTY I/O has outsized impact:
- Layer compositing: only dirty layers retransmit
- Shared memory: near-zero TTY payload
- PNG compression: 4x smaller payloads
- Buffer diffing: skip unchanged frames entirely

---

## What TGE Can Do That Web CAN'T

1. **Zero-latency rendering** — Clay layout in microseconds, Zig paint in microseconds. No DOM, no CSSOM, no browser overhead.
2. **GPU-composited layers** — Kitty/Ghostty composite layers in GPU VRAM. Unchanged layers = zero I/O.
3. **Native terminal integration** — runs where SSH does. No browser needed. Cloud-native.
4. **Pixel-perfect anti-aliasing** — SDF-based rendering with proper sub-pixel AA.
5. **True glassmorphism** — backdrop blur reads actual buffer content, not simulated.
6. **Sub-8KB per layer update** — a typical UI change transmits 4-15KB, not megabytes.
7. **SolidJS reactivity** — no VDOM diffing, no reconciliation overhead. Surgical updates.

The goal isn't to replicate the web. It's to bring web-quality UI to the terminal while keeping these unique strengths.

---

## Known Issues — To Investigate

### bun:ffi >8 params on ARM64 — needs validation

**CONFIRMED**: The bug is REAL. `tge_inset_shadow` with 12 params produced 0 painted pixels. After refactoring to use a packed params buffer (5 FFI args), the exact same function produced 989 correct pixels. The ARM64 ABI silently garbles params beyond the 8th register.

**Mystery**: Pre-existing functions with >8 params (stroke_rect, bezier, linear_gradient) seem to work in production. This needs investigation — it's possible they work by coincidence (e.g., the garbled params happen to be valid values) or there's a different code path. Either way, they should be migrated to packed buffers.

**Action items**:
1. Migrate all >8-param FFI exports to use packed buffer approach (same pattern as tge_inset_shadow)
2. The new functions (multi-stop gradient, conic gradient, inset shadow) already use this pattern

**Affected functions (>8 params)**:
- `tge_rounded_rect` (9 params)
- `tge_stroke_rect` (10 params)
- `tge_stroke_rect_corners` (10 params)
- `tge_stroked_circle` (9 params)
- `tge_line` (9 params)
- `tge_bezier` (11 params)
- `tge_blur` (9 params)
- `tge_halo` (9 params)
- `tge_linear_gradient` (10 params)
- `tge_draw_text_font` (9 params)

**Priority**: Investigate in next session. If real, fix as part of Phase 0.3 Zig work.
