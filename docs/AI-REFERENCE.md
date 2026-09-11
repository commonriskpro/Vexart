# Vexart — AI & LLM Technical Reference Manual
**Authoritative Machine-Readable Guide for AI Models, Autonomous Subagents, and Code Generators**

---

## 1. Context Primer & System Architecture

This document is the definitive technical manual for Large Language Models (LLMs), autonomous agents, and code generation systems building terminal applications with **Vexart**. 

Vexart is not a standard text-mode terminal library (such as `blessed` or `ink`), nor is it a web browser DOM. Vexart is a **pixel-native, GPU-accelerated terminal UI engine**. Applications are written in JSX using a SolidJS Universal Reconciler, laid out with sub-pixel precision using the Flexily engine (Flexbox & CSS Grid), and rasterized through native Rust/WGPU graphics pipelines directly to terminal windows supporting the Kitty Graphics Protocol (over POSIX Shared Memory, file transport, or direct APC streams).

### System Pipeline Architecture

```
JSX (SolidJS universal reconciler)
  │  Components run ONCE as factory setups; no Virtual DOM.
  ▼
TypeScript Scene Graph (retained Node tree)
  │  Fine-grained reactive updates patch Node properties directly.
  ▼
Flexily Layout Engine (packages/internal-flexily)
  │  Pure JS engine computing sub-pixel layout (Flexbox + CSS Grid).
  ▼
Render Graph Construction
  │  Compiles layout rectangles, MSDF text, and visual effects into paint queues.
  ▼
Rust/WGPU Native Rendering Boundary (native/libvexart via bun:ffi)
  │  Hardware-accelerated shader pipelines: rounded rects, drop shadows, outer glows,
  │  linear/radial gradients, and glassmorphic backdrop blurs.
  ▼
Kitty Presentation Protocol
     Emits GPU-rendered frames via POSIX Shared Memory (SHM), temporary file, or direct DCS.
```

### Critical Execution Invariant
The consumer barrel `vexart` and engine `vexart/engine` share a single universal reconciler instance. Code runs inside the **Bun** runtime with `--conditions=browser` and `--preload ./solid-plugin.ts` to execute JSX without a browser DOM.

---

## 2. Core Mental Model & Reactivity Rules

The primary reason AI code generators fail when writing Vexart code is applying **React mental models** instead of **SolidJS Universal Reconciler principles**.

### Rule 1: Components are Setup Factories, NOT Render Functions
In React, component functions re-run on every state change. In SolidJS / Vexart:
- Component functions execute **EXACTLY ONCE** when instantiated.
- State changes **DO NOT** re-execute the component body.
- Local variables assigned in the body snapshot values **once** and never update.

```tsx
// ❌ CATASTROPHIC REACT HALLUCINATION:
function BadCounter(props: { count: number }) {
  // Evaluated ONCE at mount. countValue stays forever at initial value!
  const countValue = props.count; 
  const doubled = countValue * 2; 

  return <Text>{doubled}</Text>;
}

// ✅ CORRECT SOLIDJS / VEXART PATTERN:
function GoodCounter(props: { count: number }) {
  // Use createMemo or direct accessor functions for derived state
  const doubled = createMemo(() => props.count * 2);

  return <Text>{doubled()}</Text>;
}
```

### Rule 2: NEVER Destructure Props
`props` in Vexart is a reactive Proxy object. Destructuring strips reactivity immediately.

```tsx
// ❌ CATASTROPHIC ERROR: Destructuring breaks reactivity
function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <Box>
      <Text>{title}</Text>
      <Text>{value}</Text>
    </Box>
  );
}

// ✅ CORRECT: Retain props reference or use splitProps
function MetricCard(props: { title: string; value: number }) {
  return (
    <Box>
      <Text>{props.title}</Text>
      <Text>{props.value}</Text>
    </Box>
  );
}
```

### Rule 3: NEVER Destructure `themeColors`
The Void theme system exports `themeColors`, an object backed by reactive getters. Reading `themeColors.background` inside JSX subscribes that specific visual property to theme updates. Destructuring snapshots the string value at execution time, permanently freezing dark mode.

```tsx
// ❌ CATASTROPHIC ERROR: themeColors destructured in module or function scope
import { themeColors } from "vexart";
const { background, foreground } = themeColors; // STATIC STRINGS FOREVER!

function ThemedBox() {
  // Will NEVER react to setTheme(lightTheme)
  return <Box backgroundColor={background}><Text color={foreground}>Hello</Text></Box>;
}

// ✅ CORRECT: Property access inside JSX prop expressions
import { themeColors } from "vexart";

function ThemedBox() {
  return (
    <Box backgroundColor={themeColors.background}>
      <Text color={themeColors.foreground}>Hello</Text>
    </Box>
  );
}
```

### Rule 4: Mandatory Declarative Control Flow (`<Show>`, `<For>`, `<Switch>`, `<Match>`)
Never use array `.map()` or inline ternary soup for structural DOM changes. SolidJS universal reconciler cannot diff unkeyed `.map()` arrays correctly, leading to node thrashing and memory leaks.

```tsx
import { For, Show, Switch, Match } from "vexart";

// ✅ Arrays: Always use <For>
<For each={items()}>
  {(item, index) => (
    <Box className="p-2 border border-border">
      <Text>{item.name} (Index: {index()})</Text>
    </Box>
  )}
</For>

// ✅ Conditionals: Always use <Show>
<Show when={isLoggedIn()} fallback={<Text>Please sign in</Text>}>
  <UserProfile user={currentUser()} />
</Show>

// ✅ Multi-branch conditionals: Always use <Switch> / <Match>
<Switch fallback={<Text>Status Unknown</Text>}>
  <Match when={status() === "loading"}><Text>Loading...</Text></Match>
  <Match when={status() === "error"}><Text>Error occurred</Text></Match>
  <Match when={status() === "success"}><Text>Success!</Text></Match>
</Switch>
```

### Rule 5: Lifecycle & Symmetrical Resource Cleanup
Use `onMount()` for initialization and `onCleanup()` for disposing timers, network connections, or event listeners.

```tsx
import { onMount, onCleanup, createSignal } from "vexart";

function Clock() {
  const [time, setTime] = createSignal(new Date().toLocaleTimeString());

  onMount(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    // Mandatory cleanup: prevents timer leaks on unmount
    onCleanup(() => clearInterval(timer));
  });

  return <Text>{time()}</Text>;
}
```

---

## 3. Element Taxonomy: Intrinsics vs App Primitives vs Hallucinations

Vexart has a strict two-layer element taxonomy. Mixing this up causes immediate compilation or reconciliation failure.

| Taxonomy Level | Source | Elements | Support `className`? | Description |
| :--- | :--- | :--- | :---: | :--- |
| **Engine Intrinsics** | `@vexart/engine` | `<box>`, `<text>`, `<img>` / `<image>`, `<canvas>` | **NO** | Native layout and rendering nodes. Accept only raw typed props. |
| **App Primitives** | `@vexart/app` / `"vexart"` | `<Box>`, `<Text>` | **YES** | Wrapper components mapping Tailwind-like utility classes to engine props. |
| **Headless Components** | `@vexart/headless` / `"vexart"` | `<ToggleSwitch>`, `<Select>`, `<Dialog>`, `<VirtualList>`, etc. | N/A | Unstyled behavior and keyboard/mouse interaction contracts. |
| **Styled Void Components**| `@vexart/styled` / `"vexart"` | `<Button>`, `<Card>`, `<VoidInput>`, `<VoidTabs>`, `<VoidDialog>`, etc. | **NO (Only App Primitives <Box> and <Text> support className; wrap Void components in <Box> if utility styling is needed)** | Pre-styled design system implementing the Void OLED theme. |

### ⛔ STRICTLY FORBIDDEN WEB HALLUCINATIONS
The reconciler has **NO HTML DOM**. The following tags **DO NOT EXIST** and will crash the reconciler:
- ❌ `<div>`, `<span>`, `<p>`, `<a>`, `<button>`, `<input>`, `<ul>`, `<li>`, `<table>`, `<tr>`, `<td>`, `<section>`, `<header>`, `<footer>`.
- ❌ Raw text inside `<box>`: `<box>Hello</box>` is **ILLEGAL**. All text strings **MUST** be enclosed in `<text>` or `<Text>`!
- ❌ Deleted legacy primitives: `<Span>`, `<RichText>`, `<WrapRow>`, `@vexart/primitives`. (Package `@vexart/primitives` was deleted and merged into `@vexart/app`).

```tsx
// ❌ RECONCILER CRASH:
<div>
  <span>Invalid HTML tag</span>
  <box>Raw text without text element will crash</box>
</div>

// ✅ CORRECT:
<Box className="flex-col">
  <Text>Valid primitive structure</Text>
</Box>
```

---

## 4. Layout System: Flexbox & 2D CSS Grid (Flexily Engine)

Vexart uses Flexily, an embedded sub-pixel layout engine supporting both Flexbox and full CSS Grid specifications.

### Default Layout Invariant: Vertical Flow
Unlike browser CSS (which defaults to `row`), Vexart containers default to `direction="column"`. For horizontal layout, you **MUST** explicitly specify `direction="row"` or `className="flex-row"`.

### 4.1 Flexbox Properties
Set on `<box>` or `<Box>` (or via `className`):
- `direction` / `flexDirection`: `"column" | "row"` (Default: `"column"`).
- `alignX` / `justifyContent`: `"left" | "center" | "right" | "space-between" | "flex-start" | "flex-end"`.
- `alignY` / `alignItems`: `"top" | "center" | "bottom" | "space-between" | "flex-start" | "flex-end"`.
- `gap`: `number` (gap between child elements in pixels).
- `padding`: `number` (uniform), or `paddingX`, `paddingY`, `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`.
- `margin`: `number` (uniform), or `marginX`, `marginY`, `marginLeft`, `marginRight`, `marginTop`, `marginBottom`.
- `width` / `height`: `number` (fixed pixels), `"grow"` (fill available), `"fit"` (shrink to content), or `"100%"` (percentage).
- `flexGrow`: `number` (e.g. `1` to expand).
- `flexShrink`: `number`.
- Sizing constraints: `minWidth`, `maxWidth`, `minHeight`, `maxHeight`.

### 4.2 2D CSS Grid System (Beta Profile)
Enable Grid by setting `layout="grid"` on the container.

#### Container Grid Props
- `layout`: Must be `"grid"`.
- `gridTemplateColumns`: Array of tracks. Supported track specifications:
  - Fixed pixels: `[200, 300]`
  - Fractional: `[{ fr: 1 }, { fr: 2 }]`
  - Percentage: `[{ percent: 50 }, { percent: 50 }]`
  - Intrinsic: `"auto"`, `"min-content"`, `"max-content"`
  - Bounds: `[{ minmax: [100, { fr: 1 }] }]`
  - Fit Content: `[{ fitContent: 250 }]`
  - Repeated tracks: `[{ repeat: { count: 3, tracks: [{ fr: 1 }] } }]` or `count: "auto-fill" | "auto-fit"`
- `gridTemplateRows`: Same track format as columns.
- `gridAutoColumns` / `gridAutoRows`: Track size for implicitly created tracks.
- `gridAutoFlow`: `"row" | "column" | "row-dense" | "column-dense"`.
- `gridTemplateAreas`: 2D array of area name strings (or `null` for empty cells):
  ```tsx
  gridTemplateAreas={[
    ["header", "header"],
    ["sidebar", "main"],
    ["footer", "footer"]
  ]}
  ```
- Alignment Props:
  - Content distribution: `justifyContent`, `alignContent` (`"start" | "end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch"`).
  - Item alignment: `justifyItems`, `alignItems` (`"start" | "end" | "center" | "stretch"`).

#### Item Placement Props
Child nodes placed in a Grid container can use:
- `gridColumn`: `{ start: 1, end: 3 }` or `{ start: { span: 2 } }`.
- `gridRow`: `{ start: 1, end: 2 }` or `{ start: 2, end: 4 }`.
- `gridArea`: String matching a template area name (`"header"`), or four-line object:
  `{ rowStart: 1, columnStart: 1, rowEnd: 2, columnEnd: 3 }`.
- `justifySelf` / `alignSelf`: Per-item alignment overrides (`"start" | "end" | "center" | "stretch"`).

```tsx
<Box
  layout="grid"
  width="100%"
  height={600}
  gridTemplateColumns={[240, { fr: 1 }]}
  gridTemplateRows={[60, { fr: 1 }, 40]}
  gridTemplateAreas={[
    ["header", "header"],
    ["nav", "content"],
    ["footer", "footer"]
  ]}
  gap={12}
>
  <Box gridArea="header" backgroundColor="#171717" padding={12}>
    <Text fontSize={18} fontWeight={700}>Header</Text>
  </Box>
  <Box gridArea="nav" backgroundColor="#1a1a1a" padding={12}>
    <Text>Navigation</Text>
  </Box>
  <Box gridArea="content" backgroundColor="#0f0f0f" padding={16}>
    <Text>Main Content</Text>
  </Box>
  <Box gridArea="footer" backgroundColor="#171717" padding={8}>
    <Text fontSize={12} color="#a3a3a3">Status: Ready</Text>
  </Box>
</Box>
```

### 4.3 Floating Elements (Out-of-Flow Overlays)
For tooltips, context menus, floating badges, or dialogs, elements can be positioned out of normal flex/grid flow without altering sibling coordinates:
- `floating`: `"parent"` (relative to parent box), `"root"` (relative to terminal screen root), or `{ attachTo: string }` (attached to a target node ID).
- `floatOffset`: `{ x: number, y: number }` (pixel offset).
- `floatAttach`: `{ element?: number, parent?: number }` using the 3x3 anchor grid (0: top-left, 4: center, 8: bottom-right).
- `zIndex`: `number` (layer stacking order).
- `viewportClip`: `boolean` (clips to terminal screen boundary; defaults to `true`).
- `pointerPassthrough`: `boolean` (allows clicks to pass through to underlying elements).

---

## 5. Styling & Theming (`className` and Tokens)

The `@vexart/app` package provides `<Box>` and `<Text>` primitives that parse Tailwind-like utility class strings at runtime with fast caching.

### 5.1 Supported Tailwind Utility Classes
- **Spacing**:
  - Padding: `p-0` through `p-10`, `px-4`, `py-2`, `pt-2`, `pr-2`, `pb-2`, `pl-2`.
  - Margin: `m-0` through `m-10`, `mx-4`, `my-2`, `mt-2`, `mr-2`, `mb-2`, `ml-2`.
  - Gap: `gap-1` through `gap-8`.
- **Sizing**:
  - `w-full` (`100%`), `w-fit` (`"fit"`), `w-grow` (`"grow"`), `w-16`, `w-32`, `w-64`.
  - `h-full`, `h-fit`, `h-grow`, `h-16`, `h-32`, `h-64`.
  - Constraints: `min-w-32`, `max-w-64`, `min-h-16`, `max-h-64`.
- **Flexbox**:
  - Direction: `flex-row`, `flex-col` / `flex`.
  - Alignment: `items-start`, `items-center`, `items-end`, `justify-start`, `justify-center`, `justify-end`, `justify-between`.
  - Flex behavior: `grow`, `grow-0`, `shrink`, `shrink-0`.
- **Colors & Surfaces**:
  - Background: `bg-background`, `bg-card`, `bg-primary`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-destructive`, `bg-transparent`, `bg-black`, `bg-white`.
  - Text: `text-foreground`, `text-card-foreground`, `text-primary-foreground`, `text-secondary-foreground`, `text-muted`, `text-muted-foreground`, `text-accent-foreground`, `text-destructive`.
  - Border color: `border-border`, `border-input`, `border-ring`, `border-primary`.
  - Border width: `border` (1px), `border-0`, `border-2`, `border-4`.
- **Typography**:
  - Font sizes: `text-xs` (10px), `text-sm` (12px), `text-base` (14px), `text-lg` (16px), `text-xl` (20px), `text-2xl` (24px), `text-3xl` (30px), `text-4xl` (36px).
  - Weights: `font-normal` (400), `font-medium` (500), `font-semibold` (600), `font-bold` (700).
- **Corners (Border Radius)**:
  - `rounded-none` (0), `rounded-sm` (6px), `rounded` / `rounded-md` (8px), `rounded-lg` (10px), `rounded-xl` (14px), `rounded-2xl` (18px), `rounded-full` (9999px).
- **Interactive Pseudo-states**:
  - Hover: `hover:bg-accent`, `hover:border-primary`, `hover:text-foreground`.
  - Active: `active:bg-muted`, `active:opacity-80`.
  - Focus: `focus:border-ring`, `focus:bg-accent`.
- **Effects & Compositing**:
  - Shadows: `shadow-xs`, `shadow-sm`, `shadow` / `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-none`.
  - Glows: `glow-ring`, `glow-destructive`, `glow-success`, `glow-none`.
  - Glassmorphic backdrop blur: `backdrop-blur` (8px), `backdrop-blur-sm` (8px), `backdrop-blur-md` (12px), `backdrop-blur-lg` (16px), `backdrop-blur-xl` (24px).
  - Overflow: `overflow-x-scroll`, `overflow-y-scroll`, `overflow-scroll`.
  - Layer promotion: `layer`.
  - Z-Index: `z-0` through `z-50`.

### 5.2 OLED Void Design System Tokens & Theming
Vexart includes an OLED-black design system (`@vexart/styled`).

```typescript
import { colors, themeColors, setTheme, darkTheme, lightTheme, createTheme } from "vexart";

// Static default color tokens
colors.background      // "#0a0a0a" (near OLED black)
colors.foreground      // "#fafafa"
colors.card            // "#171717"
colors.primary         // "#e5e5e5"
colors.border          // "#ffffff25"
colors.ring            // "#737373"

// Reactive getters:
themeColors.background // Reads an active SolidJS signal under the hood!

// Runtime theme switching:
// Subscribed components update immediately without reloading or unmounting
setTheme(lightTheme);
setTheme(darkTheme);

// Creating a customized theme:
const customTheme = createTheme({
  colors: {
    background: "#050510",
    primary: "#6366f1",
    card: "#0f0f23",
  }
});
setTheme(customTheme);
```

### 5.3 Native GPU Visual Effects (Props API)
For fine-grained effect control, apply props directly to `<box>` or `<Box>`:

```tsx
<Box
  // Drop Shadow
  shadow={{ x: 0, y: 8, blur: 24, color: 0x00000080 }}
  
  // Outer Glow
  glow={{ radius: 24, color: 0x56d4c8ff, intensity: 50 }}
  
  // Linear / Radial Gradients (RGBA hex numbers: 0xRRGGBBAA)
  gradient={{
    type: "linear",
    from: 0x1e1b4bff,
    to: 0x0f172aff,
    angle: 135
  }}
  
  // Glassmorphic Backdrop Filter
  backdropBlur={16}
  backdropBrightness={110}
  backdropContrast={120}
  
  // Per-corner radius
  cornerRadii={{ tl: 16, tr: 16, br: 4, bl: 4 }}
/>
```

---

## 6. Interaction, Events, Focus & Scrolling

### 6.1 Event Propagation (`onPress` vs Low-Level Mouse)
Vexart maintains a clean separation between high-level synthetic action events and raw pointer events:

1. **`onPress` (Bubbles)**:
   - Dispatched when a node is clicked with the mouse (pointer press + release inside bounds) **OR** when the node has focus and the user presses `Enter` or `Space`.
   - Bubbles up the ancestor tree. Call `event.stopPropagation()` to halt propagation.
2. **Raw Pointer Callbacks (DO NOT Bubble)**:
   - `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`.
   - Dispatched directly to the target hit node.
   - Receive `NodeMouseEvent: { x, y, nodeX, nodeY, width, height }`.
     - `x, y`: Screen absolute pixel coordinates.
     - `nodeX, nodeY`: Relative to the node's top-left corner.
     - `width, height`: Rendered dimensions of the node.
3. **Pointer Capture**:
   - `setPointerCapture(nodeId)` locks all mouse movement and release events to the target node until `releasePointerCapture(nodeId)` or button release. Essential for sliders and dragging.

```tsx
<Box
  focusable
  onPress={(e) => {
    e?.stopPropagation(); // Prevent parent container from catching press
    console.log("Button clicked or Enter/Space pressed!");
  }}
  onMouseDown={(e) => {
    // Relative coordinates inside node
    console.log(`Mouse down at ${e.nodeX}px, ${e.nodeY}px`);
  }}
/>
```

### 6.2 Focus Contracts & Keyboard Navigation
Vexart features an integrated keyboard focus runtime:
- `focusable={true}`: Adding this prop automatically registers the node in the focus ring.
- `Tab` / `Shift+Tab`: Cycles through registered focusable elements.
- `focusStyle`: Declarative visual overrides applied automatically when focused (e.g. `focusStyle={{ borderColor: themeColors.ring, borderWidth: 1 }}`).
- `useFocus()`: Hook for programmatic control:
  ```tsx
  import { useFocus } from "vexart";

  const searchFocus = useFocus({
    id: "search-input",
    onKeyDown: (e) => {
      if (e.key === "Escape") searchFocus.focus();
    }
  });

  // Check state: searchFocus.focused()
  // Trigger focus: searchFocus.focus()
  ```
- **Modal Focus Trapping (`pushFocusScope`)**:
  When opening modal dialogs, isolate focus so `Tab` cannot escape into background elements:
  ```tsx
  import { pushFocusScope } from "vexart";

  // pushFocusScope creates a new focus scope and returns a disposer closure (popScope)
  const popScope = pushFocusScope();
  // Later (e.g. on modal close or unmount):
  popScope();
  ```
  Note that there is no separate `popFocusScope` function; calling the returned disposer closure restores the previous focus scope.

### 6.3 Keyboard Handling
Focused nodes receive `onKeyDown(event: KeyEvent)`.
- Key identifiers: `"Enter"`, `"Escape"`, `"Tab"`, `"Backspace"`, `"ArrowUp"`, `"ArrowDown"`, `"ArrowLeft"`, `"ArrowRight"`, `"a"`, `"1"`, etc.
- Modifiers in `event.mods`: `event.mods.ctrl`, `event.mods.shift`, `event.mods.alt`, `event.mods.meta`.

### 6.4 Scrolling & Viewport Clipping
Enable scrolling on containers by setting `scrollX={true}` or `scrollY={true}`:
- Containers automatically scissor-clip children to their bounding box.
- Interactive elements outside the scroll viewport are automatically culled from hit-testing.
- Programmatic control:
  ```tsx
  import { createScrollHandle } from "vexart";

  const scroller = createScrollHandle("my-scroll-list");
  // In JSX:
  <Box scrollY scrollId="my-scroll-list" height={300}>
    {/* Large content */}
  </Box>

  // Programmatic scroll (takes a single numeric vertical offset `y: number`):
  scroller.scrollTo(500); // Scroll to 500px vertically
  scroller.scrollBy(50);   // Scroll down by 50px
  ```
  Note that `scrollTo` and `scrollBy` take a single numeric vertical offset `y: number` (or `dy: number`).

---

## 7. Unified Barrel Imports & Collision Rules

All application-level dependencies should be imported directly from `"vexart"`.

```typescript
import {
  // App Lifecycle & Core Primitives
  createApp,
  mountApp,
  Page,
  Box,                 // App primitive with className support (@vexart/app)
  Text,                // App primitive with className support (@vexart/app)

  // OLED Void Themed Components (@vexart/styled)
  Button,              // Themed Button (wins collision over headless Button)
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge,
  Avatar,
  Separator,
  Skeleton,
  VoidInput,
  VoidTextarea,
  VoidCheckbox,
  VoidSwitch,
  VoidRadioGroup,
  VoidSelect,
  VoidCombobox,
  VoidSlider,
  VoidProgress,
  VoidTabs,
  VoidTable,
  VoidDialog, VoidDialogTitle, VoidDialogDescription, VoidDialogFooter,
  VoidTooltip,
  VoidCode,
  VoidMarkdown,
  VoidList,
  VoidVirtualList,
  VoidScrollView,
  createVoidToaster,

  // Theme Tokens & Runtime
  colors, radius, space, font, weight, shadows, glows,
  themeColors, setTheme, getTheme, darkTheme, lightTheme, createTheme,

  // Headless Components (@vexart/headless)
  ToggleSwitch,        // Headless Switch renamed to avoid colliding with SolidJS Switch!
  VirtualList,
  createForm,
  createToaster,

  // App Router (@vexart/app)
  createAppRouter,
  RouteOutlet,
  RouterProvider,
  useRouter,

  // Engine Hooks & Utilities (@vexart/engine)
  useTerminalDimensions,
  useFocus,
  setFocus,
  focusedId,
  pushFocusScope,
  useKeyboard,
  useMouse,
  useInput,
  onInput,
  RGBA,

  // SolidJS Reactivity & Control Flow
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  batch,
  untrack,
  For,
  Show,
  Switch,              // SolidJS Control Flow Switch
  Match,
  Index,
  ErrorBoundary
} from "vexart";
```

### Collision Resolution Rules
1. `Box` and `Text`: Exported from `@vexart/app` (supporting `className`).
2. `Button`: Exported from `@vexart/styled` (themed Void button).
3. `ToggleSwitch`: Headless switch is renamed to `ToggleSwitch` to prevent collision with SolidJS `<Switch>`.
4. `useRouter`: Exported from `@vexart/app` (app-level router).

---

## 8. Four Production-Grade Architectural Templates

The following four templates are complete, syntactically verified, and copy-paste ready for immediate production deployment.

### Template 1: Minimal Standalone CLI Application
A complete standalone interactive CLI tool featuring counter state, key bindings, quit handling, and terminal auto-sizing.

```tsx
import { createApp, Box, Text, Button, createSignal } from "vexart";

function CounterApp() {
  const [count, setCount] = createSignal(0);

  return (
    <Box className="w-full h-full p-8 flex-col items-center justify-center bg-background">
      <Box className="p-6 bg-card rounded-xl border border-border flex-col items-center gap-4 shadow-lg">
        <Text className="text-xl font-bold text-foreground">
          Vexart Minimal CLI Counter
        </Text>
        <Text className="text-4xl font-bold text-primary">
          {count()}
        </Text>
        <Box className="flex-row gap-3 mt-2">
          <Button
            variant="default"
            onPress={() => setCount((c) => c + 1)}
          >
            Increment (+1)
          </Button>
          <Button
            variant="secondary"
            onPress={() => setCount((c) => c - 1)}
          >
            Decrement (-1)
          </Button>
          <Button
            variant="outline"
            onPress={() => setCount(0)}
          >
            Reset
          </Button>
        </Box>
        <Text className="text-xs text-muted-foreground mt-4">
          Press Tab to navigate buttons • Enter/Space to activate • Press 'q' or Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
}

// Entry point with terminal lifecycle management
await createApp(() => <CounterApp />, {
  quit: ["ctrl+c", "q"],
});
```

---

### Template 2: Interactive Form with Validation and Focus Management
A production form utilizing `createForm` from `@vexart/headless`, styled Void inputs, error messaging, and keyboard submission.

```tsx
import {
  createApp,
  Box,
  Text,
  Button,
  VoidInput,
  VoidCheckbox,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  createForm,
  createSignal,
  Show
} from "vexart";

function FormApp() {
  const [submittedData, setSubmittedData] = createSignal<string | null>(null);

  const form = createForm({
    initialValues: {
      username: "",
      email: "",
      terms: false,
    },
    validate: {
      username: (val) => {
        if (!val || val.trim().length === 0) return "Username is required";
        if (val.length < 3) return "Username must be at least 3 characters";
        return undefined;
      },
      email: (val) => {
        if (!val || val.trim().length === 0) return "Email is required";
        if (!val.includes("@") || !val.includes(".")) return "Invalid email address";
        return undefined;
      },
      terms: (val) => {
        if (!val) return "You must accept the terms";
        return undefined;
      },
    },
    onSubmit: (values) => {
      setSubmittedData(JSON.stringify(values, null, 2));
    },
  });

  return (
    <Box className="w-full h-full p-8 flex-col items-center justify-center bg-background">
      <Box className="w-96">
        <Card>
          <CardHeader>
            <CardTitle>User Registration</CardTitle>
            <CardDescription>Enter details to create an account</CardDescription>
          </CardHeader>

          <CardContent>
            <Box className="flex-col gap-4">
              {/* Username Field */}
              <Box className="flex-col gap-1">
                <Text className="text-sm font-medium text-foreground">Username</Text>
                <VoidInput
                  value={form.values.username()}
                  onChange={(val) => form.setValue("username", val)}
                  placeholder="johndoe"
                />
                <Show when={form.errors.username()}>
                  <Text className="text-xs text-destructive">{form.errors.username()}</Text>
                </Show>
              </Box>

              {/* Email Field */}
              <Box className="flex-col gap-1">
                <Text className="text-sm font-medium text-foreground">Email Address</Text>
                <VoidInput
                  value={form.values.email()}
                  onChange={(val) => form.setValue("email", val)}
                  placeholder="john@example.com"
                />
                <Show when={form.errors.email()}>
                  <Text className="text-xs text-destructive">{form.errors.email()}</Text>
                </Show>
              </Box>

              {/* Terms Checkbox */}
              <Box className="flex-row items-center gap-2 mt-2">
                <VoidCheckbox
                  checked={form.values.terms()}
                  onChange={(checked) => form.setValue("terms", checked)}
                />
                <Text className="text-sm text-foreground">I accept the service agreement</Text>
              </Box>
              <Show when={form.errors.terms()}>
                <Text className="text-xs text-destructive">{form.errors.terms()}</Text>
              </Show>
            </Box>
          </CardContent>

          <CardFooter>
            <Box className="flex-row justify-between items-center w-full">
              <Button variant="outline" onPress={() => form.reset()}>
                Reset
              </Button>
              <Button variant="default" onPress={() => form.submit()}>
                Submit Registration
              </Button>
            </Box>
          </CardFooter>
        </Card>
      </Box>

      <Show when={submittedData()}>
        <Box className="mt-4 p-4 bg-card rounded-lg border border-border flex-col gap-1">
          <Text className="text-xs font-semibold text-primary">Form Submitted Successfully:</Text>
          <Text className="text-xs text-muted-foreground">{submittedData()!}</Text>
        </Box>
      </Show>
    </Box>
  );
}

await createApp(() => <FormApp />, { quit: ["ctrl+c"] });
```

---

### Template 3: 2D Operational Dashboard (CSS Grid & Signals)
A complex operations center UI using CSS Grid layouts, real-time simulated telemetry signals, tabbed views, and status badges.

```tsx
import {
  createApp,
  Box,
  Text,
  Badge,
  VoidTabs,
  createSignal,
  onMount,
  onCleanup,
  For,
  themeColors
} from "vexart";

function DashboardApp() {
  const [activeTab, setActiveTab] = createSignal(0);
  const [cpuUsage, setCpuUsage] = createSignal(24);
  const [memUsage, setMemUsage] = createSignal(58);
  const [requestsPerSec, setRequestsPerSec] = createSignal(1240);
  
  const [logs, setLogs] = createSignal<string[]>([
    "[10:00:01] System boot complete. GPU pipeline initialized.",
    "[10:00:04] Transport connected via POSIX SHM.",
    "[10:00:12] Ingress proxy healthy: 0 errors reported.",
  ]);

  onMount(() => {
    const interval = setInterval(() => {
      setCpuUsage(Math.floor(20 + Math.random() * 50));
      setMemUsage(Math.floor(55 + Math.random() * 10));
      setRequestsPerSec(Math.floor(1200 + Math.random() * 300));
      
      if (Math.random() > 0.6) {
        const time = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev.slice(-6), `[${time}] Heartbeat ack: nodes in sync`]);
      }
    }, 1500);

    onCleanup(() => clearInterval(interval));
  });

  return (
    <Box
      layout="grid"
      width="100%"
      height="100%"
      gridTemplateColumns={[260, { fr: 1 }]}
      gridTemplateRows={[50, { fr: 1 }, 30]}
      gridTemplateAreas={[
        ["header", "header"],
        ["sidebar", "content"],
        ["footer", "footer"]
      ]}
      gap={8}
      className="p-3 bg-background"
    >
      {/* Header Area */}
      <Box gridArea="header" className="px-4 flex-row items-center justify-between bg-card rounded-lg border border-border">
        <Box className="flex-row items-center gap-3">
          <Text className="text-base font-bold text-foreground">CLUSTER CONTROL MATRIX</Text>
          <Badge variant="outline">REGION: US-EAST-1</Badge>
        </Box>
        <Box className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">SHM Transport:</Text>
          <Badge variant="default">ONLINE</Badge>
        </Box>
      </Box>

      {/* Sidebar Area */}
      <Box gridArea="sidebar" className="p-4 flex-col gap-4 bg-card rounded-lg border border-border">
        <Text className="text-sm font-semibold text-foreground">METRICS OVERVIEW</Text>
        
        <Box className="flex-col gap-1 p-3 bg-background rounded border border-border">
          <Text className="text-xs text-muted-foreground">CPU UTILIZATION</Text>
          <Text className="text-xl font-bold text-primary">{cpuUsage()}%</Text>
        </Box>

        <Box className="flex-col gap-1 p-3 bg-background rounded border border-border">
          <Text className="text-xs text-muted-foreground">MEMORY RESIDENT</Text>
          <Text className="text-xl font-bold text-foreground">{memUsage()}%</Text>
        </Box>

        <Box className="flex-col gap-1 p-3 bg-background rounded border border-border">
          <Text className="text-xs text-muted-foreground">INGRESS RATE</Text>
          <Text className="text-xl font-bold text-foreground">{requestsPerSec()} req/s</Text>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box gridArea="content" className="p-4 flex-col gap-4 bg-card rounded-lg border border-border">
        <VoidTabs
          activeTab={activeTab()}
          onTabChange={setActiveTab}
          tabs={[
            {
              label: "Live Cluster Logs",
              content: () => (
                <Box className="flex-col gap-2 mt-2 p-3 bg-background rounded border border-border h-64 overflow-y-scroll">
                  <For each={logs()}>
                    {(log) => <Text className="text-xs font-medium text-muted-foreground">{log}</Text>}
                  </For>
                </Box>
              ),
            },
            {
              label: "Service Nodes",
              content: () => (
                <Box className="flex-col gap-2 mt-2">
                  <Text className="text-sm text-foreground">Active Workloads: 14 pods across 3 worker nodes.</Text>
                  <Text className="text-xs text-muted-foreground">All nodes passing deep health checks.</Text>
                </Box>
              ),
            },
          ]}
        />
      </Box>

      {/* Footer Area */}
      <Box gridArea="footer" className="px-4 flex-row items-center justify-between bg-card rounded border border-border">
        <Text className="text-xs text-muted-foreground">Vexart Kernel Engine • Native Pipeline</Text>
        <Text className="text-xs text-muted-foreground">Press 'q' to disconnect</Text>
      </Box>
    </Box>
  );
}

await createApp(() => <DashboardApp />, { quit: ["ctrl+c", "q"] });
```

---

### Template 4: Modal Dialog with Focus Trap & Backdrop Blur
A modal dialog pattern demonstrating glassmorphic backdrop blur, focus trapping (`pushFocusScope`), and Escape key dismissal.

```tsx
import {
  createApp,
  Box,
  Text,
  Button,
  VoidDialog,
  VoidDialogTitle,
  VoidDialogDescription,
  VoidDialogFooter,
  createSignal,
  Show,
  onCleanup,
  pushFocusScope
} from "vexart";

function ConfirmPurgeDialog(props: { onClose: () => void; onConfirm: () => void }) {
  // Push a focus scope so Tab only cycles within this dialog; pop on unmount
  const popScope = pushFocusScope();
  onCleanup(() => popScope());

  return (
    <VoidDialog onClose={props.onClose} width={420}>
      <VoidDialogTitle>Confirm Destructive Action</VoidDialogTitle>
      <VoidDialogDescription>
        Are you sure you want to purge cache node storage? This operation cannot be
        undone and will temporarily degrade throughput.
      </VoidDialogDescription>

      <VoidDialogFooter>
        <Button
          variant="outline"
          onPress={props.onClose}
        >
          Cancel (Esc)
        </Button>
        <Button
          variant="destructive"
          onPress={() => {
            props.onConfirm();
            props.onClose();
          }}
        >
          Confirm Purge
        </Button>
      </VoidDialogFooter>
    </VoidDialog>
  );
}

function ModalDemoApp() {
  const [modalOpen, setModalOpen] = createSignal(false);
  const [actionConfirmed, setActionConfirmed] = createSignal(false);

  return (
    <Box className="w-full h-full p-8 flex-col items-center justify-center bg-background">
      <Box className="p-8 bg-card rounded-xl border border-border flex-col items-center gap-4">
        <Text className="text-lg font-bold text-foreground">
          System Action Center
        </Text>
        <Text className="text-sm text-muted-foreground">
          Modals automatically trap Tab focus and dismiss on Escape or overlay click.
        </Text>
        <Button variant="destructive" onPress={() => setModalOpen(true)}>
          Purge Storage Node
        </Button>

        <Show when={actionConfirmed()}>
          <Text className="text-xs text-primary mt-2">
            Status: Storage node purge command acknowledged.
          </Text>
        </Show>
      </Box>

      {/* Modal Dialog with Explicit Focus Scoping & Glassmorphic Blur */}
      <Show when={modalOpen()}>
        <ConfirmPurgeDialog
          onClose={() => setModalOpen(false)}
          onConfirm={() => setActionConfirmed(true)}
        />
      </Show>
    </Box>
  );
}

await createApp(() => <ModalDemoApp />, { quit: ["ctrl+c"] });
```

---

## 9. AI Pitfalls & Anti-Patterns Matrix

The following matrix documents the most frequent critical hallucinations made by AI systems when writing Vexart code. Check every generated snippet against this table before finalizing output.

| # | Anti-Pattern / Hallucination | Root-Cause Reason AIs Do It | Catastrophic Failure Symptom | Architectural Fix |
| :- | :--- | :--- | :--- | :--- |
| **1** | `const { background } = themeColors;` | Treating `themeColors` as a static JSON dictionary. | Color strings snapshot once; `setTheme()` never changes color. | Read properties directly in JSX: `<Box backgroundColor={themeColors.background}>` |
| **2** | `const { title, count } = props;` | React habits where props are plain objects. | Reactivity severed; changes to `props.count` will not re-render. | Access via `props.title`, `props.count`, or use `splitProps(props, [...])`. |
| **3** | `<div>`, `<span>`, `<p>`, `<button>` | Web DOM muscle memory. | Reconciler throws unknown intrinsic element exception immediately. | Use `<Box>` and `<Text>` from `"vexart"` (or `<box>` and `<text>`). |
| **4** | `<box>Hello World</box>` | HTML allows text directly inside container tags. | Reconciler crash: `<box>` only accepts element children, not text. | Always wrap text strings in `<Text>` or `<text>`. |
| **5** | `items.map(item => <Box>...)` | React array mapping pattern. | Loss of key reconciliation, leaks on update, broken re-ordering. | Always use `<For each={items()}>{(item) => ...}</For>`. |
| **6** | `useState(0)`, `useEffect(...)` | React Hook hallucination. | Runtime ReferenceError: `useState` is not defined. | Use SolidJS primitives: `createSignal(0)`, `createEffect(...)`. |
| **7** | `onClick={() => ...}` | Web DOM event naming. | Prop ignored or fails to bubble; Enter/Space will not activate. | Use `onPress={() => ...}` for interactive buttons and clickable boxes. |
| **8** | Expecting `<Span>`, `<RichText>`, `<WrapRow>` | Outdated documentation or deleted packages (`@vexart/primitives`). | Module not found or export undefined. | Use `<Box>` and `<Text>` with Flexbox props or `className`. |
| **9** | Forgetting `focusable={true}` on custom interactive `<box>` | Assuming all elements with click handlers receive keyboard focus. | Tab key skips the element completely; inaccessible via keyboard. | Add `focusable={true}` (or `focusable`) to any element handling `onKeyDown` / `onPress`. |
| **10**| Dynamic `itemHeight` in `VirtualList` | CSS flex assumption that items can have variable heights. | Virtual scroll calculation corrupts viewport indexing and jitters. | Provide fixed numeric `itemHeight: number` (e.g. `itemHeight={32}`). |
| **11**| Passing raw CSS strings (`style="display: flex"`) | Browser CSS habits. | Reconciler ignores string styles or throws type error. | Use `className` utility classes (`className="flex-row p-4"`) or typed props. |
| **12**| Destructively mutating themes: `themeColors.background = "#fff"` | Assuming state is directly mutable. | Throws in strict mode or causes silent failure (read-only getter). | Use `setTheme(createTheme({ colors: { background: "#fff" } }))`. |
| **13**| Passing pixel coordinates to DevTools MCP mouse tools | Assuming terminal coordinates equal rendered pixel resolution. | Clicks land miles off-target. | DevTools `vexart_click` takes 1-based **cell column and row** coordinates (`col`, `row`). |
| **14**| Omitting `onCleanup` for intervals/subscriptions | Relying on garbage collection or component re-renders. | Severe memory leaks and background zombie CPU utilization. | Always register disposal via `onCleanup(() => unsub())`. |
