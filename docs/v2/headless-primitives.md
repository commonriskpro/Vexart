# Headless Component Primitives & Interaction Contracts

The `@vexart/headless` package provides 25 unstyled UI behavior primitives. It handles keyboard/mouse interaction, selection state, scroll geometry, focus cycling, and accessibility contracts without imposing styling or visual markup.

---

## 1. Catalog of 25 Headless Primitives

| Category | Primitive | Core Responsibility |
| :--- | :--- | :--- |
| **Inputs** | `Button` | Press states, disabled gates, Enter/Space activation, hover tracking |
| | `Checkbox` | Checked/indeterminate states, Space toggle, focus binding |
| | `Combobox` | Autocomplete input, fuzzy filter list, popover positioning |
| | `Input` | Single-line text editing, cursor movement, selection, paste |
| | `RadioGroup` | Mutually exclusive item selection, arrow key roving focus |
| | `Select` | Trigger, popover overlay, keyboard option navigation |
| | `Slider` | Value clamping, drag scrubbing, arrow/step increments |
| | `Switch` | Boolean toggle state, Space activation, transition coordinates |
| | `Textarea` | Multi-line editing, visual cursor, line wrapping, syntax hooks |
| **Display** | `Code` | Syntax-highlighted code blocks via tree-sitter, tokenized output |
| | `Markdown` | Markdown parser (`marked`), layout AST compilation |
| | `ProgressBar` | Min/max/value range normalization, indeterminate mode |
| **Containers**| `OverlayRoot` | Top-level z-index layer registry for floating UI elements |
| | `Portal` | Subtree relocation out of clipped containers into OverlayRoot |
| | `ScrollView` | Viewport clipping, thumb geometry calculation, mouse-wheel scroll |
| | `Tabs` | Tab list coordination, panel switching, arrow key roving focus |
| **Collections**| `List` | Vertical/horizontal item selection, roving index, keyboard navigation |
| | `Table` | Column definitions, cell rendering, header sorting, row selection |
| | `VirtualList` | Windowed virtualization requiring fixed `itemHeight: number` (no dynamic row heights), overscan buffers |
| **Overlays** | `Dialog` | Modal dialog, backdrop scrim, focus trapping (`pushFocusScope`), Esc close |
| | `createToaster` | Toast notification manager, auto-dismiss timers, queue management |
| | `Tooltip` | Hover delay timer, anchor attachment, auto-flip positioning |
| | `Popover` | Non-modal floating card, click-outside dismissal, anchor tracking |
| **Navigation**| `Diff` | Unified line-by-line diff viewer with status background coloring (no side-by-side or syntax token highlights) |
| **Forms** | `createForm` | Form state manager, sync/async field validation, submission flow |

> **Architectural Note — Catalog Scope**:
> - **Router**: The router primitive was migrated into `@vexart/app` (`useRouter`, `createAppRouter`, `RouteOutlet`).
> - **Accordion**: The `Accordion` component is **not implemented** in Vexart. Do not attempt to import or reference an accordion primitive from `@vexart/headless` or `@vexart/styled`. Use `Tabs` or compound `Button` + collapsible `<box>` state instead.

---

## 2. Core Architectural Patterns

Headless components in Vexart avoid DOM-specific conventions and adopt four pure reactive patterns:

### 1. Render Props (`children` Function)
Primitives expose reactive state to consumers via render prop callbacks:
```tsx
<Button onPress={() => console.log("Pressed")}>
  {(state: ButtonRenderContext) => (
    <box
      backgroundColor={state.pressed ? "#333333" : state.hovered ? "#222222" : "#111111"}
      borderWidth={state.focused ? 1 : 0}
    >
      <text>{state.pressed ? "Submitting..." : "Submit"}</text>
    </box>
  )}
</Button>
```

### 2. Prop Getters
Complex components return functions generating prop bags that bind event handlers, IDs, and accessibility contracts:
```tsx
const { getTriggerProps, getContentProps } = createPopover()
// Spreads handlers, focus handles, and coordinates directly onto intrinsic nodes
```

### 3. Compound Context
Compound components (such as `Select`, `Dialog`, `RadioGroup`) share state across hierarchical children using SolidJS context without prop drilling:
- `Select` coordinates with `SelectTrigger`, `SelectContent`, and `SelectItem`.
- `Dialog` coordinates with `DialogOverlay`, `DialogContent`, and `DialogClose`.

### 4. State Factories
Logic-heavy components expose headless state factory functions returning reactive signals and controller methods:
- `createForm(options)`: Manages field values, touched states, validation errors, and submit handlers.
- `createToaster(options)`: Manages toast lifecycles, queues, and positions.

---

## 3. Terminal Accessibility Invariant

Because terminal emulators lack browser DOM trees, HTML elements, and web accessibility APIs (no `role="button"`, no `aria-expanded`, no screen reader accessibility tree):

1. **Focus Contracts (`useFocus`)**: Every interactive primitive registers a focus entry into the engine's focus tree. Interactive nodes expose `focused()`, `focus()`, and `blur()` handles.
2. **Focus Trapping (`pushFocusScope`)**: Overlays and modals (`Dialog`) push a focus scope onto the focus stack. Keyboard tab navigation is strictly trapped within the overlay until popped.
3. **Keyboard Navigation & Keymaps**:
   - **Tab Cycling**: `Tab` and `Shift+Tab` cycle sequentially across focusable items.
   - **Vim Navigation**: Collections (`List`, `Table`, `VirtualList`, `Select`) support standard arrow keys AND Vim navigation keys (`j` / `k` for vertical, `h` / `l` for horizontal).
   - **Action Keys**: `Space` and `Enter` activate buttons, checkboxes, and select items. `Escape` dismisses modals, tooltips, and popovers.

---

## 4. Public API Exports (`packages/headless/src/public.ts`)

### Inputs
- `Button`: `Button`, `ButtonRenderContext`, `ButtonProps`
- `Checkbox`: `Checkbox`, `CheckboxRenderContext`, `CheckboxProps`
- `Combobox`: `Combobox`, `ComboboxOption`, `ComboboxInputContext`, `ComboboxOptionContext`, `ComboboxProps`
- `Input`: `Input`, `InputRenderContext`, `InputProps`, `InputTheme`
- `RadioGroup`: `RadioGroup`, `RadioOption`, `RadioOptionContext`, `RadioGroupProps`
- `Select`: `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectOption`, `SelectTriggerContext`, `SelectOptionContext`, `SelectProps`, `SelectTriggerProps`, `SelectContentProps`, `SelectItemProps`
- `Slider`: `Slider`, `SliderTrackProps`, `SliderRenderContext`, `SliderProps`
- `Switch`: `Switch`, `SwitchRenderContext`, `SwitchProps`
- `Textarea`: `Textarea`, `TextareaTheme`, `KeyBinding`, `KeyBindingAction`, `VisualCursor`, `TextareaHandle`, `TextareaProps`

### Display
- `Code`: `Code`, `CodeTheme`, `CodeProps`
- `Markdown`: `Markdown`, `MarkdownTheme`, `MarkdownProps`
- `ProgressBar`: `ProgressBar`, `ProgressBarRenderContext`, `ProgressBarProps`

### Containers
- `OverlayRoot`: `OverlayRoot`, `OverlayRootProps`
- `Portal`: `Portal`, `PortalProps`
- `ScrollView`: `ScrollView`, `ScrollViewProps`
- `Tabs`: `Tabs`, `TabItem`, `TabRenderContext`, `TabsProps`

### Collections
- `List`: `List`, `ListItemContext`, `ListProps`
- `Table`: `Table`, `TableColumn`, `TableCellContext`, `TableProps`
- `VirtualList`: `VirtualList`, `VirtualListItemContext`, `VirtualListProps`

### Overlays
- `Dialog`: `Dialog`, `DialogOverlay`, `DialogContent`, `DialogClose`, `DialogProps`, `DialogOverlayProps`, `DialogContentProps`, `DialogCloseProps`
- `Toaster`: `createToaster`, `ToastVariant`, `ToastPosition`, `ToastData`, `ToastInput`, `ToasterOptions`, `ToasterHandle`
- `Tooltip & Popover`: `Tooltip`, `Popover`, `TooltipProps`, `PopoverTriggerContext`, `PopoverProps`

### Navigation & Forms
- `Diff`: `Diff`, `DiffTheme`, `DiffProps`
- `Forms`: `createForm`, `FieldValidator`, `AsyncFieldValidator`, `FormOptions`, `FieldState`, `FormHandle`

### Re-Exported Engine Contracts
- `CreateExtmarkOptions`, `Extmark`, `NodeMouseEvent`, `Modifiers`, `ScrollHandle`, `SimpleThemeRules`, `StyleDefinition`, `SyntaxStyle`, `ThemeTokenStyle`, `KeyEvent`
