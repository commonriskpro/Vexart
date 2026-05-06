---
title: Headless Components
description: 26 behavior-first components with render props.
---

`@vexart/headless` provides logic-only components. No visual opinions — you control every pixel.

## Inputs

| Component | Props | Key Feature |
|-----------|-------|-------------|
| `Button` | `ButtonProps` | `ctx.buttonProps` — click + Enter/Space |
| `Checkbox` | `CheckboxProps` | `ctx.toggleProps` — click to toggle |
| `Switch` | `SwitchProps` | `ctx.toggleProps` — click to toggle |
| `RadioGroup` | `RadioGroupProps` | `ctx.optionProps` — click to select |
| `Input` | `InputProps` | Single-line text input |
| `Textarea` | `TextareaProps` | Multi-line editor (2D cursor, syntax) |
| `Slider` | `SliderProps` | Click-to-position + drag |
| `Select` | `SelectProps` | Dropdown with keyboard nav |
| `Combobox` | `ComboboxProps` | Autocomplete with filtering |

## Display

| Component | Props | Purpose |
|-----------|-------|---------|
| `Code` | `CodeProps` | Syntax-highlighted code block |
| `Markdown` | `MarkdownProps` | Markdown renderer (inline styling) |
| `ProgressBar` | `ProgressBarProps` | Progress indicator |

## Containers

| Component | Props | Purpose |
|-----------|-------|---------|
| `OverlayRoot` | `OverlayRootProps` | Overlay container root |
| `Portal` | `PortalProps` | Render at root/overlay level |
| `ScrollView` | `ScrollViewProps` | Scrollable with visual scrollbar |
| `Tabs` | `TabsProps` | Tab switcher (`ctx.tabProps`) |

## Collections

| Component | Props | Purpose |
|-----------|-------|---------|
| `List` | `ListProps` | Scrollable selectable list |
| `Table` | `TableProps` | Data table with row selection |
| `VirtualList` | `VirtualListProps` | O(1) virtualized scroll |

## Overlays

| Component | Props | Purpose |
|-----------|-------|---------|
| `Dialog` | `DialogProps` | Modal with focus trap + Escape |
| `Tooltip` | `TooltipProps` | Delayed tooltip on hover |
| `Popover` | `PopoverProps` | Controlled popover panel |
| `createToaster` | `ToasterOptions` | Imperative toast notifications |

## Navigation

| Component | Props | Purpose |
|-----------|-------|---------|
| `Router`, `Route` | `RouterProps` | Flat navigation |
| `NavigationStack` | `NavigationStackProps` | Stack navigation (push/pop) |
| `Diff` | `DiffProps` | Unified diff viewer |

## Forms

| Export | Purpose |
|--------|---------|
| `createForm` | Form validation factory (sync/async validators) |

## Hooks

- `useRouterContext` — access router state
- `useStack` — access navigation stack
- `ExtmarkManager` — re-exported from engine for editor integration
