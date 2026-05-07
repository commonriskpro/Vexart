---
title: Styled Components
description: Pre-themed Void design system — dark, shadcn-inspired.
---

`@vexart/styled` provides opinionated themed components built on `@vexart/headless`.

## Usage

```tsx
import { Button, Card, CardContent, Badge, colors, space } from "@vexart/styled"

<Card>
  <CardContent>
    <Badge variant="secondary">New</Badge>
    <Button variant="primary" size="lg" onPress={() => save()}>
      Save Changes
    </Button>
  </CardContent>
</Card>
```

## Button

| Variant | Description |
|---------|-------------|
| `default` | Primary action (light bg) |
| `secondary` | Secondary action (dark bg) |
| `outline` | Bordered, transparent bg |
| `ghost` | No border, transparent |
| `destructive` | Red for dangerous actions |

Sizes: `xs`, `sm`, `default`, `lg`

## Card

`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction`

## Layout & Display

| Component | Purpose |
|-----------|---------|
| `Avatar` | User avatar (sm, default, lg) |
| `Badge` | Status indicator (default, secondary, outline, destructive) |
| `Separator` | Visual separator (horizontal, vertical) |
| `Skeleton` | Loading placeholder |

## Form Components

| Component | Wraps |
|-----------|-------|
| `VoidCheckbox` | Headless Checkbox |
| `VoidCombobox` | Headless Combobox |
| `VoidInput` | Headless Input |
| `VoidTextarea` | Headless Textarea (multi-line editor, syntax highlighting) |
| `VoidRadioGroup` | Headless RadioGroup |
| `VoidSelect` | Headless Select |
| `VoidSlider` | Headless Slider |
| `VoidSwitch` | Headless Switch |

## Overlay Components

| Component | Purpose |
|-----------|---------|
| `VoidDialog` | Modal dialog (+ Title, Description, Footer) |
| `VoidDropdownMenu` | Context/dropdown menu (+ Trigger, Content, Item, Separator, Label) |
| `VoidPopover` | Popover panel |
| `VoidTooltip` | Tooltip |
| `createVoidToaster` | Toast notifications |

## Data & Collection Components

| Component | Purpose |
|-----------|---------|
| `VoidTable` | Styled data table |
| `VoidTabs` | Styled tab switcher |
| `VoidProgress` | Styled progress bar |
| `VoidList` | Styled selectable list with keyboard navigation |
| `VoidVirtualList` | Styled virtualized list container |
| `VoidScrollView` | Styled scrollable container |

## Content Components

| Component | Purpose |
|-----------|---------|
| `VoidCode` | Styled syntax-highlighted code block |
| `VoidMarkdown` | Styled markdown renderer |
| `VoidDiff` | Styled unified diff viewer |

## Typography

`H1`, `H2`, `H3`, `H4`, `P`, `Lead`, `Large`, `Small`, `Muted`

```tsx
import { H1, P, Muted } from "@vexart/styled"

<H1>Page Title</H1>
<P>Body text with standard sizing and line height.</P>
<Muted>Secondary information in muted color.</Muted>
```
