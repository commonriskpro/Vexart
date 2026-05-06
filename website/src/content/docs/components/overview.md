---
title: Component Overview
description: Vexart's two-layer component architecture.
---

Vexart separates **behavior** from **presentation** using a headless architecture inspired by Radix UI.

## Two Layers

```
@vexart/headless  →  Behavior only (focus, keyboard, state)
@vexart/styled    →  Pre-styled with Void design tokens
```

### Headless Components

Logic-first components with render props. You control the visual output entirely:

```tsx
import { Button } from "@vexart/headless"

<Button
  onPress={() => save()}
  renderButton={(ctx) => (
    <box {...ctx.buttonProps} padding={8} cornerRadius={6}
         backgroundColor={0x2563ebff}>
      <text color={0xffffffff}>Save</text>
    </box>
  )}
/>
```

The `ctx.buttonProps` object gives you `{ focusable, onPress }` — spread it on your root element for automatic keyboard + mouse support.

### Styled Components

Pre-themed wrappers using the Void design system (dark, shadcn-inspired):

```tsx
import { Button, Card, CardContent, colors } from "@vexart/styled"

<Card>
  <CardContent>
    <Button variant="primary" onPress={() => save()}>Save</Button>
  </CardContent>
</Card>
```

## Interaction Pattern

Every interactive headless component provides a context prop to spread:

| Component | Context Prop | Purpose |
|-----------|-------------|---------|
| Button | `ctx.buttonProps` | Click + Enter/Space |
| Checkbox | `ctx.toggleProps` | Click to toggle |
| Switch | `ctx.toggleProps` | Click to toggle |
| RadioGroup | `ctx.optionProps` | Click to select |
| Tabs | `ctx.tabProps` | Click to switch tab |
| List | `ctx.itemProps` | Click to select item |
| Table | `ctx.rowProps` | Click to select row |
| Dialog.Overlay | `onClick` | Click to close |
