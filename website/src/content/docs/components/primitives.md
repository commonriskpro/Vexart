---
title: Primitives
description: The foundation elements — Box, Text, RichText, Span, WrapRow.
---

`@vexart/primitives` provides typed wrappers around JSX intrinsic elements.

## Box

Layout container — the terminal equivalent of `<div>`.

```tsx
import { Box } from "@vexart/primitives"

<Box
  direction="row"
  gap={12}
  padding={16}
  backgroundColor={0x1e1e2eff}
  cornerRadius={12}
  shadow={{ x: 0, y: 4, blur: 12, color: 0x00000040 }}
>
  {children}
</Box>
```

Default direction is **column** (vertical). Use `direction="row"` for horizontal.

## Text

Text display — the terminal equivalent of `<span>`.

```tsx
import { Text } from "@vexart/primitives"

<Text color={0xfafafaff} fontSize={16} fontWeight={600}>
  Hello World
</Text>
```

## RichText + Span

Multi-style text within a single text node:

```tsx
import { RichText, Span } from "@vexart/primitives"

<RichText>
  <Span color={0x56d4c8ff} fontWeight={700}>Vexart</Span>
  <Span color={0xa0a0b8ff}> — GPU-accelerated terminal UI</Span>
</RichText>
```

## WrapRow

Flex-wrap workaround for horizontal layouts that need wrapping:

```tsx
import { WrapRow } from "@vexart/primitives"

<WrapRow gap={8}>
  {tags.map(tag => <Badge>{tag}</Badge>)}
</WrapRow>
```

## JSX Intrinsics

You can also use the raw intrinsic elements directly:

| Element | Purpose |
|---------|---------|
| `<box>` | Layout + visual container |
| `<text>` | Text display |
| `<image>` / `<img>` | Image from file path (`src` prop) |
| `<canvas>` | Imperative drawing (`onDraw` callback) |

```tsx
<box direction="row" gap={8}>
  <text color={0xfafafaff}>Label</text>
  <img src="./icon.png" width={24} height={24} cornerRadius={4} />
  <canvas width={100} height={50} onDraw={(ctx) => {
    ctx.circle(25, 25, 20, { fill: 0xff0000ff })
  }} />
</box>
```
