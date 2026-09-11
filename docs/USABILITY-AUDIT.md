# Vexart Usability, Developer Experience (DX) & Architectural Quality Audit

**Version:** 0.10.0-beta.2  
**Date:** September 2026  
**Auditor:** Senior Architect (Quality & DX Task Force)  
**Status:** Complete / Authoritative  
**Scope:** `@vexart/engine`, `@vexart/app`, `@vexart/headless`, `@vexart/styled`, Distribution Bundles, Type Definitions, Documentation & Developer Tooling  

---

## 1. Executive Summary

### 1.1 High-Level Developer Experience (DX) Posture

Vexart represents a monumental technical achievement in the terminal computing space. By coupling a Rust-based native GPU pipeline (WGPU, Kitty graphics protocol, direct SHM transport) with a TypeScript scene graph driven by SolidJS universal fine-grained reactivity and Flexily flexbox/grid layout, Vexart delivers 60fps browser-grade UI rendering in the terminal.

However, an audit of the developer-facing surface reveals a sharp divergence between **engine-level graphical capabilities** and **application-level developer ergonomics**. While the low-level rendering architecture is robust and performant, the framework currently suffers from compounding developer-experience traps:
- **Export & Ergonomic Fragmentation:** Inconsistent package boundaries, shadowed exports, asymmetric naming conventions (`VoidInput` vs `Button`), and missing foundational utilities in the root `"vexart"` barrel force developers into guesswork or deep import diving.
- **Silent Failures & Deceptive APIs:** Intrinsic elements silently ignore common web patterns (e.g. `onClick`, raw text in `<box>`, CSS units like `"100px"` or `"auto"`), degrading layouts or interactivity with zero runtime warnings or compile-time errors.
- **Focus Subsystem Desynchronization:** An architectural conflict between reactive hooks (`useFocus`) and declarative JSX attributes (`<box focusable>`) causes double-registration bugs, breaking keyboard tab cycles and visual focus rings across basic controls.
- **Reactivity Degradation in Theming:** Getter-based reactive color tokens silently decouple from SolidJS reactivity when destructured using standard JavaScript patterns, while `ThemeProvider` incorrectly mutates global state, rendering subtree theming impossible.
- **Documentation & Ghost Artifact Drift:** Purged historical primitives (`Span`, `RichText`, `WrapRow`) remain documented across the official website and type declaration files, giving developers obsolete instructions that fail at runtime.

### 1.2 Architectural Strengths
- **Fine-Grained Reactivity (Zero-VDOM):** Direct DOM-less retained scene nodes reconciled via `@solid-js/universal` ensure updates execute with minimal CPU overhead without dirty-checking entire component trees.
- **True Retained GPU Acceleration:** GPU pipelines handle multi-box shadows, corner-radius antialiasing, backdrop blurs, glow shaders, and image rendering directly on the GPU without CPU software rasterization overhead.
- **Pure-JS Layout Parity (Flexily):** Full Yoga-compatible flexbox and 2D grid support executed synchronously in TypeScript eliminates layout FFI roundtrips while preserving CSS specifications.
- **Zero-Flicker Transport:** Smart terminal capability probing, Kitty graphics protocol protocol streams, and shared memory (SHM) buffers prevent terminal tearing.

### 1.3 Audit Findings Dashboard

| Category | Critical | High | Medium | Low | Total |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Barrel & Package Export Ergonomics** | 0 | 2 | 2 | 1 | **5** |
| **2. Prop Ergonomics & DX Traps** | 1 | 2 | 0 | 0 | **3** |
| **3. Reactivity & Theming Usability** | 0 | 2 | 0 | 0 | **2** |
| **4. Events, Focus & Keyboard Usability** | 2 | 1 | 1 | 0 | **4** |
| **5. Layout & Sizing Usability** | 0 | 1 | 1 | 0 | **2** |
| **6. Dead Code, Ghost Types & Docs Baggage** | 0 | 1 | 1 | 0 | **2** |
| **Total Findings** | **3** | **9** | **5** | **1** | **18** |

---

## 2. Itemized Audit Inventory (18 Detailed Findings)

### Category 1: Barrel & Package Export Ergonomics

---

#### DEF-01: Headless `Button` and `ButtonRenderContext` Completely Shadowed in `"vexart"` Barrel

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/app/src/barrel.ts:166`, `packages/app/src/barrel.ts:250`, `packages/app/src/barrel.ts:252`
- **Target Invariant:** Unified public API barrel must expose both high-level themed components and low-level headless primitives without collision or total shadowing.

##### Problem Statement & Root Cause
In `packages/app/src/barrel.ts`, the unified barrel imports and re-exports `Button` and `ButtonProps` from `@vexart/styled`:
```ts
// packages/app/src/barrel.ts:166
export {
  Avatar,
  Badge,
  Button, // <-- @vexart/styled Button
  Card,
  ...
} from "@vexart/styled"

// packages/app/src/barrel.ts:250
export type { ButtonProps } from "@vexart/styled"

// packages/app/src/barrel.ts:252
// ── Headless components (unstyled — excluding Button which collides) ─────────
export {
  Checkbox,
  Combobox,
  // Button is excluded!
  Input,
  ...
} from "@vexart/headless"
```
Because `@vexart/styled` exports an opinionated, pre-themed `<Button>` component, the headless `<Button>` from `@vexart/headless` is completely excluded from the root export surface. Furthermore, `ButtonRenderContext` (the foundational type needed to author custom headless button render functions) is omitted entirely from the type re-exports in `packages/app/src/barrel.ts:280-350`.

##### Developer Experience Impact
Developers who want to build a bespoke button with unique layout, animation, or iconography cannot import `{ Button as HeadlessButton, ButtonRenderContext } from "vexart"`. When following headless component documentation, importing `Button` from `"vexart"` provides the styled component instead of the headless one. Developers are forced to either abandon the unified barrel and import directly from `@vexart/headless`, or manually implement keyboard and press states.

##### Recommendation
Export headless components with an explicit, uncollided alias in `barrel.ts`:
```ts
export {
  Button as HeadlessButton,
} from "@vexart/headless"
export type {
  ButtonRenderContext,
  ButtonProps as HeadlessButtonProps,
} from "@vexart/headless"
```

---

#### DEF-02: Asymmetric Naming Convention: `VoidInput`/`VoidSelect` vs. Unprefixed `Button`/`Card`

- **Severity:** Medium
- **Effort:** Medium
- **Affected Files:** `packages/app/src/barrel.ts:164-193`, `packages/styled/src/components/*`
- **Target Invariant:** Predictable, uniform naming conventions across design system component surfaces.

##### Problem Statement & Root Cause
The design system exported by `@vexart/styled` has an arbitrary naming asymmetry. Simple container and presentation components are exported without prefixes:
- `Avatar`, `Badge`, `Button`, `Card`, `Separator`, `Skeleton`

In contrast, interactive form controls and structured views are prefixed with `Void`:
- `VoidInput`, `VoidSelect`, `VoidCheckbox`, `VoidDialog`, `VoidCombobox`, `VoidTabs`, `VoidSlider`, `VoidSwitch`, `VoidTable`, `VoidTextarea`, `VoidCode`, `VoidMarkdown`, `VoidTooltip`, `VoidPopover`

```ts
// packages/app/src/barrel.ts:164-193
export {
  Avatar,
  Badge,
  Button,
  Card,
  Separator,
  Skeleton,
  VoidCheckbox,
  VoidCombobox,
  VoidDialog,
  VoidInput,
  VoidTabs,
  ...
} from "@vexart/styled"
```
This was originally implemented to avoid collisions with HTML/headless names (such as `Input`, `Select`, `Tabs`), but the resulting developer experience is jarring: a user creates a form containing `<Button>`, `<Card>`, `<VoidInput>`, and `<VoidSelect>`.

##### Developer Experience Impact
Developers face high cognitive friction and constant IDE autocompletion context switches. They type `<Input` and receive either the unstyled headless `Input` or nothing, wondering why `Button` is styled but `Input` is not. Codebases become filled with disjointed JSX:
```tsx
<Card>
  <VoidInput placeholder="Name" />
  <Button variant="default">Submit</Button>
</Card>
```

##### Recommendation
Standardize naming across `@vexart/styled` and `barrel.ts` by providing aliases for both conventions:
1. Canonical exports under standard names: `Input`, `Select`, `Checkbox`, `Tabs`, `Dialog` (with headless counterparts accessible under `HeadlessInput`, `HeadlessSelect`, etc.).
2. Backward-compatible aliases: `export { Input as VoidInput, ... }`.

---

#### DEF-03: Ghost Comments for Deleted Layout Helpers in Barrel and Public Entry Points

- **Severity:** Low
- **Effort:** Trivial
- **Affected Files:** `packages/app/src/barrel.ts:70-72`, `packages/app/src/public.ts:16-19`
- **Target Invariant:** Clean, intentional export files without orphaned comments from deleted modules.

##### Problem Statement & Root Cause
When the legacy `@vexart/primitives` package was purged and its layout helpers (`Span`, `RichText`, `WrapRow`) were deleted, the headers in the public export entry points were left behind as orphaned comments:

```ts
// packages/app/src/barrel.ts:70-72
// ── Layout helpers ───────────────────────────────────────────────────────────


export type { TGEProps as BoxProps, ShadowConfig, GlowConfig } from "@vexart/engine"
```

```ts
// packages/app/src/public.ts:16-19
// -- Layout helpers (formerly @vexart/primitives) ----------------------------



// -- Styling -----------------------------------------------------------------
```

##### Developer Experience Impact
Developers inspecting definition files or navigating to source code encounter empty sections promising layout helpers that do not exist, causing confusion about whether these helpers were moved or forgotten.

##### Recommendation
Remove the orphaned layout helper comments and properly annotate `BoxProps`, `ShadowConfig`, and `GlowConfig` under the `Primitives & Styling` section.

---

#### DEF-04: Divergence Between Workspace Package `@vexart/app` and Root `"vexart"` Exports

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/app/package.json:5-6`, `packages/app/src/index.ts:1`, `packages/app/src/public.ts`, `packages/app/src/barrel.ts`
- **Target Invariant:** Consistent export behavior regardless of whether consumed via workspace package or unified package.

##### Problem Statement & Root Cause
The monorepo contains a split identity for `@vexart/app`:
1. `packages/app/package.json` points `main` and `types` to `./src/index.ts`.
2. `packages/app/src/index.ts` contains a single line: `export * from "./public"`.
3. `packages/app/src/public.ts` exports **only** app lifecycle (`createApp`, `mountApp`, `Page`), primitives (`Box`, `Text`), styling helpers (`createStyles`, `resolveClassName`), and router utilities. It does **not** export styled components, headless components, hooks, or SolidJS utilities.
4. Meanwhile, `scripts/build-dist.ts` builds `packages/app/src/barrel.ts` as `dist/vexart.js` (the root `"vexart"` package).

```
Consumer imports "vexart"       --> Gets barrel.ts (App + Styled + Headless + Hooks + Solid)
Consumer imports "@vexart/app"  --> Gets public.ts (Only App + Router + Box/Text)
```

##### Developer Experience Impact
Monorepo workspace packages, examples, tests, and documentation frequently confuse `@vexart/app` and `"vexart"`. A developer following a tutorial that uses `import { Button, useFocus } from "@vexart/app"` receives TypeScript compilation errors:
`Module '"@vexart/app"' has no exported member 'Button'`.

##### Recommendation
Make `packages/app/src/index.ts` export the complete surface or make `@vexart/app/barrel` explicitly resolvable, aligning the workspace package index with the distributed root package.

---

#### DEF-05: Missing Core Engine and SolidJS Utilities in Main Barrel

- **Severity:** Medium
- **Effort:** Small
- **Affected Files:** `packages/app/src/barrel.ts:445`, `packages/engine/src/public.ts:91,114,131,337`
- **Target Invariant:** The primary framework entry point must export all common utilities needed to author components, canvas graphics, and particle effects.

##### Problem Statement & Root Cause
In `packages/app/src/barrel.ts:445`, SolidJS re-exports are limited to:
```ts
export {
  createSignal,
  createEffect,
  createMemo,
  createContext,
  useContext,
  onCleanup,
  onMount,
  batch,
  untrack,
} from "solid-js"
```
Crucial component authoring utilities like `children` and `splitProps` are omitted! Developers authoring custom components cannot safely handle props or resolve reactive children without installing and importing `solid-js` separately.

Furthermore, several distinctive engine features are missing from `barrel.ts`:
1. `CanvasContext` (`packages/engine/src/ffi/canvas.ts`) — required for `<box onDraw={(ctx: CanvasContext) => ...}>`.
2. `createParticleSystem` (`packages/engine/src/ffi/particles.ts`) — the built-in GPU particle engine.
3. `registerFont` / `unregisterFont` (`packages/engine/src/ffi/text-layout.ts`) — custom font registration.
4. `getSelection`, `setSelection`, `clearSelection`, `TextSelection` (`packages/engine/src/reconciler/selection.ts`) — terminal text selection control.

##### Developer Experience Impact
Developers attempting to use the canvas API or particle engine encounter missing types:
```tsx
<box onDraw={(ctx) => { ... }} /> // 'ctx' has implicit any type; CanvasContext cannot be imported from "vexart"
```
Developers must maintain secondary imports:
```ts
import { CanvasContext, createParticleSystem } from "vexart/engine"
import { splitProps, children } from "solid-js"
```
This violates the promise of `"vexart"` as a batteries-included unified entry point.

##### Recommendation
Re-export `CanvasContext`, `createParticleSystem`, `registerFont`, `unregisterFont`, `getSelection`, `setSelection`, `clearSelection`, `TextSelection` from `@vexart/engine`, and `children`, `splitProps` from `solid-js` in `packages/app/src/barrel.ts`.

---

### Category 2: Prop Ergonomics & DX Traps

---

#### DEF-06: Zero `className` Support in `@vexart/styled` Components

- **Severity:** Critical
- **Effort:** Medium
- **Affected Files:** `packages/styled/src/components/*` (e.g. `button.tsx:144-199`, `card.tsx:1-85`), `packages/app/src/components/primitives.tsx:7-15`
- **Target Invariant:** Utility class styling via `className` must function consistently across all components in the ecosystem.

##### Problem Statement & Root Cause
`@vexart/app` introduces a Tailwind-like utility class engine (`className="p-4 bg-background flex-row gap-2"`). The primitive `<Box>` and `<Text>` components in `@vexart/app` support `className` via `resolveClassName()`.

However, **not a single component in `@vexart/styled` accepts `className`**!
Taking `Button` as an example:
```ts
// packages/styled/src/components/button.tsx
export type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  onPress?: () => void
  disabled?: boolean
  focusId?: string
  children?: JSX.Element
  // NO className property!
}
```
Inside `packages/styled/src/components/button.tsx:156-196`, it renders an intrinsic `<box>`:
```tsx
<box
  {...ctx.buttonProps}
  direction="row"
  height={ss.height}
  width={ss.width}
  backgroundColor={...}
  ...
>
  <text color={vg.fg()}>{props.children}</text>
</box>
```
No `resolveClassName` is called.

##### Developer Experience Impact
In any modern component system (such as Tailwind + shadcn/ui), developers customize component layout and margins via `className`:
```tsx
<Button className="w-full mt-4">Continue</Button>
<Card className="max-w-md p-6">...</Card>
```
In Vexart:
1. TypeScript rejects `className` with: `Type '{ children: string; className: string; }' is not assignable to type 'IntrinsicAttributes & ButtonProps'. Property 'className' does not exist on type 'ButtonProps'`.
2. If bypassed via `@ts-ignore` or pure JavaScript, the prop is silently dropped and has zero effect at runtime!
3. Developers are forced to wrap every styled component in a `<Box>`:
```tsx
<Box className="w-full mt-4">
  <Button>Continue</Button>
</Box>
```
This bloats the scene graph and breaks flex alignments.

##### Recommendation
1. Define a base interface `StyledComponentProps` in `@vexart/styled`:
```ts
export type StyledComponentProps = {
  className?: string
  style?: Partial<TGEProps>
}
```
2. Have all styled component props extend it.
3. Use `mergeClassNameProps` or wrap internal roots with `resolveClassName` or `<Box>` from `@vexart/app`.

---

#### DEF-07: Raw Text Children Directly Inside `<box>` Cause Silent Style Invalidation and Flex Item Fragmentation

- **Severity:** High
- **Effort:** Medium
- **Affected Files:** `packages/engine/src/reconciler/reconciler.ts:282-296`, `packages/engine/src/loop/walk-tree.ts:251-284`, `packages/engine/src/ffi/node.ts:188-192`
- **Target Invariant:** Either raw text inside `<box>` must be automatically normalized into inline text, or an informative development warning must be emitted.

##### Problem Statement & Root Cause
In standard HTML/JSX (and React Native/Ink), putting text inside a container is common: `<div>Hello</div>` or `<Box>Hello</Box>`.
In Vexart's reconciler (`packages/engine/src/reconciler/reconciler.ts:282`):
```ts
createTextNode(value: string): TGENode {
  return createTextNode(String(value))
}
```
`createTextNode` creates a node with `kind: "text"`.
When JSX contains `<box>Hello World</box>`, the reconciler appends this text node as a direct child of the `<box>` node.
In `packages/engine/src/loop/walk-tree.ts:251`:
```ts
if (node.kind === "text") {
  const content = node.text || collectText(node)
  if (!content) return
  ...
  createTextFlexNode(node)
  layout.setCurrentFlexNode(node._flexNode)
  layout.text(...)
  state.textNodes.push(node)
  return
}
```
Each raw text child becomes a **distinct flex item** in Flexily! If a developer writes:
```tsx
<box direction="row">
  User: <strong>Admin</strong> (active)
</box>
```
The raw string `"User: "` and `" (active)"` are materialized as individual block/flex items, fragmenting layout.

Furthermore, in `packages/engine/src/reconciler/reconciler.ts:286-296`:
```ts
replaceText(node: TGENode, value: string) {
  node.text = String(value)
  const target = node.parent?.kind === "text" ? node.parent : node
  target._flexNode?.markDirty()
  markNodeVisualDamage(target)
  markNodeDirty(target)
}
```
When `node.parent?.kind === "box"`, `target` is the raw text node itself. The text node has no style props (font size, color, font family), so properties placed on the parent `<box>` (`color="#ff0000"`) are never inherited by the text node.

##### Developer Experience Impact
Developers write `<box>Click here</box>` and observe:
1. The text renders with default engine fallback styles (white/gray, default font), ignoring any `color` prop on `<box>`.
2. In flex layouts, strings break onto unexpected lines or consume unwanted flex space.
3. There is no warning informing the developer to use `<text>Click here</text>`.

##### Recommendation
1. In `walk-tree.ts`, automatically wrap contiguous raw text nodes inside a `<box>` into a virtual inline text span container that inherits text styling from the parent box if specified.
2. In development mode (`NODE_ENV !== "production"`), log a helpful warning:
`[Vexart] Warning: Raw text placed directly inside <box>. Wrap text in <text>...</text> or <Text>...</Text> to ensure proper typography and layout.`

---

#### DEF-08: Prop Precedence Discrepancy Between `<Box>` and Intrinsic `<box>`

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/app/src/components/primitives.tsx:35-62`, `packages/engine/src/ffi/node.ts:153-155`
- **Target Invariant:** Symmetric, predictable style and prop merging behavior between intrinsic elements and their wrapper components.

##### Problem Statement & Root Cause
In `@vexart/app`'s `<Box>` component (`primitives.tsx:35-62`):
```ts
function resolvePrimitiveProps(...) {
  const resolved = resolveClassName(className).props
  return preserveRemovedProps({
    ...resolved,
    ...(style ?? {}),
    ...rest,
    hoverStyle: mergeInteractiveStyle(
      mergeInteractiveStyle(resolved.hoverStyle, style?.hoverStyle),
      hoverStyle,
    ),
    ...
  })
}
```
`<Box>` implements deep merging for interactive state objects (`hoverStyle`, `activeStyle`, `focusStyle`). If a class sets `hoverStyle={{ backgroundColor: "blue" }}` and a direct prop sets `hoverStyle={{ borderColor: "red" }}`, both properties are preserved and merged.

In contrast, intrinsic `<box>` in `@vexart/engine` (`packages/engine/src/ffi/node.ts:153-155`):
```ts
export function resolveProps(node: TGENode): TGEProps {
  ...
  let base = node.props
  if (base.style) {
    base = { ...base.style, ...base }
  }
  ...
  let resolved = base
  if (node._hovered && base.hoverStyle) {
    resolved = { ...resolved, ...base.hoverStyle }
  }
  return resolved
}
```
On `<box>`, direct props perform a **shallow overwrite** over `style`:
`base = { ...base.style, ...base }`.
If `style` provides `hoverStyle={{ backgroundColor: "blue", scale: 1.05 }}` and direct props provide `hoverStyle={{ backgroundColor: "red" }}`, the entire `hoverStyle` object from `style` is wiped out, losing `scale: 1.05`.
Additionally, passing `className` to intrinsic `<box>` is silently ignored.

##### Developer Experience Impact
Developers refactoring between `<Box>` (from `"vexart"`) and `<box>` (from `"vexart/engine"`) encounter inconsistent visual behavior. Interactive styles merged cleanly on `<Box>` suddenly drop properties on `<box>`.

##### Recommendation
Centralize prop resolution logic. Extract `resolveInteractiveProps` into a shared utility in `@vexart/engine` so both intrinsic `<box>` and wrapper `<Box>` adhere to identical cascading and deep-merge rules.

---

### Category 3: Reactivity & Theming Usability

---

#### DEF-09: `themeColors` Destructuring Silently Destroys Reactivity Without Warning

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/styled/src/theme/theme.ts:113-124`
- **Target Invariant:** Reactive token APIs must either preserve reactivity under standard JavaScript usage or detect and warn against reactivity breakage.

##### Problem Statement & Root Cause
In `packages/styled/src/theme/theme.ts:113-124`:
```ts
export const themeColors: ColorTokens = Object.defineProperties(
  {} as ColorTokens,
  Object.fromEntries(
    (Object.keys(defaultColors) as (keyof ColorTokens)[]).map((key) => [
      key,
      {
        get() { return colorSignals[key][0]() },
        enumerable: true,
      },
    ])
  )
)
```
`themeColors` is exposed as an object of ES5 getters. When a property is read directly inside a JSX binding (`<box backgroundColor={themeColors.background} />`), SolidJS's tracking context intercepts the getter and subscribes the computation to `colorSignals.background`.

However, the prevailing JavaScript/TypeScript convention is to destructure properties:
```tsx
export function ProfileCard() {
  const { background, foreground, border } = themeColors // <-- TRAP!
  return (
    <box backgroundColor={background} borderColor={border}>
      <text color={foreground}>User Profile</text>
    </box>
  )
}
```
When `themeColors` is destructured, the getters are executed **once** at component initialization. `background` and `foreground` become static string values (e.g. `"#09090b"`).
When the user toggles the theme via `setTheme(lightTheme)`, the signal fires, but the component has zero reactive subscriptions to the signal. The component stays dark forever.

##### Developer Experience Impact
This is one of the most frustrating traps for SolidJS beginners and experienced developers alike. The code compiles without errors, works on initial render, and theme switching works for built-in components, but any custom component using destructuring fails to update with zero explanation.

##### Recommendation
1. Return a Proxy from `themeColors` that detects when keys are accessed outside a reactive tracking context in development mode and logs a warning:
`[Vexart] Warning: themeColors property '${key}' was accessed outside a reactive tracking scope. Avoid destructuring themeColors (e.g. use themeColors.${key} directly in JSX).`
2. Provide an explicit reactive token helper, e.g. `useThemeColors()` or accessor functions `color("background")`.

---

#### DEF-10: Subtree Theming is Broken: `ThemeProvider` Mutates Global Singleton and Components Ignore Context

- **Severity:** High
- **Effort:** Medium
- **Affected Files:** `packages/styled/src/theme/theme.ts:150-189`, `packages/styled/src/components/*`
- **Target Invariant:** `ThemeProvider` must provide isolated, scoped theme contexts to subtrees without corrupting global application state.

##### Problem Statement & Root Cause
The docstring for `ThemeProvider` states:
`"Use ThemeProvider only if you need nested/different themes in subtrees."`

Now observe the actual implementation in `packages/styled/src/theme/theme.ts:166-181`:
```ts
export function ThemeProvider(props: {
  theme?: Required<ThemeDefinition>
  children?: JSX.Element
}) {
  if (props.theme) {
    setTheme(props.theme) // <-- MUTATES GLOBAL SINGLETON!
  }

  return createComponent(ThemeContext.Provider, {
    value: {
      colors: themeColors, // <-- PASSES GLOBAL themeColors SINGLETON!
      setTheme,
    },
    get children() { return props.children },
  })
}
```
1. `ThemeProvider` calls `setTheme(props.theme)` on mount, which overwrites the entire global application theme!
2. `ThemeContext.Provider` provides `themeColors`, which is the global signal proxy.
3. None of the components in `@vexart/styled` (`Button`, `Card`, `VoidInput`, etc.) even call `useTheme()` or consume `ThemeContext`! They all import the module-level `themeColors` singleton directly!

```ts
// packages/styled/src/components/button.tsx:100-101
bg: () => themeColors.transparent,
fg: () => themeColors.foreground,
```

##### Developer Experience Impact
A developer attempting to render a dark header and a light content panel:
```tsx
<ThemeProvider theme={darkTheme}>
  <Header />
</ThemeProvider>
<ThemeProvider theme={lightTheme}>
  <Sidebar />
</ThemeProvider>
```
finds that the entire app flips to `lightTheme`. Subtree theming does not work at all.

##### Recommendation
1. Refactor `ThemeProvider` to instantiate an isolated set of color signals for its subtree.
2. In `@vexart/styled` components, read colors from `useTheme()` context with fallback to the global `themeColors` default.

---

### Category 4: Events, Focus & Keyboard Usability

---

#### DEF-11: `onClick` is Not Supported on `<box>` (Only `onPress`); Fails Silently

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/engine/src/ffi/node-types.ts:324`, `packages/engine/src/reconciler/reconciler.ts:298-302`, `packages/engine/src/loop/layout.ts`
- **Target Invariant:** Intuitive event handler mapping matching web standards, or strict compiler/runtime diagnostics for invalid handlers.

##### Problem Statement & Root Cause
In `packages/engine/src/ffi/node-types.ts:324`, Vexart defines its primary interaction handler as `onPress`:
```ts
/** Unified press handler — fires on mouse click + Enter/Space when focused (Decision 6) */
onPress?: (event?: PressEvent) => void
```
There is no `onClick` property on `TGEProps`.
When a developer writes:
```tsx
<box onClick={() => console.log("clicked")}>
  <text>Submit</text>
</box>
```
What happens?
In `packages/engine/src/reconciler/reconciler.ts:298`, `setProperty` executes:
```ts
const currentProps = node.props as Record<string, unknown>
currentProps["onClick"] = value
```
The callback is saved to `node.props.onClick`. But the render loop and event dispatcher (`packages/engine/src/loop/layout.ts:520`) only check `node.props.onPress`.
`onClick` is **completely ignored**. No error is thrown. No console warning is emitted. The element simply does not respond to mouse clicks.

##### Developer Experience Impact
`onClick` is the most universal event handler in the JavaScript/HTML/React/Solid ecosystem. Every new developer coming to Vexart writes `onClick` first. Because TypeScript types in JSX can sometimes be lenient with extra attributes, developers spend hours debugging why their click handlers never fire.

##### Recommendation
1. Add `onClick` as a direct alias for `onPress` in `TGEProps` and `resolveProps`. If both are provided, `onPress` takes precedence.
2. In development mode, if `onClick` is passed, support it automatically while emitting a gentle suggestion if `onPress` is preferred.

---

#### DEF-12: `KeyEvent` Structure is Non-Standard: Lowercase Names and Nested Modifiers

- **Severity:** Medium
- **Effort:** Small
- **Affected Files:** `packages/engine/src/input/types.ts:34-41`, `packages/engine/src/input/parser.ts`
- **Target Invariant:** Conform to W3C KeyboardEvent standard conventions where practical in terminal environments.

##### Problem Statement & Root Cause
In `packages/engine/src/input/types.ts:34-41`:
```ts
export type KeyEvent = {
  type: "key"
  key: string          // normalized key name: "a", "enter", "f1", "tab", etc.
  char: string         // printable character or "" for special keys
  mods: Modifiers      // { shift: boolean, alt: boolean, ctrl: boolean, meta: boolean }
}
```
Contrast this with the standard Web/DOM `KeyboardEvent`:
- Standard Web: `e.key === "Enter"`, `e.key === "Escape"`, `e.key === "ArrowUp"`, `e.key === "Backspace"`, `e.key === "Tab"`.
- Vexart: `e.key === "enter"`, `e.key === "escape"`, `e.key === "up"`, `e.key === "backspace"`, `e.key === "tab"`.
- Standard Web: `e.ctrlKey`, `e.shiftKey`, `e.altKey`, `e.metaKey` (flat booleans).
- Vexart: `e.mods.ctrl`, `e.mods.shift`, `e.mods.alt`, `e.mods.meta` (nested object).

##### Developer Experience Impact
Developers porting UI components, keyboard navigation logic, or shortcuts from web apps or other terminal libraries write:
```ts
if (e.key === "Enter" || e.ctrlKey) { ... }
```
In Vexart, `e.key === "Enter"` is ALWAYS `false` (it is `"enter"`), and `e.ctrlKey` is ALWAYS `undefined`. Code fails silently without runtime errors.

##### Recommendation
1. Add getters / flat properties to `KeyEvent`:
```ts
export type KeyEvent = {
  type: "key"
  key: string
  char: string
  mods: Modifiers
  // Standard Web Aliases:
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}
```
2. Accept both lowercase (`"enter"`) and canonical PascalCase (`"Enter"`) in internal comparison helpers, or normalize `key` to standard DOM names while keeping lowercase aliases.

---

#### DEF-13: Critical Focus Double-Registration Bug on Headless and Styled Buttons

- **Severity:** Critical
- **Effort:** Medium
- **Affected Files:** `packages/headless/src/inputs/button.tsx:60-68,82-85,91`, `packages/styled/src/components/button.tsx:158`, `packages/engine/src/reconciler/focus.ts:43-58,190-207`, `packages/engine/src/reconciler/reconciler.ts:449-469`
- **Target Invariant:** Each interactive component must register exactly one entry in the focus navigation ring.

##### Problem Statement & Root Cause
This is a critical architectural flaw in Vexart's focus system.
Examine `HeadlessButton` (`packages/headless/src/inputs/button.tsx`):
```ts
export function Button(props: ButtonProps) {
  ...
  // 1. Calls useFocus() hook!
  const { focused, focus } = useFocus({
    id: props.focusId,
    onKeyDown(e) { ... },
  })

  const context: ButtonRenderContext = {
    get focused() { return focused() },
    get pressed() { return pressed() },
    get disabled() { return disabled() },
    buttonProps: {
      focusable: true, // <-- EXPOSES focusable: true!
      onPress: activate,
    },
  }
  return <box width="fit" height="fit">{props.renderButton(context)}</box>
}
```
Now examine `StyledButton` (`packages/styled/src/components/button.tsx:156-188`):
```tsx
<HeadlessButton
  ...
  renderButton={(ctx) => (
    <box
      {...ctx.buttonProps} // <-- Passes focusable: true to intrinsic <box>!
      ...
      borderColor={ctx.focused ? vg.focusBorder() : vg.border()}
      glow={ctx.focused && !isLink ? glows.ring : undefined}
    >
      <text ...>{props.children}</text>
    </box>
  )}
/>
```
Now trace what happens in `@vexart/engine`:
1. `useFocus()` executes in `packages/engine/src/reconciler/focus.ts:193`:
   ```ts
   const id = opts.id ?? `focus-${nextId++}`
   const unregister = registerFocusable({ id, ... })
   ```
   **Registration #1:** ID `"focus-0"` is pushed into `activeScope().entries`.
2. Solid evaluates the JSX and creates `<box focusable={true}>`.
3. In `packages/engine/src/reconciler/reconciler.ts:449-460`:
   ```ts
   if (name === "focusable") {
     ...
     registerNodeFocusable(node) // Calls registerFocusable({ id: `node-focus-${node.id}` })
   }
   ```
   **Registration #2:** ID `"node-focus-14"` is pushed into `activeScope().entries`.

**Result:** Every single Button registers **TWO DISTINCT FOCUS ENTRIES** in the focus scope!
- Entry 1: `"focus-0"` (tracked by `useFocus`, bound to `ctx.focused`)
- Entry 2: `"node-focus-14"` (tracked by intrinsic `<box>`, bound to `node._focused`)

##### Developer Experience Impact
When a user presses the **Tab** key to navigate an app with three buttons:
1. **Tab Press 1:** Focus moves to `"focus-0"`. `ctx.focused` is `true`. Button 1 displays its focus ring.
2. **Tab Press 2:** Focus moves to `"node-focus-14"`!
   - Now `focusedId()` is `"node-focus-14"`.
   - `ctx.focused` evaluates `focusedId() === "focus-0"`, which is **FALSE**!
   - The focus ring on Button 1 **instantly disappears**, but focus is still on Button 1!
   - Pressing Enter or Space now triggers the node handler, not the hook handler.
3. **Tab Press 3:** Focus moves to Button 2's `"focus-1"`.
4. **Tab Press 4:** Focus moves to Button 2's `"node-focus-15"`.

The user is forced to press Tab **twice** for every button, and on the second press the visual focus indicator disappears!

##### Recommendation
Resolve the ownership boundary:
- Headless components using `useFocus()` must **not** pass `focusable: true` to the rendered `<box>`.
- Alternatively, if `buttonProps` supplies `focusable: true`, `useFocus` should bind to the node's focus entry rather than creating an independent unattached entry.

---

#### DEF-14: Intrinsic `<box focusable>` Hardcodes `node-focus-${node.id}` and Cannot Be Targeted by `setFocus("my-id")`

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/engine/src/reconciler/focus.ts:204`, `packages/engine/src/reconciler/reconciler.ts:449-469`
- **Target Invariant:** Elements marked focusable must accept a user-specified focus identifier for programmatic focus management.

##### Problem Statement & Root Cause
In `packages/engine/src/reconciler/focus.ts:202-207`:
```ts
export function registerNodeFocusable(node: TGENode): () => void {
  ensureFocusInput()
  const id = `node-focus-${node.id}`
  nodeFocusMap.set(node.id, id)
  return registerFocusable({ id, onKeyDown: node.props.onKeyDown, onPress: node.props.onPress, node })
}
```
The focus identifier is strictly hardcoded to `node-focus-${node.id}` using internal numeric node IDs.
Even if the developer specifies `focusId="sidebar-nav"` or `id="sidebar-nav"` on `<box focusable>`:
```tsx
<box focusable focusId="sidebar-nav" onPress={...} />
```
The reconciler ignores the prop and assigns `node-focus-87`.

##### Developer Experience Impact
When building keyboard shortcuts or navigation workflows (e.g. "press `/` to focus search", "press `Esc` to return focus to table"), the developer writes:
```ts
setFocus("search-input")
```
This fails silently because the actual ID in the focus registry is `node-focus-42`. The developer cannot know or predict the internal numeric ID.

##### Recommendation
Update `registerNodeFocusable` to check `node.props.focusId ?? node.props.id ?? node-focus-${node.id}`:
```ts
export function registerNodeFocusable(node: TGENode): () => void {
  ensureFocusInput()
  const explicitId = (node.props as Record<string, unknown>).focusId as string | undefined
  const id = explicitId ?? `node-focus-${node.id}`
  nodeFocusMap.set(node.id, id)
  return registerFocusable({ id, onKeyDown: node.props.onKeyDown, onPress: node.props.onPress, node })
}
```

---

### Category 5: Layout & Sizing Usability

---

#### DEF-15: `parseSizing` Silently Converts `"100px"`, `"auto"`, etc. to `"fit"` (0), Returns `NaN` on Invalid Percents, and Can Crash

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `packages/engine/src/ffi/node.ts:440-450`
- **Target Invariant:** Sizing parser must robustly parse valid formats, reject or warn on invalid inputs, and never produce `NaN`.

##### Problem Statement & Root Cause
In `packages/engine/src/ffi/node.ts:440-450`:
```ts
export function parseSizing(value: number | string | undefined): SizingInfo | null {
  if (value === undefined) return null
  if (typeof value === "number") return { type: SIZING.FIXED, value }
  if (value === "fit") return { type: SIZING.FIT, value: 0 }
  if (value === "grow") return { type: SIZING.GROW, value: 0 }
  if (value.endsWith("%")) {
    const pct = parseFloat(value) / 100
    return { type: SIZING.PERCENT, value: pct }
  }
  return { type: SIZING.FIT, value: 0 }
}
```
1. **Silent Fallthrough:** Any string that is not `"fit"`, `"grow"`, or ending with `"%"` silently falls through to `{ type: SIZING.FIT, value: 0 }`.
   - If a developer writes `width="100px"` (standard CSS habit), it becomes `FIT` (0 width).
   - If a developer writes `width="auto"`, it becomes `FIT` (0 width).
2. **NaN Poisoning:** If someone writes `width="xyz%"`, `parseFloat("xyz%")` evaluates to `NaN`. `pct` is `NaN`. This injects `NaN` into Flexily's layout engine, poisoning downstream coordinate computations.
3. **Runtime Crash:** If a non-string/non-number object (or symbol) is passed dynamically, `value.endsWith` throws an unhandled `TypeError: value.endsWith is not a function`.

##### Developer Experience Impact
Developers transitioning from web development instinctively write `width="200px"` or `width="auto"`. Instead of rendering 200px or an error, the box collapses to 0 pixels or fits tightly around children. The developer is left with a blank or broken terminal screen and no error logs in the console.

##### Recommendation
1. Support pixel string units by stripping `"px"`:
```ts
if (typeof value === "string" && value.endsWith("px")) {
  const px = parseFloat(value)
  if (!Number.isNaN(px)) return { type: SIZING.FIXED, value: px }
}
```
2. Validate percentages against `Number.isNaN`:
```ts
if (typeof value === "string" && value.endsWith("%")) {
  const pct = parseFloat(value) / 100
  if (!Number.isNaN(pct)) return { type: SIZING.PERCENT, value: pct }
}
```
3. In development mode, warn on unrecognized sizing tokens instead of silently collapsing to `FIT`.

---

#### DEF-16: Unconstrained `string` Type for `width` and `height` in `TGEProps`

- **Severity:** Medium
- **Effort:** Small
- **Affected Files:** `packages/engine/src/ffi/node-types.ts:210-211`
- **Target Invariant:** TypeScript types must provide exact autocomplete literals while rejecting or warning on unsupported strings.

##### Problem Statement & Root Cause
In `packages/engine/src/ffi/node-types.ts:210-211`:
```ts
export type TGEProps = {
  ...
  width?: number | string    // number=fixed, "100%"=percent, "fit"=fit, "grow"=grow
  height?: number | string
  ...
}
```
Because the type is `number | string`, TypeScript allows **any string literal whatsoever** (`"100px"`, `"auto"`, `"initial"`, `"fill"`), providing:
- Zero IDE autocomplete suggestions for `"fit"`, `"grow"`, `"100%"`, `"50%"`.
- Zero compile-time protection against unsupported values like `"100px"` or `"auto"`.

##### Developer Experience Impact
When a developer types `width="` in their IDE, the language server cannot offer completions. The developer has to look up documentation to remember whether the keyword is `"fit"`, `"shrink"`, `"hug"`, or `"auto"`.

##### Recommendation
Use TypeScript template literal types and string union literals:
```ts
export type SizingKeyword = "fit" | "grow"
export type SizingPercent = `${number}%`
export type SizingDimension = number | SizingKeyword | SizingPercent | `${number}px`

export type TGEProps = {
  ...
  width?: SizingDimension
  height?: SizingDimension
  ...
}
```
This grants full autocomplete in VS Code / Cursor / Neovim while catching typos at compile time.

---

### Category 6: Dead Code, Ghost Types & Documentation Baggage

---

#### DEF-17: Phantom Type Declarations for Deleted Primitives (`<Span>`, `<RichText>`, `<WrapRow>`) in `types/components.d.ts`

- **Severity:** High
- **Effort:** Small
- **Affected Files:** `types/components.d.ts:445-479`, `scripts/build-dist.ts:228-234`
- **Target Invariant:** Distributed `.d.ts` type definitions must strictly mirror the runtime exports of the package.

##### Problem Statement & Root Cause
`@vexart/primitives` was merged and deleted in early architecture passes, and `<Span>`, `<RichText>`, and `<WrapRow>` were explicitly purged from the runtime (`packages/app/src/components/primitives.tsx`).
However, `types/components.d.ts` still contains active declarations for them:
```ts
// types/components.d.ts:445-479
// ── RichText / Span ──

export type SpanProps = {
  color?: string | number
  fontSize?: number
  ...
  children?: JSX.Element
}
export function Span(props: SpanProps): JSX.Element

export type RichTextProps = { ... }
export function RichText(props: RichTextProps): JSX.Element

// ── WrapRow ──
export type WrapRowProps = { ... }
export function WrapRow(props: WrapRowProps): JSX.Element
```
In `scripts/build-dist.ts:228-234`, this file is directly copied into the release package:
```ts
cpSync(resolve(ROOT, `types/${name}.d.ts`), resolve(DIST, `${name}.d.ts`))
```

##### Developer Experience Impact
When developers use the distributed package, TypeScript happily validates:
```tsx
import { RichText, Span } from "vexart"
```
The compiler gives a green checkmark with zero errors. But as soon as the app is launched:
`TypeError: (0, import_vexart.RichText) is not a function` or `undefined component in JSX`.
Phantom types that pass compilation but crash at runtime destroy developer trust.

##### Recommendation
Delete lines 445–479 of `types/components.d.ts` immediately, and ensure the type generation pipeline (`scripts/gen-types.ts` / API Extractor) is the sole source of truth for distributed declarations.

---

#### DEF-18: Documentation Drift in Website and Manual Files Referencing Purged Primitives

- **Severity:** Medium
- **Effort:** Small
- **Affected Files:** `website/src/content/docs/guides/introduction.md:45`, `website/src/content/docs/components/primitives.md:39-64`, `docs/getting-started.md:85`, `docs/api-reference.md:74-76`, `docs/components.md:5`
- **Target Invariant:** All official documentation and tutorial samples must run without errors on current releases.

##### Problem Statement & Root Cause
Multiple official documentation files continue to instruct developers to import and use the deleted primitives:
1. `website/src/content/docs/components/primitives.md:39-64`:
   ```markdown
   ### Span / RichText
   ```tsx
   import { RichText, Span } from "@vexart/app"

   <RichText>
     <Span color="#56d4c8">Hello </Span>
     <Span color="#a78bfa" fontWeight={700}>World</Span>
   </RichText>
   ```
   ```
2. `website/src/content/docs/guides/introduction.md:45`:
   `| Layout helpers | @vexart/app | Box, Text, Span, RichText, WrapRow |`
3. `docs/getting-started.md:85`:
   `import { createApp, Box, Text, useAppTerminal, RichText, Span, WrapRow, ... } from "@vexart/app"`
4. `docs/api-reference.md:74-76`:
   Lists `RichText`, `Span`, `WrapRow` under current primitives.

This contradicts `docs/v3/README.md`, which states:
*"Purged Primitives: `<Span>`, `<RichText>`, and `<WrapRow>` do not exist. Use `<box>` and `<text>` intrinsics or `<Box>` and `<Text>` app components directly."*

##### Developer Experience Impact
New users reading the official "Getting Started" or "Primitives" guides copy and paste code samples that fail immediately upon execution.

##### Recommendation
Update all documentation files and website content to replace references to `RichText`, `Span`, and `WrapRow` with canonical `<Box>` and `<Text>` examples using flex wrapping and nested text spans.

---

## 3. Severity Matrix & Impact Analysis

### 3.1 Consolidated Audit Matrix

| Defect ID | Title | Category | Severity | Effort | Target / Affected Files | DX & Architectural Impact |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **DEF-01** | Headless `Button` Shadowed in Barrel | 1. Barrel & Exports | **High** | Small | `packages/app/src/barrel.ts:166,252` | Blocks creation of custom headless buttons from root package. |
| **DEF-02** | Asymmetric Naming (`VoidInput` vs `Button`) | 1. Barrel & Exports | **Medium** | Medium | `packages/app/src/barrel.ts:164-193` | High cognitive friction and broken autocompletion habits. |
| **DEF-03** | Ghost Comments for Deleted Primitives | 1. Barrel & Exports | **Low** | Trivial | `packages/app/src/barrel.ts:70`, `public.ts:16` | Confusing orphaned comment headers in source files. |
| **DEF-04** | Divergence: `@vexart/app` vs `"vexart"` | 1. Barrel & Exports | **High** | Small | `packages/app/src/index.ts:1`, `public.ts` | Import breakage in monorepos and inconsistent export surfaces. |
| **DEF-05** | Missing Engine/Solid Utils in Main Barrel | 1. Barrel & Exports | **Medium** | Small | `packages/app/src/barrel.ts:445` | Forces secondary imports for canvas, particles, and Solid helpers. |
| **DEF-06** | Zero `className` in `@vexart/styled` | 2. Prop Ergonomics | **Critical** | Medium | `packages/styled/src/components/*` | Utility classes impossible on buttons/cards; requires wrapper hacks. |
| **DEF-07** | Raw Text in `<box>` Causes Fragmentation | 2. Prop Ergonomics | **High** | Medium | `reconciler.ts:282`, `walk-tree.ts:251` | Layout breakage and unstyled text nodes without warnings. |
| **DEF-08** | Prop Precedence Discrepancy (`<Box>` vs `<box>`) | 2. Prop Ergonomics | **High** | Small | `primitives.tsx:35`, `ffi/node.ts:153` | Inconsistent interactive style cascading and shallow overwrite bugs. |
| **DEF-09** | `themeColors` Destructure Breaks Reactivity | 3. Reactivity/Theme | **High** | Small | `packages/styled/src/theme/theme.ts:113` | Silent de-reactivity when using standard JS destructuring. |
| **DEF-10** | Broken Subtree Theming in `ThemeProvider` | 3. Reactivity/Theme | **High** | Medium | `packages/styled/src/theme/theme.ts:150` | `ThemeProvider` corrupts global theme; nested themes impossible. |
| **DEF-11** | `onClick` Unsupported and Silently Ignored | 4. Events & Focus | **High** | Small | `node-types.ts:324`, `reconciler.ts:298` | Universal web click handler silently does nothing; dev trap. |
| **DEF-12** | Non-Standard `KeyEvent` Structure | 4. Events & Focus | **Medium** | Small | `packages/engine/src/input/types.ts:35` | Lowercase keys and nested mods break standard keyboard code. |
| **DEF-13** | Critical Focus Double-Registration Bug | 4. Events & Focus | **Critical** | Medium | `button.tsx:60,82`, `focus.ts:43,190` | Requires double Tab per button; desynchronizes focus ring. |
| **DEF-14** | Intrinsic `<box focusable>` Ignores Custom IDs | 4. Events & Focus | **High** | Small | `focus.ts:204`, `reconciler.ts:449` | Programmatic focus via `setFocus("my-id")` impossible on boxes. |
| **DEF-15** | `parseSizing` Silently Collapses Units to 0 | 5. Layout & Sizing | **High** | Small | `packages/engine/src/ffi/node.ts:440` | `"100px"` or `"auto"` collapses to 0; invalid percents produce `NaN`. |
| **DEF-16** | Unconstrained `string` for Width & Height | 5. Layout & Sizing | **Medium** | Small | `node-types.ts:210-211` | Zero autocompletion and no type safety on dimension props. |
| **DEF-17** | Phantom Types for Deleted Primitives in `dist` | 6. Dead Code & Docs | **High** | Small | `types/components.d.ts:445` | TS compiles deleted primitives; immediate runtime crash. |
| **DEF-18** | Docs Drift Referencing Purged Primitives | 6. Dead Code & Docs | **Medium** | Small | `website/.../primitives.md`, `getting-started.md` | Official documentation tutorial code fails on execution. |

### 3.2 Impact Heatmap & Priority Quadrants

```
▲ HIGH SEVERITY
│  [DEF-17: Phantom Types]    [DEF-06: No className in Styled]
│  [DEF-11: onClick Ignored]  [DEF-13: Focus Double-Registration]
│  [DEF-09: Destructure Trap] [DEF-10: Broken ThemeProvider]
│  [DEF-15: parseSizing Trap] [DEF-07: Raw Text in Box]
│  [DEF-04: @vexart/app Split]
│  [DEF-01: Headless Shadowed]
│  [DEF-14: Focus ID Ignored]
│  [DEF-08: Box vs box Diff]
│─────────────────────────────────────────────────────────────
│  [DEF-03: Ghost Comments]   [DEF-02: Void* Naming Asymmetry]
│  [DEF-16: Loose Width Type]
│  [DEF-12: Non-standard Key]
│  [DEF-05: Missing Utils]
│  [DEF-18: Docs Drift]
▼ LOW SEVERITY
   LOW EFFORT ◄──────────────────────────────────► HIGH EFFORT
```

---

## 4. Actionable Remediation Roadmap

### Phase 1: Quick Wins & Type Safety (Immediate / 1–2 Sprints)
*Focus: Eliminate silent runtime crashes, fix ghost declarations, tighten TypeScript interfaces, and eliminate trivial barrel traps.*

1. **Purge Ghost Declarations (DEF-17 & DEF-03):**
   - Remove `Span`, `RichText`, and `WrapRow` declarations from `types/components.d.ts`.
   - Remove blank layout helper comment blocks from `packages/app/src/barrel.ts` and `packages/app/src/public.ts`.
2. **Add `onClick` Alias & Event Ergonomics (DEF-11 & DEF-12):**
   - In `packages/engine/src/ffi/node-types.ts`, add `onClick?: (event?: PressEvent) => void` as an alias for `onPress`.
   - In `packages/engine/src/input/types.ts`, add flat modifier booleans (`ctrlKey`, `shiftKey`, `altKey`, `metaKey`) to `KeyEvent`.
3. **Tighten Dimension Types & Sizing Parser (DEF-15 & DEF-16):**
   - Type `width` and `height` as `SizingDimension` (`number | "fit" | "grow" | `${number}%` | `${number}px``).
   - In `parseSizing`, handle `${number}px` strings cleanly by parsing them as fixed numbers, guard against `NaN` on malformed percentages, and warn on unrecognized strings.
4. **Complete the Unified Barrel Exports (DEF-01, DEF-04, DEF-05):**
   - Re-export `HeadlessButton` and `ButtonRenderContext` from `packages/app/src/barrel.ts`.
   - Re-export `CanvasContext`, `createParticleSystem`, `registerFont`, `unregisterFont`, `TextSelection`, `children`, and `splitProps` in `barrel.ts`.
   - Align `packages/app/src/index.ts` with `barrel.ts`.
5. **Support Custom `focusId` on Intrinsic Elements (DEF-14):**
   - Update `registerNodeFocusable` in `packages/engine/src/reconciler/focus.ts` to inspect `node.props.focusId ?? node.props.id` before falling back to auto-generated IDs.
6. **Correct Documentation & Website Code Samples (DEF-18):**
   - Audit and replace all legacy primitive references in `website/` and `docs/` with standard `<Box>` and `<Text>`.

### Phase 2: Core Architectural & Runtime Invariants (Medium-Term / 2–3 Sprints)
*Focus: Resolve focus registration desynchronization, fix theming subtree isolation, and unify prop resolution.*

1. **Eliminate Focus Double-Registration (DEF-13):**
   - Redesign `HeadlessButton` so that it does not register an independent hook-level focus entry if the rendered element is an intrinsic focusable node.
   - Unify focus tracking: either the hook manages the focus lifecycle and attaches its ID to the node, or the node registration delegates its keyboard and activation events to the hook context. Ensure pressing Tab advances focus by exactly one visual element per press.
2. **Implement True Subtree Theming (DEF-10):**
   - Refactor `ThemeProvider` to prevent mutating the global `setActiveThemeSig`.
   - Create a contextual signal provider in `ThemeProvider` that provides a localized `themeColors` instance.
   - Update `@vexart/styled` components to consume `useTheme()` context so nested themes apply isolated styles to subtrees without global side-effects.
3. **Unify Prop Precedence and Cascading (DEF-08):**
   - Extract the deep-merge logic for `hoverStyle`, `activeStyle`, and `focusStyle` from `packages/app/src/components/primitives.tsx` into `@vexart/engine/src/ffi/node.ts`.
   - Ensure intrinsic `<box>` and `<Box>` follow identical cascading semantics (`className` -> `style` -> direct props).
4. **Address Raw Text Fragmentation in `<box>` (DEF-07):**
   - In `packages/engine/src/loop/walk-tree.ts`, automatically group contiguous child text nodes under a parent box into a single text layout item.
   - In development mode, warn developers when text is placed inside `<box>` without explicit font styling.

### Phase 3: DX Enhancements & Design System Cohesion (Strategic / 3+ Sprints)
*Focus: Elevate styling ergonomics, eliminate naming inconsistencies, and add proactive developer tooling.*

1. **Universal `className` Support Across `@vexart/styled` (DEF-06):**
   - Update all 26+ styled components in `@vexart/styled` to accept `className?: string`.
   - Internally merge the component's variant styles with user-supplied `className` props using `mergeClassNameProps`, giving developers effortless control over margins, layout, and sizing.
2. **Reactivity Diagnostics & Token Accessor Safeguards (DEF-09):**
   - Wrap `themeColors` in a development-mode Proxy that logs a warning if properties are destructured outside a reactive tracking context.
   - Introduce functional token getters (e.g. `const c = useThemeColors(); c.background()`) for foolproof reactivity in complex components.
3. **Harmonize Design System Naming Conventions (DEF-02):**
   - Standardize all styled components to clean, modern names (`Input`, `Select`, `Dialog`, `Tabs`), while exporting headless primitives under explicit `Headless*` aliases (`HeadlessInput`, `HeadlessSelect`).
   - Retain `Void*` identifiers as deprecated aliases for backward compatibility.
4. **Vexart ESLint Plugin & Language Tools:**
   - Create `@vexart/eslint-plugin` with rules:
     - `no-raw-box-text`: Flags text strings placed directly inside `<box>`.
     - `no-theme-destructure`: Flags `const { ... } = themeColors`.
     - `prefer-on-press`: Suggests `onPress` over `onClick` if desired, or validates event handlers.

---

## 5. Conclusion

Vexart's core graphical and runtime engine is a triumph of modern systems programming, proving that the terminal can be a first-class citizen for modern, GPU-accelerated graphic applications. By methodically executing this Remediation Roadmap, the Vexart team can eliminate the developer friction traps identified in this audit, elevating the developer experience to match the extraordinary caliber of its rendering engine.
