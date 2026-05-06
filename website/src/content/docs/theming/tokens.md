---
title: Design Tokens
description: The Void theme — colors, spacing, radius, typography, shadows.
---

## Colors

```tsx
import { colors } from "@vexart/styled"

colors.background      // "#0a0a0a" — near-OLED black
colors.foreground      // "#fafafa" — default text
colors.card            // "#171717" — elevated surfaces
colors.primary         // "#e5e5e5" — brand/actions
colors.secondary       // "#262626" — secondary actions
colors.muted           // "#262626" — subtle surfaces
colors.mutedForeground // "#a3a3a3" — low-emphasis text
colors.accent          // "#262626" — hover/focus
colors.destructive     // "#dc2626" — errors
colors.border          // "#ffffff25" — borders (~14.5% white)
colors.input           // "#ffffff40" — input borders (~25% white)
colors.ring            // "#737373" — focus rings
```

## Spacing

```tsx
import { space } from "@vexart/styled"

space[1]  // 4px
space[2]  // 8px
space[3]  // 12px
space[4]  // 16px
space[5]  // 20px
space[6]  // 24px
space[7]  // 28px
space[8]  // 32px
space[9]  // 36px
space[10] // 40px
```

## Radius

```tsx
import { radius } from "@vexart/styled"

radius.sm   // 6
radius.md   // 8
radius.lg   // 10
radius.xl   // 14
radius.xxl  // 18
radius.full // 9999
```

## Typography

```tsx
import { font, weight } from "@vexart/styled"

font.xs   // 10px
font.sm   // 12px
font.base // 14px
font.lg   // 16px
font.xl   // 18px
font["2xl"] // 22px
font["3xl"] // 28px
font["4xl"] // 36px

weight.normal   // 400
weight.medium   // 500
weight.semibold // 600
weight.bold     // 700
```

## Shadows

```tsx
import { shadows } from "@vexart/styled"

shadows.xs  // Subtle elevation
shadows.sm  // Light shadow
shadows.md  // Medium depth
shadows.lg  // Pronounced shadow
shadows.xl  // Heavy depth
```

## Glows

```tsx
import { glows } from "@vexart/styled"
// Preset glow configurations for accent elements
```
