# TGE Comprehensive Audit Report (ARCHIVED — Pre-Phase 3)

> **⚠️ This document is a historical snapshot from before Phases 1-3 and the Backlog sprint were completed.**
> All gaps identified below have been resolved. For current state, see AGENTS.md and the docs/ folder.
> Kept for reference only — DO NOT use as source of truth.

## 1. ALL COMPONENTS

### @tge/components (17 components)

| Component | File | Props | Purpose |
|-----------|------|-------|---------|
| **Box** | `packages/components/src/box.tsx` | direction, padding, paddingX/Y, gap, alignX/Y, width, height, backgroundColor, cornerRadius, borderColor, borderWidth, shadow, glow, layer, scrollX/Y, scrollSpeed, children | Primary layout container; thin wrapper over `<box>` intrinsic |
| **Text** | `packages/components/src/text.tsx` | color, fontSize, fontId, lineHeight, wordBreak, whiteSpace, fontFamily, fontWeight, fontStyle, children | Text display with word-wrap; thin wrapper over `<text>` intrinsic |
| **ScrollView** | `packages/components/src/scroll-view.tsx` | ref(ScrollHandle), width, height, scrollX/Y, scrollSpeed, showScrollbar, backgroundColor, cornerRadius, borderColor, borderWidth, direction, padding, paddingX/Y, gap, alignX/Y, children | Scrollable container with visual scrollbar (track+thumb), programmatic scrollTo/scrollBy/scrollIntoView via ScrollHandle |
| **Button** | `packages/components/src/button.tsx` | onPress, variant(solid/outline/ghost), color, disabled, focusId, children | Focus-aware push button with Enter/Space activation, visual press feedback via setTimeout |
| **ProgressBar** | `packages/components/src/progress-bar.tsx` | value, max, color, trackColor, width, height | Pure visual horizontal progress indicator (two nested boxes) |
| **Checkbox** | `packages/components/src/checkbox.tsx` | checked, onChange, label, color, disabled, focusId | Controlled toggle with Enter/Space activation; filled square indicator |
| **Tabs** | `packages/components/src/tabs.tsx` | activeTab, onTabChange, tabs[{label,content()}], color, focusId | Controlled tab switcher with Left/Right navigation; lazy content rendering |
| **List** | `packages/components/src/list.tsx` | items(string[]), selectedIndex, onSelectedChange, onSelect, color, focusId | Selectable list with Up/Down/j/k/Enter navigation |
| **Input** | `packages/components/src/input.tsx` | value, onChange, onSubmit, placeholder, width, color, disabled, focusId | Controlled single-line text input with full cursor movement, selection (Shift+arrows), Ctrl+A, paste, blinking cursor |
| **Textarea** | `packages/components/src/textarea.tsx` | ref(TextareaHandle), value, onChange, onSubmit, onCursorChange, onKeyDown, onPaste, placeholder, width, height, color, disabled, focusId, keyBindings, syntaxStyle, language | Full multi-line editor with 2D cursor, selection, customizable keybindings, tree-sitter syntax highlighting, extmarks (ghost text), imperative handle (setText/insertText/clear/gotoBufferEnd) |
| **RichText** | `packages/components/src/rich-text.tsx` | maxWidth, lineHeight, color, fontSize, children | Horizontal row of Span children (limited -- true inline rich text is planned) |
| **Span** | `packages/components/src/rich-text.tsx` | color, fontSize, fontId, fontWeight, fontStyle, children | Inline text fragment; renders as `<text>` |
| **Portal** | `packages/components/src/portal.tsx` | children | Renders children as full-screen overlay layer (for modals, tooltips, prompts) |
| **Code** | `packages/components/src/code.tsx` | content, language, syntaxStyle, width, height, backgroundColor, cornerRadius, padding, lineNumbers, streaming | Async syntax-highlighted code block via tree-sitter worker; streaming mode for AI responses |
| **Markdown** | `packages/components/src/markdown.tsx` | content, syntaxStyle, color, width, streaming | Full markdown renderer using `marked` lexer: headings, paragraphs, code blocks, lists, blockquotes, tables, HR, inline bold/italic/code/links/strikethrough |
| **WrapRow** | `packages/components/src/wrap-row.tsx` | width, itemWidth, gap, rowGap, children | Flex-wrap workaround (Clay has no native flexWrap); greedy row-splitting algorithm |
| **Diff** | `packages/components/src/diff.tsx` | diff, syntaxStyle, filetype, showLineNumbers, width, addedBg, removedBg, contextBg, addedSignColor, removedSignColor, lineNumberFg, streaming | Unified diff viewer with +/- coloring, line numbers, customizable colors |

### @tge/void Design System (11 components + 9 typography presets)

| Component | File | Props/Variants | Purpose |
|-----------|------|----------------|---------|
| **Button** | `packages/void/src/button.tsx` | variant(default/secondary/outline/ghost/destructive), size(xs/sm/default/lg) | shadcn-compatible button with hoverStyle/activeStyle for declarative interaction |
| **Card** | `packages/void/src/card.tsx` | size(default/sm) | Elevated surface container with border + shadow |
| **CardHeader** | same | children | Slot for title/description |
| **CardTitle** | same | children | Semibold card title text |
| **CardDescription** | same | children | Muted description text |
| **CardContent** | same | children | Card body content |
| **CardFooter** | same | children | Footer row with centered alignment |
| **Badge** | `packages/void/src/badge.tsx` | variant(default/secondary/outline/destructive) | Pill-shaped status indicator |
| **Separator** | `packages/void/src/separator.tsx` | orientation(horizontal/vertical) | 1px divider line |
| **Avatar** | `packages/void/src/avatar.tsx` | name, size(sm/default/lg), color | Circle with initial letter |
| **Skeleton** | `packages/void/src/skeleton.tsx` | width, height, cornerRadius | Loading placeholder (static muted rectangle) |
| **H1-H4, P, Lead, Large, Small, Muted** | `packages/void/src/typography.tsx` | children, color | Typography presets mapping to font sizes/weights |

---

## 2. RENDERER CAPABILITIES

### JSX Props (50 props on `<box>` intrinsic)

Source: `packages/renderer/src/node.ts` (TGEProps type)

**Layout:** direction, flexDirection, padding, paddingX/Y, paddingLeft/Right/Top/Bottom, gap, alignX(left/right/center/space-between), alignY(top/bottom/center/space-between), justifyContent, alignItems

**Sizing:** width, height (number=fixed, "grow", "fit", "100%"), flexGrow, flexShrink, minWidth, maxWidth, minHeight, maxHeight

**Visual:** backgroundColor (string or u32), cornerRadius, cornerRadii({tl,tr,br,bl}), borderColor, borderWidth, borderLeft/Right/Top/Bottom, borderBetweenChildren

**Effects:** shadow (single or array), glow({radius,color,intensity}), gradient(linear{from,to,angle} or radial{from,to}), backdropBlur (glassmorphism)

**Interactive states:** hoverStyle, activeStyle -- declarative hover/active visual overrides for backgroundColor, borderColor, borderWidth, cornerRadius, shadow, glow, gradient, backdropBlur

**Compositing:** layer (own rendering layer), scrollX/Y, scrollSpeed, scrollId

**Floating/Absolute:** floating("parent"/"root"/{attachTo}), floatOffset({x,y}), zIndex, floatAttach({element,parent} using 0-8 3x3 grid), pointerPassthrough

**Text (on `<text>`):** color, fontSize, fontId, lineHeight, wordBreak, whiteSpace, fontFamily, fontWeight, fontStyle

### Visual Effects Pipeline

All effects are Zig FFI calls collected during tree walk and painted during the render pass:
- Drop shadows: painted BEFORE the rect, box blur approximating Gaussian
- Multi-shadow: array of shadow objects, painted in order
- Outer glow: tge_halo with plateau+falloff
- Linear gradient: tge_linear_gradient with arbitrary angle
- Radial gradient: tge_radial_gradient
- Backdrop blur: reads region behind element, blurs in temp buffer, composites (true glassmorphism)
- Per-corner radius: tge_rounded_rect_corners / tge_stroke_rect_corners (SDF anti-aliased)

### Render Pipeline

1. SolidJS reconciler creates TGENode tree
2. Each frame: walk tree -> replay into Clay (immediate mode)
3. Clay calculates layout in microseconds -> flat RenderCommand array
4. Commands grouped by layer (recursive layer boundary detection)
5. Only dirty layers are repainted (pixel buffer per layer)
6. Only dirty layers are retransmitted (Kitty image per layer with z-index)
7. Clean layers: zero I/O (terminal keeps old image in GPU VRAM)
8. 30fps render loop with dirty-flag optimization

---

## 3. INPUT SYSTEM

Source: `packages/input/src/`

**Events supported:**
- **KeyEvent**: key name, printable char, modifiers (shift/alt/ctrl/meta)
- **MouseEvent**: press, release, move, scroll; button (left/middle/right/scroll up/scroll down); x,y position; modifiers
- **FocusEvent**: focus in/out tracking (terminal focus mode 1004)
- **PasteEvent**: bracketed paste mode (2004) -- full text payload
- **ResizeEvent**: terminal resize

**Protocols supported:**
- Standard ANSI/xterm key sequences
- Kitty keyboard protocol (enhanced key detection)
- SGR extended mouse protocol (1006) -- press, release, move, scroll with exact cell position
- Focus tracking (mode 1004)
- Bracketed paste mode (mode 2004)

**Reactive hooks:**
- `useKeyboard()` -- signal for last key event
- `useMouse()` -- signal for mouse events + position
- `useInput()` -- signal for ALL input events
- `onInput(handler)` -- low-level subscriber pattern

**What is MISSING:**
- No touch/gesture support (not applicable in terminal context)
- No gamepad input
- No drag-and-drop abstraction (mouse events exist but no DnD framework)

---

## 4. ANIMATION

**Status: DOES NOT EXIST**

The only "animation" is:
- Button press visual feedback via `setTimeout(() => setPressed(false), 100)` in button.tsx
- Cursor blinking via `setInterval(() => setBlink(!b), 530)` in Input/Textarea

**What is MISSING compared to React + Framer Motion:**
- No transition system (animated prop changes)
- No easing functions
- No spring physics
- No keyframe animations
- No layout animations (animate height/width changes)
- No mount/unmount animations (enter/exit)
- No gesture-driven animations
- No AnimatePresence equivalent
- No requestAnimationFrame-based animation loop
- The 30fps render loop exists and could support animation, but no animation primitives are built on top of it

---

## 5. ROUTING / NAVIGATION

**Status: DOES NOT EXIST**

No router, no navigation stack, no screen management, no URL-like routing.

**What exists as partial substitutes:**
- **Tabs component**: switches between tab panels, but is a simple controlled component -- not a router
- **Portal**: can overlay screens, but has no navigation state management
- **Focus system** cycles through focusable elements with Tab/Shift+Tab

**What is MISSING compared to React Router / Next.js:**
- No route definitions
- No URL-based routing (not applicable to terminal, but path-based navigation concepts could apply)
- No navigation stack (push/pop screens)
- No screen transitions
- No history management
- No deep linking
- No lazy route loading
- No route guards / middleware

---

## 6. STATE MANAGEMENT

**Status: SolidJS signals only -- no additional state layer**

**What exists:**
- SolidJS `createSignal` for local state (used throughout)
- SolidJS `createEffect` / `createMemo` for derived state
- Global singletons for shared state:
  - Focus system: `focusedId` signal (`packages/renderer/src/focus.ts`)
  - Selection system: `selectionSignal` (`packages/renderer/src/selection.ts`)
  - Debug state: `debugState` (`packages/renderer/src/debug.ts`)
  - Dirty flag: `isDirty` / `markDirty` (`packages/renderer/src/dirty.ts`)
- **Plugin slot system** (`packages/renderer/src/plugins.ts`): `createSlotRegistry` allows plugins to register components in named slots

**What is MISSING compared to Zustand / Redux / SolidJS stores:**
- No `createStore` (SolidJS has this, but TGE does not use or re-export it)
- No `createContext` / `Provider` pattern for dependency injection
- No global state store
- No state persistence
- No devtools integration
- No middleware pattern
- No undo/redo

---

## 7. ACCESSIBILITY

**Status: DOES NOT EXIST (beyond basic focus management)**

**What exists:**
- **Focus system** (`packages/renderer/src/focus.ts`): Tab/Shift+Tab cycle through focusable elements; keyboard dispatch to focused element; programmatic focus/blur
- Components consume `useFocus()` and provide visual focus indicators (border changes)

**What is MISSING compared to WAI-ARIA / web accessibility:**
- No ARIA roles, labels, or descriptions
- No screen reader support (terminal screen readers exist but TGE renders pixels, not text cells)
- No announced text for assistive technology
- No `role` or `tabindex` attributes
- No aria-live regions
- No high-contrast mode
- No reduced-motion preferences
- No keyboard shortcut documentation system
- NOTE: The `selectableText` mode renders text as ANSI escape codes instead of bitmap pixels, making text selectable/copiable -- this is the closest thing to accessibility

---

## 8. NETWORKING / DATA

**Status: DOES NOT EXIST**

No HTTP client, no WebSocket integration, no data fetching patterns, no API client.

The only network-like activity is the tree-sitter worker which spawns a Bun Worker for syntax highlighting -- this is inter-thread communication, not networking.

**What is MISSING compared to React Query / SWR / fetch:**
- No fetch/HTTP abstraction
- No WebSocket integration
- No data fetching hooks (useQuery, useMutation)
- No loading/error states pattern
- No caching
- No retry logic
- No real-time subscriptions

---

## 9. IMAGE / MEDIA

**Status: INFRASTRUCTURE EXISTS but no user-facing component**

The Kitty graphics protocol infrastructure is fully built:
- `packages/output/src/kitty.ts`: transmit pixel buffers as Kitty images, place at cell positions, z-index stacking
- `packages/output/src/placeholder.ts`: Unicode placeholder rendering for tmux compatibility
- `packages/output/src/layer-composer.ts`: multi-image compositing

However, this is all used INTERNALLY for the pixel rendering pipeline. There is NO user-facing `<Image>` component.

**What is MISSING:**
- No `<Image>` component to display user-provided images (PNG, JPEG, etc.)
- No SVG rendering
- No icon system (icon library)
- No image loading from file/URL
- No image scaling/cropping
- No video/animation playback
- The infrastructure to display images IS there (Kitty protocol) -- it just needs a component wrapper

---

## 10. FORMS

**What exists:**
- **Input** -- single-line text input with full editing
- **Textarea** -- multi-line text editor with full editing
- **Checkbox** -- toggle with label
- **Button** -- press action
- **List** -- single-select from items (acts like a basic Select)

**What is MISSING compared to shadcn/ui + React Hook Form:**
- No `<Select>` / `<Dropdown>` component
- No `<Radio>` / `<RadioGroup>`
- No `<Slider>` / `<Range>`
- No `<Switch>` / `<Toggle>` (Checkbox exists but no styled Switch)
- No `<DatePicker>`
- No `<TimePicker>`
- No `<ColorPicker>`
- No `<NumberInput>` / `<Stepper>`
- No `<FileInput>`
- No `<Combobox>` / `<Autocomplete>`
- No form validation system
- No form state management (useForm, field errors, touched/dirty tracking)
- No `<FormField>` / `<FormLabel>` / `<FormMessage>` wrapper components

---

## 11. LAYOUT

**What exists:**

- **Flex layout** via Clay:
  - direction: row (LEFT_TO_RIGHT) or column (TOP_TO_BOTTOM, default)
  - alignX: left, right, center, space-between
  - alignY: top, bottom, center, space-between
  - gap between children
  - padding (uniform, per-axis, per-side)
  - border (uniform, per-side, between-children)
- **Sizing modes**: fixed (px), fit (content), grow (fill available), percent (%)
- **Constraints**: minWidth, maxWidth, minHeight, maxHeight
- **Floating / Absolute positioning**: attach to parent, root, or named element; offset; z-index; 9-point attach grid; pointer passthrough
- **Scroll clipping**: horizontal + vertical, with Clay-tracked scroll state
- **Compositing layers**: explicit `layer` prop for independent pixel buffers
- **WrapRow**: manual flex-wrap workaround (greedy row splitting)

**What is MISSING compared to CSS layout:**
- No CSS Grid
- No native flex-wrap (WrapRow is a workaround with uniform item widths)
- No auto margins
- No aspect-ratio
- No position: sticky
- No overflow: visible (everything is clipped or scrolled)
- No flex-basis
- No order property
- No align-self per-child
- No gap in both axes simultaneously (only child gap in main axis direction)
- No subgrid
- No container queries

---

## 12. THEMING

**What exists:**

Two token systems, operating at different levels:

### @tge/void (design tokens + design system)
- **colors**: 20 semantic tokens matching shadcn convention (background, foreground, card, cardForeground, popover, primary, primaryForeground, secondary, muted, mutedForeground, accent, accentForeground, destructive, destructiveForeground, border, input, ring, transparent)
- **radius**: sm=6, md=8, lg=10, xl=14, xxl=18, full=9999
- **space**: Tailwind-like scale (0.5=2 through 10=40)
- **font**: xs=10 through 4xl=36
- **weight**: normal=400, medium=500, semibold=600, bold=700
- **shadows**: sm, md, lg, xl (multi-shadow arrays)
- **VoidTheme type** exported for typing

### Syntax highlighting themes
- Built-in: ONE_DARK, KANAGAWA
- `SyntaxStyle.fromTheme()` for custom themes

**What is MISSING compared to Tailwind + shadcn/ui theming:**
- **No theme switching at runtime** -- tokens are `const` objects, not reactive signals
- **No dark/light mode toggle** -- single dark theme only
- **No createTheme() factory** -- cannot create custom themes programmatically
- **No ThemeProvider context** -- components import tokens directly, not via context
- **No CSS variables equivalent** -- everything is compiled to u32 constants
- **No per-component theme overrides**
- **No theme composition** (merge base theme + overrides)
- **No color mode detection** (prefers-color-scheme equivalent)
- VoidTheme type exists but is read-only -- a user could create their own tokens object with the same shape, but there is no mechanism to inject it into components

---

## SUMMARY: EXISTS vs MISSING

### Strengths (What TGE Does Well)
- Pixel-native rendering with browser-quality visual effects (shadows, gradients, glow, glassmorphism, anti-aliased corners)
- Full Zig SDF paint pipeline with 17 FFI exports
- Efficient layer compositing with dirty-flag optimization (zero I/O for unchanged layers)
- Comprehensive text input/editing (Input, Textarea with syntax highlighting, extmarks, keybindings)
- Solid focus management with Tab navigation
- Tree-sitter integration for real-time syntax highlighting
- Plugin slot system for extensibility
- Declarative hoverStyle/activeStyle for mouse interaction
- Unified token system (@tge/void)
- Markdown rendering with inline styling
- Unified diff viewer
- Selectable text mode for accessibility
- Floating/absolute positioning with 9-point attachment grid

### Critical Gaps (Compared to React + Tailwind + shadcn/ui)
1. **Animation system** -- completely absent; blocks many UI patterns
2. **Routing/Navigation** -- no way to manage screens or navigation stacks
3. **Form primitives** -- missing Select, Radio, Slider, Switch, validation
4. **Image component** -- infrastructure exists but no user-facing component
5. **Runtime theming** -- tokens are compile-time constants, no switching
6. **Global state** -- no createStore, no Context/Provider pattern
7. **Accessibility** -- no ARIA equivalent, no screen reader support
8. **Networking** -- no data fetching patterns
9. **CSS Grid** -- only flexbox layout
10. **Flex-wrap** -- workaround component only, not native
