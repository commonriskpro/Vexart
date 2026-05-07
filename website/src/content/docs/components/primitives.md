---
title: Primitives
description: JSX intrinsic elements and layout helpers.
---

Vexart provides JSX intrinsic elements that map directly to the engine's node types. Use them like HTML elements — no imports needed.

## Intrinsic Elements

| Element | Purpose |
|---------|---------|
| `<box>` | Layout container (like `<div>`) |
| `<text>` | Text content (like `<span>`) |
| `<image>` / `<img>` | Image display |
| `<canvas>` | Imperative drawing surface |

```tsx
<box direction="row" gap={8} padding={16} backgroundColor="#171717" cornerRadius={10}>
  <text color="#fafafa" fontSize={14}>Hello Vexart</text>
</box>
```

## App-Level Wrappers

`@vexart/app` provides `Box` and `Text` components that add `className` support on top of the intrinsics:

```tsx
import { Box, Text } from "@vexart/app"

<Box className="card" padding={16}>
  <Text>Content</Text>
</Box>
```

## Layout Helpers

These components compose intrinsics for common layout patterns:

### Span / RichText

Inline styled text segments:

```tsx
import { RichText, Span } from "@vexart/app"

<RichText>
  <Span color="#56d4c8">Hello </Span>
  <Span color="#a78bfa" fontWeight={700}>World</Span>
</RichText>
```

### WrapRow

Flex-wrap workaround (Flexily doesn't support `flexWrap` natively):

```tsx
import { WrapRow } from "@vexart/app"

<WrapRow width={300} itemWidth={80} gap={4}>
  <Box width={80}><Text>Tag 1</Text></Box>
  <Box width={80}><Text>Tag 2</Text></Box>
  <Box width={80}><Text>Tag 3</Text></Box>
  <Box width={80}><Text>Tag 4</Text></Box>
</WrapRow>
```
