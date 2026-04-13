# Visual Effects

> Expanded guide for TGE's visual effects system. For the quick-reference version, see [developer-guide.md](./developer-guide.md#shadow--glow).

TGE renders browser-quality visual effects in the terminal using SDF (Signed Distance Field) primitives in Zig. Every effect described here runs at the pixel level — not character-cell approximations. This guide covers shadows, glow, gradients, backdrop filters, opacity, and per-corner radius.

---

## Paint Order

Effects are applied in a fixed order. Understanding this order is essential for layering:

```
1. Glow          — outermost, painted first (behind everything)
2. Shadow(s)     — painted behind the element
3. Backdrop filters — blur/brightness/etc. applied to pixels BEHIND the element
4. Background    — solid color OR gradient fill (gradient replaces background)
5. Border        — painted on top of background
6. Children      — child elements render on top
7. Opacity       — multiplied across the entire composited result
```

Each effect runs in an isolated temporary buffer to prevent pixel corruption of neighboring elements.

---

## Shadows

Drop shadows are painted behind the element using SDF blur. They create depth and elevation.

### Single Shadow

```tsx
<box
  width={200} height={100}
  backgroundColor="#262626"
  cornerRadius={14}
  shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}
>
  <text color="#fafafa">Elevated card</text>
</box>
```

**Shadow properties:**

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | Horizontal offset in pixels. Positive = right. |
| `y` | `number` | Vertical offset in pixels. Positive = down. |
| `blur` | `number` | Blur radius. Larger = softer, more spread. |
| `color` | `number` | **MUST be u32 RGBA** (e.g., `0x00000060`). |

**CRITICAL: Shadow colors must be u32 numbers.** They bypass the color parser and go directly to the Zig paint engine. Hex strings will NOT work:

```tsx
// CORRECT
shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}

// WRONG — hex strings are not supported for shadow colors
shadow={{ x: 0, y: 4, blur: 12, color: "#00000060" }}
```

### Multi-Shadow

Pass an array to create layered shadows. Shadows paint in array order (first = bottom).

```tsx
// Material-style elevation with two shadow layers
<box
  backgroundColor="#262626"
  cornerRadius={14}
  padding={20}
  shadow={[
    { x: 0, y: 1, blur: 3, color: 0x00000030 },    // tight, subtle
    { x: 0, y: 4, blur: 12, color: 0x00000050 },   // wider, softer
  ]}
>
  <text color="#fafafa">Layered shadow</text>
</box>
```

**Web analogy:** CSS `box-shadow` accepts comma-separated shadows. TGE uses an array.

### Colored Shadows

Shadows inherit the visual identity of the element by using colored alpha:

```tsx
// Warm glow shadow for an error button
<box
  backgroundColor="#dc2626"
  cornerRadius={8}
  padding={12}
  shadow={{ x: 0, y: 4, blur: 16, color: 0xdc262640 }}
>
  <text color="#fff">Delete</text>
</box>

// Blue shadow for a primary button
<box
  backgroundColor="#3b82f6"
  cornerRadius={8}
  padding={12}
  shadow={{ x: 0, y: 4, blur: 16, color: 0x3b82f640 }}
>
  <text color="#fff">Submit</text>
</box>
```

### Shadow Elevation Presets

Common patterns for different elevation levels:

```tsx
// Subtle (card resting on surface)
shadow={{ x: 0, y: 1, blur: 3, color: 0x00000030 }}

// Medium (hovering card)
shadow={[
  { x: 0, y: 2, blur: 4, color: 0x00000030 },
  { x: 0, y: 4, blur: 8, color: 0x00000040 },
]}

// High (modal/dialog)
shadow={[
  { x: 0, y: 4, blur: 6, color: 0x00000030 },
  { x: 0, y: 12, blur: 24, color: 0x00000060 },
]}

// Dramatic (floating panel)
shadow={[
  { x: 0, y: 8, blur: 16, color: 0x00000040 },
  { x: 0, y: 24, blur: 48, color: 0x00000060 },
]}
```

---

## Glow

Glow creates a soft radial light around the element. It uses a plateau + falloff algorithm — bright near the edge, fading to transparent.

```tsx
<box
  backgroundColor="#1e1e2e"
  cornerRadius={14}
  glow={{ radius: 20, color: 0x4fc4d4ff, intensity: 60 }}
  padding={16}
>
  <text color="#4fc4d4">Glowing element</text>
</box>
```

**Glow properties:**

| Property | Type | Description |
|----------|------|-------------|
| `radius` | `number` | How far the glow extends (pixels) |
| `color` | `string \| number` | Glow color — hex string OR u32 both work |
| `intensity` | `number` | Strength, 0-100 (default ~60) |

Unlike shadow, glow color accepts both hex strings and u32 numbers.

### Glow vs Shadow

| | Shadow | Glow |
|-|--------|------|
| Shape | Offset rectangle | Radial bloom |
| Direction | Directional (x, y offset) | Uniform around edges |
| Purpose | Depth / elevation | Highlight / neon / selection |
| Color format | u32 only | Hex string or u32 |

### Combining Shadow + Glow

```tsx
// Neon card — glow for the neon effect, shadow for grounding
<box
  backgroundColor="#1a1a2e"
  cornerRadius={14}
  glow={{ radius: 24, color: "#56d4c8", intensity: 50 }}
  shadow={{ x: 0, y: 4, blur: 12, color: 0x00000050 }}
  padding={20}
>
  <text color="#56d4c8" fontSize={16}>Neon Card</text>
</box>
```

---

## Gradients

Gradient fills replace `backgroundColor`. When `gradient` is set, background color is ignored for the fill (but still used for layout area).

### Linear Gradient

```tsx
<box
  width={300} height={100}
  cornerRadius={14}
  gradient={{
    type: "linear",
    from: 0x1a1a2eff,
    to: 0x0a0a0fff,
    angle: 90,
  }}
>
  <text color="#fafafa" padding={16}>Top-to-bottom gradient</text>
</box>
```

**Linear gradient properties:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | `"linear"` | Must be `"linear"` |
| `from` | `number` | Start color (u32 RGBA) |
| `to` | `number` | End color (u32 RGBA) |
| `angle` | `number` | Degrees. 0 = left-to-right, 90 = top-to-bottom, 180 = right-to-left. |

**Angle reference:**

```
          90deg
           |
  180deg --+-- 0deg
           |
         270deg
```

```tsx
// Left-to-right (angle: 0)
gradient={{ type: "linear", from: 0x3b82f6ff, to: 0x8b5cf6ff, angle: 0 }}

// Top-to-bottom (angle: 90)
gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 90 }}

// Diagonal (angle: 45)
gradient={{ type: "linear", from: 0xff6b6bff, to: 0xfeca57ff, angle: 45 }}
```

### Radial Gradient

```tsx
<box
  width={200} height={200}
  gradient={{
    type: "radial",
    from: 0x56d4c8ff,
    to: 0x00000000,
  }}
/>
```

**Radial gradient properties:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | `"radial"` | Must be `"radial"` |
| `from` | `number` | Center color (u32 RGBA) |
| `to` | `number` | Edge color (u32 RGBA) |

The center is the element's center. The gradient radiates outward to fill the element. Use a transparent `to` color for a spotlight effect.

### Gradient + Other Effects

Gradients combine naturally with shadows, glow, and borders:

```tsx
// Gradient card with shadow and border
<box
  width={300} height={120}
  cornerRadius={14}
  gradient={{ type: "linear", from: 0x1e293bff, to: 0x0f172aff, angle: 135 }}
  shadow={{ x: 0, y: 8, blur: 24, color: 0x00000060 }}
  borderColor="#ffffff15"
  borderWidth={1}
  padding={20}
>
  <text color="#fafafa" fontSize={16}>Premium Card</text>
  <text color="#94a3b8">With gradient background</text>
</box>
```

---

## Backdrop Filters

Backdrop filters process the pixels BEHIND the element before compositing. This is how you create glassmorphism, desaturation overlays, and other effects that interact with the content beneath.

**How it works internally:** The Zig paint engine reads the pixel buffer region behind the element, copies it to a temporary buffer, applies the filter, then composites the element on top. Each filter runs independently — you can stack multiple filters on one element.

### Backdrop Blur (Glassmorphism)

The flagship filter. Blurs the content behind the element, then draws a semi-transparent surface on top.

```tsx
// Glassmorphism panel
<box
  backgroundColor="#ffffff15"  // semi-transparent white
  backdropBlur={12}
  cornerRadius={14}
  borderColor="#ffffff20"
  borderWidth={1}
  padding={20}
>
  <text color="#fafafa">Frosted glass effect</text>
</box>
```

**Key:** The `backgroundColor` MUST be semi-transparent for the blur to be visible. If you use a fully opaque background, it covers the blurred content.

**Blur radius values:**

| Value | Effect |
|-------|--------|
| 4-8 | Subtle frosting |
| 10-16 | Standard glassmorphism |
| 20-32 | Heavy frosting |
| 40+ | Almost opaque blur |

### Backdrop Brightness

Adjusts the brightness of content behind the element.

```tsx
// Darken background (dimmed overlay for modals)
<box width="100%" height="100%" backgroundColor="#00000040" backdropBrightness={60} />

// Brighten background (light overlay)
<box width="100%" height="100%" backgroundColor="#ffffff10" backdropBrightness={150} />
```

| Value | Effect |
|-------|--------|
| 0 | Black (content behind is invisible) |
| 100 | Unchanged |
| 200 | 2x brightness |

### Backdrop Contrast

```tsx
// High contrast overlay
<box backdropContrast={150} backgroundColor="#00000020" width="100%" height="100%" />
```

| Value | Effect |
|-------|--------|
| 0 | Flat grey (no contrast) |
| 100 | Unchanged |
| 200 | Very high contrast |

### Backdrop Saturate

```tsx
// Desaturated (muted) background
<box backdropSaturate={30} backgroundColor="#00000020" width="100%" height="100%" />
```

| Value | Effect |
|-------|--------|
| 0 | Full grayscale |
| 100 | Unchanged |
| 200 | Hyper-saturated |

### Backdrop Grayscale

```tsx
// Full grayscale overlay (disabled state)
<box backdropGrayscale={100} backgroundColor="#00000040" width="100%" height="100%" />
```

### Backdrop Invert, Sepia, Hue-Rotate

```tsx
// Inverted background
<box backdropInvert={100} width="100%" height="100%" />

// Vintage/sepia effect
<box backdropSepia={80} backgroundColor="#00000010" width="100%" height="100%" />

// Color shift
<box backdropHueRotate={180} width="100%" height="100%" />
```

### Combining Multiple Filters

You can apply multiple backdrop filters to a single element:

```tsx
// Glassmorphism with desaturation and contrast boost
<box
  backgroundColor="#ffffff10"
  backdropBlur={16}
  backdropSaturate={60}
  backdropContrast={120}
  backdropBrightness={90}
  cornerRadius={14}
  borderColor="#ffffff20"
  borderWidth={1}
  padding={20}
>
  <text color="#fafafa">Complex glass effect</text>
</box>

// Disabled state: grayscale + dimmed
<box
  backdropGrayscale={100}
  backdropBrightness={50}
  backgroundColor="#00000060"
  width="100%"
  height="100%"
  alignX="center"
  alignY="center"
>
  <text color="#888">Content is disabled</text>
</box>
```

---

## Element Opacity

`opacity` multiplies the alpha of the entire element, including all children. Useful for fade effects and transitions.

```tsx
// 50% transparent element
<box opacity={0.5} backgroundColor="#ff0000" padding={12}>
  <text color="#fff">Semi-transparent</text>
</box>

// Animated fade
import { createTransition } from "tge"

const [fade, setFade] = createTransition(0, { duration: 300 })
setFade(1)  // fade in

<box opacity={fade()} backgroundColor="#1e1e2e" padding={16}>
  <text color="#fafafa">Fading in...</text>
</box>
```

| Value | Effect |
|-------|--------|
| 0.0 | Fully transparent (invisible) |
| 0.5 | Half transparent |
| 1.0 | Fully opaque (default) |

**Web analogy:** CSS `opacity` property. Same behavior.

---

## Per-Corner Radius

`cornerRadius` sets a uniform radius for all corners. `cornerRadii` lets you set each corner independently.

```tsx
// Uniform radius
<box cornerRadius={14} backgroundColor="#333" padding={16}>
  <text color="#fff">All corners equal</text>
</box>

// Top rounded, bottom square (tab/header shape)
<box cornerRadii={{ tl: 14, tr: 14, br: 0, bl: 0 }} backgroundColor="#333" padding={16}>
  <text color="#fff">Tab shape</text>
</box>

// Left pill (attached to right edge)
<box cornerRadii={{ tl: 20, tr: 0, br: 0, bl: 20 }} backgroundColor="#4488cc" padding={12}>
  <text color="#fff">Left pill</text>
</box>

// Single rounded corner
<box cornerRadii={{ tl: 20, tr: 0, br: 0, bl: 0 }} backgroundColor="#333" padding={16}>
  <text color="#fff">One corner</text>
</box>
```

**Corner names:**

```
  tl ──────── tr
  │            │
  │            │
  bl ──────── br
```

All corner rendering uses SDF anti-aliasing — subpixel smooth at any radius.

---

## Combined Effects: A Complete Example

```tsx
// Premium glassmorphism card with all effects
<box width="100%" height="100%" backgroundColor="#0f0f1a">
  {/* Background content that will be blurred */}
  <box width="100%" height="100%" gradient={{
    type: "radial", from: 0x3b82f640, to: 0x00000000
  }} />

  {/* Glass card */}
  <box
    width={400}
    backgroundColor="#ffffff08"
    backdropBlur={16}
    backdropBrightness={110}
    cornerRadii={{ tl: 20, tr: 20, br: 12, bl: 12 }}
    borderColor="#ffffff15"
    borderWidth={1}
    shadow={[
      { x: 0, y: 2, blur: 4, color: 0x00000020 },
      { x: 0, y: 8, blur: 32, color: 0x00000040 },
    ]}
    glow={{ radius: 30, color: 0x3b82f620, intensity: 30 }}
    padding={24}
    gap={12}
  >
    <text color="#fafafa" fontSize={20}>Glass Card</text>
    <text color="#ffffff88">With shadow, glow, blur, and gradient</text>
  </box>
</box>
```

---

## Effects in Scroll Containers

All visual effects respect scissor clipping inside scroll containers. When an element with effects (shadows, glow, backdrop blur, gradients, rounded corners) is partially scrolled out of view, only the visible portion is painted.

The engine uses three strategies:
- **Coordinate clipping** for flat rects and backdrop blur regions — the coordinates are clamped to the scissor bounds before painting
- **Temp buffer + copy** for rounded rects, per-corner radius, and borders — the primitive is rendered to a temporary buffer, then only the scissor-visible portion is copied to the main buffer with alpha blending
- **Scissored composite** for shadows and glow — the composite source is clipped to the scissor bounds before the `over()` blend operation

This means you can freely use any visual effect on elements inside `scrollY`/`scrollX` containers without worrying about bleeding outside the scroll area.

---

## See Also

- [Layout and Sizing](./layout-and-sizing.md) — positioning and dimensions
- [Interactivity and Focus](./interactivity-and-focus.md) — hover/active/focus styles change effects dynamically
- [Animations](./animations.md) — animate opacity, shadow, glow over time
- [Theming](./theming.md) — shadow presets from tge/void
- [developer-guide.md](./developer-guide.md#shadow--glow) — quick reference
