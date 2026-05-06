---
title: Visual Effects
description: GPU-rendered shadows, gradients, blur, glow, and transforms.
---

All effects are JSX props rendered by the Rust/WGPU backend.

## Shadows

```tsx
// Single shadow
<box shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}>

// Multi-shadow (painted in order)
<box shadow={[
  { x: 0, y: 2, blur: 4, color: 0x0000004f },
  { x: 0, y: 8, blur: 24, color: 0x00000030 }
]}>

// Outer glow
<box glow={{ radius: 20, color: 0x56d4c8ff, intensity: 60 }}>
```

## Gradients

```tsx
// Linear
<box gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 90 }}>

// Radial
<box gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }}>
```

## Backdrop Filters

Real glassmorphism — blurs content BEHIND the element:

```tsx
<box backdropBlur={12} backgroundColor={0xffffff1a} cornerRadius={16}>
  <text>Glass panel</text>
</box>
```

All backdrop filters:

| Prop | Range | Effect |
|------|-------|--------|
| `backdropBlur` | pixels | Gaussian blur |
| `backdropBrightness` | 0–200 | 0=black, 100=unchanged |
| `backdropContrast` | 0–200 | 100=unchanged |
| `backdropSaturate` | 0–200 | 0=grayscale |
| `backdropGrayscale` | 0–100 | 100=full grayscale |
| `backdropInvert` | 0–100 | 100=fully inverted |
| `backdropSepia` | 0–100 | 100=full sepia |
| `backdropHueRotate` | 0–360 | Degrees |

## Self Filter

Apply filters to the element itself (not content behind):

```tsx
<box filter={{ blur: 4, brightness: 120, contrast: 110 }}>
```

## Opacity

```tsx
<box opacity={0.5}>
  <!-- Entire subtree rendered at 50% alpha -->
</box>
```

## Transforms

```tsx
<box transform={{ rotate: 8, scale: 1.05, translateX: 10 }}>
```

Available: `translateX`, `translateY`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `perspective`, `rotateX`, `rotateY`.

## Corner Radius

```tsx
// Uniform
<box cornerRadius={16}>

// Per-corner
<box cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}>
```

## Interactive States

Declarative hover/active/focus styles — no manual signal boilerplate:

```tsx
<box
  focusable
  backgroundColor={0x1e1e2eff}
  hoverStyle={{ backgroundColor: 0x2a2a3eff }}
  activeStyle={{ backgroundColor: 0x3a3a4eff }}
  focusStyle={{ borderColor: 0x4488ccff, borderWidth: 2 }}
  onPress={() => action()}
/>
```
