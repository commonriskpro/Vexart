# Vexart Layout and Sizing Guide

Vexart layout is powered by Flexily (Yoga-compatible pure-JS flexbox engine).

## 1. Direction Invariant: Row by Default

Modern terminal interfaces use 16:9 widescreen displays. `<box>` defaults to `direction="row"`.

| Direction | Behavior | Common Usage |
|-----------|----------|--------------|
| `"row"` (default) | Children layout horizontally LTR | Toolbars, stat rows, split panes, tag pills |
| `"column"` | Children stack vertically top-down | Full-page layouts, card contents, forms, lists |

```tsx
// Horizontal (no direction prop needed):
<box gap={8} alignY="center">
  <VoidBadge>Status</VoidBadge>
  <text color={colors.foreground}>Online</text>
</box>

// Vertical (MUST specify direction="column"):
<box direction="column" gap={12}>
  <H3>Title</H3>
  <P>Description goes here</P>
</box>
```

## 2. Sizing Units

| Value | Meaning |
|-------|---------|
| `number` (e.g. `120`, `36`) | Fixed pixel size |
| `"grow"` / `flexGrow={1}` | Expands to fill available space along the axis |
| `"fit"` | Shrink-wraps tightly to child content |
| `"100%"` | Matches 100% of the parent size |

## 3. Alignment: `alignX` and `alignY`

- **`alignX`** always controls horizontal placement (`"left"` | `"center"` | `"right"` | `"space-between"`).
- **`alignY`** always controls vertical placement (`"top"` | `"center"` | `"bottom"` | `"space-between"`).

CSS aliases `justifyContent` and `alignItems` are also supported.

## 4. Holy Grail 16:9 Layout Pattern

```tsx
<box width="100%" height="100%" direction="column" backgroundColor={colors.background}>
  {/* Header */}
  <box height={48} width="100%" direction="row" alignX="space-between" alignY="center" paddingX={16} borderBottom={1} borderColor={colors.border}>
    <text color={colors.foreground} fontWeight={600}>Cluster Monitor</text>
    <VoidBadge variant="outline">Live</VoidBadge>
  </box>

  {/* Middle Body */}
  <box width="100%" height="grow" direction="row">
    {/* Left Sidebar */}
    <box width={220} height="100%" direction="column" padding={12} gap={8} borderRight={1} borderColor={colors.border}>
      <VoidButton variant="ghost" width="100%">Dashboard</VoidButton>
      <VoidButton variant="ghost" width="100%">Nodes</VoidButton>
      <VoidButton variant="ghost" width="100%">Settings</VoidButton>
    </box>

    {/* Main View */}
    <box width="grow" height="100%" direction="column" padding={16} gap={16} scrollY>
      <box direction="row" gap={16}>
        <VoidCard width="grow"><VoidCardHeader><VoidCardTitle>Throughput</VoidCardTitle></VoidCardHeader></VoidCard>
        <VoidCard width="grow"><VoidCardHeader><VoidCardTitle>Latency</VoidCardTitle></VoidCardHeader></VoidCard>
      </box>
    </box>
  </box>

  {/* Footer */}
  <box height={28} width="100%" direction="row" alignY="center" paddingX={16} backgroundColor={colors.card}>
    <text color={colors.mutedForeground} fontSize={11}>Press Ctrl+C to quit</text>
  </box>
</box>
```

