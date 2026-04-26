# Creating Theme Packages for Vexart

This guide explains how to build a custom design system (theme package) for Vexart.
If Void is shadcn, your package is your own Material, Catppuccin, Nord, or Dracula.

## Architecture

Vexart has a two-layer component system:

```
@vexart/headless  (headless)    — behavior only: focus, keyboard, state
your-theme       (styled)      — visual only: colors, spacing, shadows, render functions
```

Headless components provide **zero visual output**. They expose state via render props
or theme props, and your theme package provides ALL the visuals.

There are two patterns depending on the component type:

| Component type | Pattern | Examples |
|---------------|---------|----------|
| Interactive (simple) | **Render prop** — you render everything | Button, Checkbox, Switch, List, Tabs, RadioGroup, Select, Input, ProgressBar |
| Content (complex) | **Theme prop** — you pass a typed config object | Code, Markdown, Diff, Textarea |

## Step 1: Define your tokens

Create a tokens file with your design language. Vexart accepts colors as hex strings
(`"#rrggbb"` or `"#rrggbbaa"`) or packed u32 RGBA (`0xRRGGBBAAff`).

```typescript
// packages/nord/src/tokens.ts

// Colors — hex strings
export const colors = {
  // Polar Night
  background:    "#2e3440",
  foreground:    "#eceff4",
  card:          "#3b4252",
  muted:         "#4c566a",
  mutedFg:       "#d8dee9",
  primary:       "#88c0d0",
  primaryFg:     "#2e3440",
  secondary:     "#434c5e",
  accent:        "#81a1c1",
  destructive:   "#bf616a",
  border:        "#4c566a",
  ring:          "#88c0d0",
} as const

// Spacing (px)
export const space = {
  xs: 2, sm: 4, md: 8, lg: 16, xl: 24,
} as const

// Radius (px)
export const radius = {
  sm: 4, md: 6, lg: 8, xl: 12, full: 9999,
} as const

// Font sizes (px)
export const font = {
  xs: 10, sm: 12, base: 14, lg: 16, xl: 20,
} as const

// Shadows — color MUST be u32 (packed RGBA) because the Rust/WGPU paint engine
// operates on raw pixel data. Use a helper to convert:
function hexToU32(h: string): number {
  const raw = h.startsWith("#") ? h.slice(1) : h
  if (raw.length === 6) return (parseInt(raw, 16) << 8 | 0xff) >>> 0
  if (raw.length === 8) return parseInt(raw, 16) >>> 0
  return 0
}

type Shadow = { x: number; y: number; blur: number; color: number }

export const shadows: Record<string, Shadow[]> = {
  sm: [{ x: 0, y: 1, blur: 3, color: hexToU32("#00000066") }],
  md: [
    { x: 0, y: 4, blur: 6, color: hexToU32("#00000066") },
    { x: 0, y: 2, blur: 4, color: hexToU32("#0000004d") },
  ],
}
```

> **Why hex strings for colors but u32 for shadows?**
> Vexart's `parseColor()` in the render loop converts hex strings to u32 automatically
> for backgroundColor, borderColor, text color, and glow color.
> But shadow colors bypass parseColor and go directly to the Rust/WGPU paint engine,
> which expects raw u32 RGBA values.

## Step 2: Wrap interactive components (render prop pattern)

Interactive headless components expose a **render function** that receives
the component's state. You provide the visual output.

### Available render contexts

Each headless component passes a typed context to your render function:

| Component | Render prop | Context type | Fields |
|-----------|------------|--------------|--------|
| `Button` | `renderButton` | `ButtonRenderContext` | `focused`, `pressed`, `disabled`, `buttonProps` |
| `Checkbox` | `renderCheckbox` | `CheckboxRenderContext` | `checked`, `focused`, `disabled`, `toggleProps` |
| `Switch` | `renderSwitch` | `SwitchRenderContext` | `checked`, `focused`, `disabled`, `toggleProps` |
| `Input` | `renderInput` | `InputRenderContext` | `value`, `displayText`, `showPlaceholder`, `cursor`, `blink`, `focused`, `disabled`, `selection` |
| `List` | `renderItem` | `ListItemContext` | `selected`, `focused`, `index`, `itemProps` |
| `Tabs` | `renderTab` | `TabRenderContext` | `active`, `focused`, `index`, `tabProps` |
| `RadioGroup` | `renderOption` | `RadioOptionContext` | `selected`, `focused`, `disabled`, `index`, `optionProps` |
| `Select` | `renderTrigger` / `renderOption` | `SelectTriggerContext` / `SelectOptionContext` | trigger: `selectedLabel`, `placeholder`, `open`, `focused`, `disabled`; option: `highlighted`, `selected`, `disabled` |
| `ProgressBar` | `renderBar` | `ProgressBarRenderContext` | `ratio`, `fillWidth`, `width`, `height`, `value`, `max` |
| `Table` | `renderCell` / `renderHeader` / `renderRow` | `TableCellContext` | `selected`, `focused`, `rowIndex`, `rowProps` |

### Example: NordButton

```typescript
// packages/nord/src/button.tsx
import { Button } from "@vexart/headless"
import type { ButtonRenderContext } from "@vexart/headless"
import { colors, space, radius, font } from "./tokens"

export type NordButtonProps = {
  label: string
  onPress?: () => void
  disabled?: boolean
  variant?: "primary" | "secondary" | "ghost"
  focusId?: string
}

export function NordButton(props: NordButtonProps) {
  const variant = () => props.variant ?? "primary"

  return (
    <Button
      onPress={props.onPress}
      disabled={props.disabled}
      focusId={props.focusId}
      renderButton={(ctx: ButtonRenderContext) => {
        // Derive colors from variant + state
        const bg = ctx.pressed
          ? colors.accent
          : variant() === "primary"
            ? colors.primary
            : variant() === "secondary"
              ? colors.secondary
              : "transparent"

        const fg = variant() === "primary" ? colors.primaryFg : colors.foreground
        const borderColor = ctx.focused ? colors.ring : colors.border

        return (
          <box
            backgroundColor={bg}
            cornerRadius={radius.md}
            padding={space.sm}
            paddingX={space.lg}
            borderColor={borderColor}
            borderWidth={ctx.focused ? 2 : variant() === "ghost" ? 0 : 1}
          >
            <text
              color={ctx.disabled ? colors.mutedFg : fg}
              fontSize={font.sm}
            >
              {props.label}
            </text>
          </box>
        )
      }}
    />
  )
}
```

### Example: NordSwitch

```typescript
// packages/nord/src/switch.tsx
import { Switch } from "@vexart/headless"
import type { SwitchRenderContext } from "@vexart/headless"
import { colors, space, font } from "./tokens"

export function NordSwitch(props: {
  checked: boolean
  onChange?: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <Switch
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
      renderSwitch={(ctx: SwitchRenderContext) => (
        <box direction="row" gap={space.md} alignY="center">
          <box
            width={36} height={20}
            backgroundColor={ctx.checked ? colors.primary : colors.muted}
            cornerRadius={10}
            borderColor={ctx.focused ? colors.ring : colors.border}
            borderWidth={ctx.focused ? 2 : 1}
          >
            <box
              width={14} height={14}
              backgroundColor={colors.foreground}
              cornerRadius={7}
              paddingLeft={ctx.checked ? 19 : 3}
              paddingTop={3}
            />
          </box>
          {props.label ? (
            <text color={ctx.disabled ? colors.mutedFg : colors.foreground} fontSize={font.sm}>
              {props.label}
            </text>
          ) : null}
        </box>
      )}
    />
  )
}
```

### Example: NordList

```typescript
// packages/nord/src/list.tsx
import { List } from "@vexart/headless"
import type { ListItemContext } from "@vexart/headless"
import { colors, space, font } from "./tokens"

export function NordList(props: {
  items: string[]
  selectedIndex: number
  onSelectedChange?: (i: number) => void
}) {
  return (
    <List
      items={props.items}
      selectedIndex={props.selectedIndex}
      onSelectedChange={props.onSelectedChange}
      renderItem={(item: string, ctx: ListItemContext) => (
        <box
          backgroundColor={ctx.selected ? colors.accent : colors.card}
          padding={space.sm}
          paddingX={space.md}
        >
          <text
            color={ctx.selected ? colors.foreground : colors.mutedFg}
            fontSize={font.sm}
          >
            {item}
          </text>
        </box>
      )}
      renderList={(children) => (
        <box direction="column" cornerRadius={radius.md} borderColor={colors.border} borderWidth={1}>
          {children}
        </box>
      )}
    />
  )
}
```

## Step 3: Wrap content components (theme prop pattern)

Content components (Code, Markdown, Diff, Textarea) have too many visual elements
for individual render props. Instead, they accept a `theme` prop — a typed object
with all the visual configuration.

### Available theme types

| Component | Theme type | Key fields |
|-----------|-----------|------------|
| `Code` | `CodeTheme` | `bg`, `lineNumberFg`, `radius`, `padding` |
| `Markdown` | `MarkdownTheme` | `fg`, `muted`, `heading`, `link`, `bold`, `italic`, `codeFg`, `codeBg`, `codeBlockBg`, `blockquoteBorder`, `listBullet`, `tableBg`, `tableHeader`, `hrColor`, `del` |
| `Diff` | `DiffTheme` | `fg`, `muted`, `bg`, `radius`, `addedBg`, `removedBg`, `contextBg`, `addedSign`, `removedSign`, `lineNumberFg`, `lineNumberBg`, `headerBg`, `headerFg`, `linePadding` |
| `Textarea` | `TextareaTheme` | `accent`, `fg`, `muted`, `bg`, `disabledBg`, `border`, `radius`, `padding` |

All fields in a theme type are **required in the type** but **optional in the prop**
(`theme?: Partial<ThemeType>`). Unset fields use sensible dark defaults.

### Example: NordCode

```typescript
// packages/nord/src/code.tsx
import { Code } from "@vexart/headless"
import type { CodeTheme } from "@vexart/headless"
import type { SyntaxStyle } from "@vexart/engine"
import { colors, radius, space } from "./tokens"

const nordCodeTheme: CodeTheme = {
  bg: colors.card,
  lineNumberFg: colors.mutedFg,
  radius: radius.md,
  padding: space.md,
}

export function NordCode(props: {
  content: string
  language: string
  syntaxStyle: SyntaxStyle
  width?: number | string
}) {
  return (
    <Code
      content={props.content}
      language={props.language}
      syntaxStyle={props.syntaxStyle}
      width={props.width}
      theme={nordCodeTheme}
    />
  )
}
```

### Example: NordMarkdown

```typescript
// packages/nord/src/markdown.tsx
import { Markdown } from "@vexart/headless"
import type { MarkdownTheme } from "@vexart/headless"
import type { SyntaxStyle } from "@vexart/engine"
import { colors } from "./tokens"

const nordMarkdownTheme: MarkdownTheme = {
  fg:               colors.foreground,
  muted:            colors.mutedFg,
  heading:          colors.primary,
  link:             "#88c0d0",
  bold:             "#eceff4",
  italic:           "#b48ead",
  codeFg:           "#ebcb8b",
  codeBg:           "#3b4252",
  codeBlockBg:      colors.card,
  blockquoteBorder: "#81a1c1",
  listBullet:       "#88c0d0",
  tableBg:          colors.card,
  tableHeader:      colors.primary,
  hrColor:          colors.border,
  del:              colors.mutedFg,
}

export function NordMarkdown(props: {
  content: string
  syntaxStyle: SyntaxStyle
  width?: number | string
}) {
  return (
    <Markdown
      content={props.content}
      syntaxStyle={props.syntaxStyle}
      width={props.width}
      theme={nordMarkdownTheme}
    />
  )
}
```

## Step 4: Toast (factory pattern)

Toast uses `createToaster()` — a factory that returns an imperative `toast()` function
and a `<Toaster>` component. Your theme provides `renderToast`:

```typescript
// packages/nord/src/toast.tsx
import { createToaster } from "@vexart/headless"
import type { ToastData, ToasterHandle } from "@vexart/headless"
import { colors, radius, space, font, shadows } from "./tokens"

export function createNordToaster(): ToasterHandle {
  return createToaster({
    position: "bottom-right",
    maxVisible: 5,
    defaultDuration: 3000,
    gap: space.sm,
    padding: space.lg,
    renderToast(t: ToastData, dismiss: () => void) {
      const accentColor =
        t.variant === "error"   ? colors.destructive :
        t.variant === "success" ? "#a3be8c" :
        t.variant === "warning" ? "#ebcb8b" :
        t.variant === "info"    ? colors.primary :
        colors.foreground

      return (
        <box
          direction="column"
          backgroundColor={colors.card}
          cornerRadius={radius.md}
          borderColor={colors.border}
          borderWidth={1}
          padding={space.md}
          paddingX={space.lg}
          gap={space.xs}
          minWidth={240}
          maxWidth={360}
          shadow={shadows.md}
        >
          <text color={accentColor} fontSize={font.sm}>{t.message}</text>
          {t.description ? (
            <text color={colors.mutedFg} fontSize={font.xs}>{t.description}</text>
          ) : null}
        </box>
      )
    },
  })
}
```

## Step 5: Export everything

```typescript
// packages/nord/src/index.ts

// Tokens
export { colors, space, radius, font, shadows } from "./tokens"

// Components
export { NordButton } from "./button"
export { NordSwitch } from "./switch"
export { NordList } from "./list"
export { NordCode } from "./code"
export { NordMarkdown } from "./markdown"
export { createNordToaster } from "./toast"
// ... etc
```

## Step 6: Use it

```typescript
import { mount, createTerminal } from "@vexart/engine"
import { NordButton, NordSwitch, NordList, colors } from "@nord/vexart-theme"

function App() {
  return (
    <box width="100%" height="100%" backgroundColor={colors.background} padding={16}>
      <NordButton label="Click me" onPress={() => console.log("pressed")} />
      <NordSwitch checked={true} label="Dark mode" />
    </box>
  )
}

async function main() {
  const term = await createTerminal()
  mount(() => <App />, term)
}

main()
```

## Quick reference: component → pattern

| Component | Headless import | Your wrapper provides |
|-----------|----------------|----------------------|
| `Button` | `Button`, `ButtonRenderContext` | `renderButton(ctx)` → JSX |
| `Checkbox` | `Checkbox`, `CheckboxRenderContext` | `renderCheckbox(ctx)` → JSX |
| `Switch` | `Switch`, `SwitchRenderContext` | `renderSwitch(ctx)` → JSX |
| `Input` | `Input`, `InputRenderContext` | `renderInput(ctx)` → JSX |
| `List` | `List`, `ListItemContext` | `renderItem(item, ctx)` → JSX |
| `Tabs` | `Tabs`, `TabRenderContext` | `renderTab(tab, ctx)` → JSX |
| `RadioGroup` | `RadioGroup`, `RadioOptionContext` | `renderOption(opt, ctx)` → JSX |
| `Select` | `Select`, `SelectTriggerContext`, `SelectOptionContext` | `renderTrigger(ctx)` + `renderOption(opt, ctx)` + `renderContent(children)` → JSX |
| `ProgressBar` | `ProgressBar`, `ProgressBarRenderContext` | `renderBar(ctx)` → JSX |
| `Table` | `Table`, `TableCellContext` | `renderCell(value, col, idx, ctx)` + optional `renderHeader`, `renderRow`, `renderTable` |
| `Code` | `Code`, `CodeTheme` | `theme: CodeTheme` object |
| `Markdown` | `Markdown`, `MarkdownTheme` | `theme: MarkdownTheme` object |
| `Diff` | `Diff`, `DiffTheme` | `theme: DiffTheme` object |
| `Textarea` | `Textarea`, `TextareaTheme` | `theme: Partial<TextareaTheme>` object |
| `Toast` | `createToaster`, `ToastData` | `renderToast(toast, dismiss)` → JSX |
| `Dialog` | `Dialog` (compound) | Wrap `Dialog.Overlay` / `Dialog.Content` / `Dialog.Close` with your styles |
| `Tooltip` | `Tooltip`, `TooltipProps` | `renderTooltip(content)` → JSX |
| `Popover` | `Popover`, `PopoverTriggerContext` | `renderTrigger(ctx)` + `renderContent()` → JSX |
| `Combobox` | `Combobox`, `ComboboxInputContext`, `ComboboxOptionContext` | `renderInput(ctx)` + `renderOption(opt, ctx)` + `renderContent(children)` → JSX |
| `Slider` | `Slider`, `SliderRenderContext` | `renderSlider(ctx)` → JSX. Context includes `trackProps` (spread on track for mouse) and `dragging` (boolean). |
| `VirtualList` | `VirtualList`, `VirtualListItemContext` | `renderItem(item, index, ctx)` → JSX |
| `Router` | `Router`, `Route`, `NavigationStack` | No visual — pure navigation logic |

## Rules

1. **Never import from `@vexart/styled`** in your theme package. Void is a sibling, not a dependency.
2. **Shadow colors must be u32** — use `hexToU32()` helper. All other colors can be hex strings.
3. **Theme prop fields are all optional** — the headless component has sensible dark defaults. Override only what you need.
4. **Render props receive immutable context** — read state, return JSX. Never mutate the context.
5. **Use `<box>` and `<text>` intrinsics** — these are the only two visual building blocks (plus `<img>` for images). All Vexart rendering goes through them.
6. **For Phase 3 components** — Tooltip, Popover, Combobox, Slider, and VirtualList all follow the render prop pattern. Wrap them exactly like Button/Checkbox/Switch.
7. **createForm is framework-level** — don't wrap it in your theme. It's consumed directly. Theme packages only need to style the individual Input, Button, etc. components that form consumers use.
