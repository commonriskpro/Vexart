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

## Styling Intrinsics with `className`

The `@vexart/app` package installs `className` support directly on the `<box>` and `<text>` intrinsics. There are no wrapper components to import:

```tsx
<box className="card" padding={16}>
  <text>Content</text>
</box>
```

## Composing text & Layout

Inline styled text segments and row layouts compose directly with `<box>` and `<text>`:

```tsx
<box direction="row" gap={4}>
  <text color="#56d4c8">Hello </text>
  <text color="#a78bfa" fontWeight={700}>World</text>
</box>
```
