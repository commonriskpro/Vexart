# Headless Interaction Primitives & Accessibility Contracts

The `@vexart/headless` package lives at Tier 3 of the Vexart architecture. It delivers exactly **25 unstyled UI interaction primitives** with zero styling opinions. It manages keyboard focus graphs, mouse capture, Vim navigation bindings, scroll geometry, selection state, and modal focus traps, leaving 100% of visual rendering to consumer components or `@vexart/styled`.

---

## 1. Catalog of Exactly 25 Headless Primitives

The 25 primitives are organized into **23 unstyled UI components** and **2 state factories**:

| Category | Primitive | Core Responsibility | Keyboard & Interaction Contract |
| :--- | :--- | :--- | :--- |
| **Inputs** (9) | `Button` | Press/hover/focus states, disabled gates. | `Enter`, `Space` activation; click handling. |
| | `Checkbox` | Checked, unchecked, and indeterminate states. | `Space` toggle; Tab focus cycling. |
| | `Combobox` | Searchable filter list with popover overlay. | Arrow keys / `j`/`k`, `Enter` select, `Esc` dismiss. |
| | `Input` | Single-line text input with subpixel cursor quad. | Character typing, `Left`/`Right`/`Home`/`End`, paste. |
| | `RadioGroup` | Mutually exclusive item selection. | Arrow keys / `h`/`l` roving focus selection. |
| | `Select` | Dropdown menu selection with option list. | `Enter`/`Space` open, arrows / `j`/`k` select, `Esc` close. |
| | `Slider` | Value clamping, scrubbing, step snapping. | `Left`/`Right` / `h`/`l` decrement/increment, drag. |
| | `Switch` | Binary boolean toggle switch. | `Space` / `Enter` toggle; click activation. |
| | `Textarea` | Multi-line text editor with line breaks. | Multi-line navigation, visual cursor, bracketed paste. |
| **Display** (3) | `Code` | Syntax-highlighted code blocks. | Tree-Sitter WASM tokenization, line numbers. |
| | `Markdown` | Markdown document renderer. | `marked` token parsing into layout AST. |
| | `ProgressBar` | Progress range normalization (0–100%). | Accessible min/max value bounds, indeterminate mode. |
| **Containers** (4)| `OverlayRoot` | Top-level z-index layer coordinate manager. | Manages floating popovers, tooltips, and dialogs. |
| | `Portal` | Subtree relocation out of clipped containers. | Transports children into `OverlayRoot`. |
| | `ScrollView` | Viewport clipping and scrollbar physics. | Mouse wheel, trackpad scroll, drag thumb, arrow keys. |
| | `Tabs` | Tabbed panel coordination. | `Left`/`Right` / `h`/`l` tab switching, panel focus. |
| **Collections** (3)| `List` | Vertical/horizontal selectable item list. | Arrows / `j`/`k` item navigation, `Enter` selection. |
| | `Table` | Tabular row/column grid with row selection. | Vertical navigation via `Down`/`Up` (`j`/`k`), header sorting. |
| | `VirtualList` | Virtualized windowing for large lists. | Mandates fixed `itemHeight: number`; overscan buffers. |
| **Overlays** (3) | `Dialog` | Modal dialog with focus trap. | Focus scope trap, `Esc` close, focus restoration. |
| | `Tooltip` | Hover-activated contextual tooltip. | Hover entry/exit delay timers, auto-flip positioning. |
| | `Popover` | Non-modal anchor-attached floating card. | Outside-click plane dismiss, anchor alignment. |
| **Navigation** (1) | `Diff` | Line-by-line diff viewer. | Color-coded status lines (additions, deletions). |
| **State Factories** (2)| `createForm` | Form state machine and validation manager. | Synchronous/asynchronous validation, dirty tracking. |
| | `createToaster`| Toast notification manager and queue. | Timed auto-dismiss, manual dismiss, stack ordering. |

> **ARCHITECTURAL NOTE — ACCORDION PRIMITIVE**:
> The `Accordion` component is **not implemented** in Vexart. Do not attempt to import or reference an accordion primitive. Build expandable views using `Tabs` or compound `Button` toggles with collapsible `<box>` containers.

---

## 2. Core Architectural Patterns

Headless components operate without a web DOM or CSS stylesheets, employing four reactive patterns:

### 2.1 Named Render Props Pattern
Rather than taking a generic render function as `children`, headless primitives accept explicit named render-prop callbacks (e.g. `renderButton`, `renderCheckbox`, `renderItem`). The callback receives a stable context bag containing reactive states and interaction props:

```tsx
import { Button } from "vexart"

<Button
  onPress={() => submitForm()}
  renderButton={(ctx) => (
    <box
      {...ctx.buttonProps}
      backgroundColor={ctx.pressed ? "#222" : ctx.hovered ? "#333" : "#111"}
      borderWidth={ctx.focused ? 1 : 0}
      borderColor="#737373"
      padding={8}
      cornerRadius={6}
    >
      <text color="#fafafa">
        {ctx.pressed ? "Processing..." : "Submit"}
      </text>
    </box>
  )}
/>
```

### 2.2 Popover & Anchor Declarative Pattern
Components with floating overlays (`Popover`, `Tooltip`) use declarative trigger and content callbacks:

```tsx
import { Popover, createSignal } from "vexart"

const [open, setOpen] = createSignal(false)

<Popover
  open={open()}
  onOpenChange={setOpen}
  renderTrigger={(ctx) => (
    <box focusable onPress={ctx.toggle}>
      <text>Open Popover</text>
    </box>
  )}
  renderContent={() => (
    <box padding={8} backgroundColor="#171717" cornerRadius={6}>
      <text color="#fafafa">Popover Content</text>
    </box>
  )}
/>
```

### 2.3 Compound Contexts
Compound components coordinate state across hierarchical children using SolidJS context:
- `Select` coordinates with `SelectTrigger`, `SelectContent`, and `SelectItem`.
- `Dialog` coordinates with `DialogOverlay`, `DialogContent`, and `DialogClose`.

### 2.4 Headless State Factories
Complex logic is decoupled into state factories:
- `createForm(options)`: Tracks form values, touched states, synchronous/asynchronous validation errors, and submit triggers.
- `createToaster(options)`: Manages toast queues, auto-dismiss timers, and placement coordinates.

---

## 3. Terminal Accessibility Contracts

Because terminal emulators lack browser accessibility trees (no DOM, no ARIA roles, no screen reader bridges), `@vexart/headless` implements terminal-specific accessibility:

### 3.1 Focus Graphs (`useFocus`)
Interactive components register an entry in the engine's focus tree:
- Nodes expose `focused()`, `focus()`, and `blur()` handles.
- Tab Order: Sequential cycling via `Tab` and `Shift+Tab`.

### 3.2 Modal Focus Trapping (`pushFocusScope`)
Modal overlays (`Dialog`) push a focus scope onto the stack:
- Tab navigation is strictly locked within the modal's children.
- On close, focus automatically restores to the element that triggered the dialog (verified via node registry existence checks to prevent crashes on unmounted triggers).

### 3.3 Keyboard Navigation & Vim Keymaps
Collection and selection primitives support standard arrow keys and Vim navigation:
- `Tabs`: `Left` / `Right` (or `h` / `l`) to cycle through active tab panels.
- `Table`: `Down` / `Up` (or `j` / `k`) to navigate table rows vertically (table navigation selects rows, not individual cells across columns).
- `List` & `VirtualList`: `Down` / `Up` (or `j` / `k`) for vertical item selection.
- `Slider`: `Left` / `Right` (or `h` / `l`) for value decrements and increments.

### 3.4 Outside-Click Dismissal
Floating popovers (`Popover`, `Combobox`, `Tooltip`) mount an invisible exterior capture plane:
- Mouse clicks outside the active overlay boundaries immediately trigger dismiss callbacks without blocking the clicked element.

---

## 4. Subpixel Input Cursor Architecture (Fix #31)

Historic terminal UI engines implemented text cursors by mutating strings, inserting `"│"` or `" "` at the cursor index at 2Hz. In MSDF proportional typography, this caused horizontal text jitter and forced 60 FPS Flexily layout passes while idle.

`@vexart/headless` `Input` uses an independent cursor quad overlay positioned via engine floating props:
1. **Immutable Text**: The text element `<text>{value()}</text>` remains clean and unmodified.
2. **Subpixel Quad Projection**: The cursor renders as a floating quad relative to the parent box:
   ```tsx
   <box
     floating="parent"
     floatOffset={{ x: cursorX(), y: 0 }}
     width={1.5}
     height={lineHeight}
     backgroundColor={cursorColor}
   />
   ```
3. **Zero-Layout Blinking**: The cursor blink cycle toggles visibility without altering text dimensions, triggering zero Flexily layout recomputations and zero text re-layouts.

---

## 5. VirtualList Fixed Height Invariant

`VirtualList` renders tens of thousands of rows with minimal memory by virtualizing visible rows:

> **CRITICAL INVARIANT — FIXED ITEM HEIGHT & RENDER PROP**:
> `VirtualList` strictly requires a fixed numeric `itemHeight: number` prop, a `height: SizingUnit` viewport prop, and an explicit `renderItem` callback:
> ```tsx
> <VirtualList
>   items={largeArray}
>   itemHeight={24} // MANDATORY: Dynamic row heights are prohibited
>   height={480}    // Visible viewport height (number or "grow")
>   renderItem={(item, index, ctx) => (
>     <box height={24} backgroundColor={ctx.selected ? "#2a2a4e" : "transparent"}>
>       <text color="#fff">{item.label}</text>
>     </box>
>   )}
> />
> ```
> Dynamic or percentage row heights are mathematically incompatible with the zero-allocation index windowing algorithm.
