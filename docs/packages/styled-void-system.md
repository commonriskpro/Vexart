# Styled Void Design System & Theming Architecture

The `@vexart/styled` package lives at Tier 2 of the Vexart architecture. It implements the **Void Design System**, an OLED-calibrated design system inspired by shadcn/ui and tailored specifically for high-contrast, subpixel GPU terminal rendering. It integrates design tokens, zero-remount reactive runtime theming, complete typography primitives, and 28+ pre-styled UI components that map directly to `@vexart/engine` `<box>` and `<text>` intrinsics.

---

## 1. OLED-Calibrated Void Design Tokens

Tokens are defined in `packages/styled/src/tokens/tokens.ts`. All color tokens are defined as hex strings (`"#rrggbb"` or `"#rrggbbaa"`), which the engine reconciler normalizes into packed `u32` colors upon arrival.

### 1.1 Semantic Color Tokens (`colors`)
Calibrated specifically for dark terminal surfaces and OLED displays where high contrast and pure black levels are vital:

| Token Name | Hex Value | Semantic Description |
| :--- | :--- | :--- |
| `background` | `#0a0a0a` | App root background (near-OLED pure black). |
| `foreground` | `#fafafa` | Default text and high-contrast foreground glyphs. |
| `card` | `#171717` | Elevated surface for cards, panels, and dialog sheets. |
| `cardForeground` | `#fafafa` | Primary text rendered on card surfaces. |
| `popover` | `#171717` | Floating surface for popovers, tooltips, and menus. |
| `popoverForeground`| `#fafafa` | Text rendered on floating popovers. |
| `primary` | `#e5e5e5` | High-emphasis actions and primary brand surfaces. |
| `primaryForeground`| `#171717` | High-contrast dark text on primary elements. |
| `secondary` | `#262626` | Lower-emphasis action surfaces and chips. |
| `secondaryForeground`|`#fafafa`| Text on secondary surfaces. |
| `muted` | `#262626` | Subtle background fills and muted table rows. |
| `mutedForeground` | `#a3a3a3` | Secondary labels, descriptions, and placeholder text. |
| `accent` | `#262626` | Hover, active, and selected item highlights. |
| `accentForeground` | `#fafafa` | Text on active accent highlights. |
| `destructive` | `#dc2626` | Errors, warnings, and destructive delete actions. |
| `destructiveForeground`|`#fafafa`| High-contrast text on destructive actions. |
| `border` | `#ffffff25` | Layout borders (~14.5% semi-transparent white). |
| `input` | `#ffffff40` | Form control borders (~25% semi-transparent white). |
| `ring` | `#737373` | Keyboard focus ring indicator. |
| `ringSubtle` | `#73737380` | Focus-visible glow halo (50% opacity). |
| `transparent` | `#00000000` | Fully transparent fill or stroke. |

### 1.2 Spacing Scale (`space`)
A 4px-based geometric spacing scale:
- `px`: `1px`
- `0.5`: `2px`
- `1`: `4px`
- `1.5`: `6px`
- `2`: `8px`
- `2.5`: `10px`
- `3`: `12px`
- `3.5`: `14px`
- `4`: `16px`
- `5`: `20px`
- `6`: `24px`
- `7`: `28px`
- `8`: `32px`
- `9`: `36px`
- `10`: `40px`

### 1.3 Corner Radius Scale (`radius`)
Derived from a 10px base radius:
- `sm`: `6px`
- `md`: `8px`
- `lg`: `10px` (Base radius)
- `xl`: `14px`
- `xxl`: `18px`
- `full`: `9999px` (Pill / circular geometry)

### 1.4 Typography Scales (`font` & `weight`)
- **Font Sizes (`font`)**:
  - `xs`: `10px`
  - `sm`: `12px`
  - `base`: `14px`
  - `lg`: `16px`
  - `xl`: `20px`
  - `2xl`: `24px`
  - `3xl`: `30px`
  - `4xl`: `36px`
- **Font Weights (`weight`)**:
  - `normal`: `400`
  - `medium`: `500`
  - `semibold`: `600`
  - `bold`: `700`

### 1.5 Multi-Layer Shadows & Glow Presets
- **Shadow Presets (`shadows`)**: Packed `u32` colors and Gaussian blur radii:
  - `xs`: 1 layer (`blur: 2`, offset `0, 1`)
  - `sm`: 2 layers (`blur: 3` and `2`, offset `0, 1`)
  - `md`: 2 layers (`blur: 6` and `4`, offset `0, 4` and `0, 2`)
  - `lg`: 2 layers (`blur: 15` and `6`, offset `0, 10` and `0, 4`)
  - `xl`: 2 layers (`blur: 25` and `10`, offset `0, 20` and `0, 8`)
- **Glow Presets (`glows`)**:
  - `ring`: Focus halo (`radius: 6`, `color: 0x73737380`, `intensity: 40`)
  - `destructive`: Error halo (`radius: 6`, `color: 0xdc262680`, `intensity: 40`)
  - `success`: Positive confirmation halo (`radius: 6`, `color: 0x22c55e80`, `intensity: 40`)

---

## 2. Zero-Remount Reactive Runtime Theming

Theming is implemented in `packages/styled/src/theme/theme.ts` through fine-grained SolidJS signal getters, eliminating scene graph reconstruction during theme swaps.

### 2.1 Signal-Backed Getter Architecture
Every token in `themeColors` is mapped through `Object.defineProperties` to an independent SolidJS signal:

```typescript
const colorSignals: Record<string, [() => string, (v: string) => void]> = {}

for (const key of Object.keys(defaultColors)) {
  colorSignals[key] = createSignal(defaultColors[key])
}

export const themeColors: ColorTokens = Object.defineProperties(
  {} as ColorTokens,
  Object.fromEntries(
    Object.keys(defaultColors).map((key) => [
      key,
      {
        get() {
          return colorSignals[key][0]()
        },
        enumerable: true,
      },
    ])
  )
)
```

### 2.2 Zero-Remount Mechanism
When JSX evaluates `themeColors.background`:
1. The getter invokes `colorSignals.background[0]()`.
2. SolidJS reconciler attaches an observer dependency only for that specific element property.
3. Invoking `setTheme(lightTheme)` executes inside a `batch()` update.
4. Signals emit new hex strings directly to `setProperty(node, "backgroundColor", val)`.
5. The reconciler re-parses the color to `u32` and marks visual damage.
6. **Zero DOM or scene nodes are created, destroyed, or remounted.**

### 2.3 The Static Destructuring Gotcha
Because `themeColors` relies on JavaScript property getters, destructuring outside an accessor breaks reactivity:

```typescript
// ❌ WRONG: Static snapshot (destructured at module load; loses reactivity!)
const { card, foreground } = themeColors
export function MyCard() {
  return <box backgroundColor={card} /> // Will never update when theme changes!
}

// ✅ CORRECT: Reactive getter access inside JSX
export function MyCard() {
  return <box backgroundColor={themeColors.card} /> // Tracks reactivity
}
```

### 2.4 Theme Management Functions
- `createTheme(overrides)`: Merges partial overrides with default tokens.
- `darkTheme`: Default OLED-calibrated dark theme.
- `lightTheme`: Preset light theme with inverted contrasts.
- `setTheme(theme)`: Updates active signals and increments `themeVersion()`.
- `getTheme()`: Returns the active theme snapshot.
- `getThemeVersion()`: Reactive signal tracking active theme version.

> **THEMING SCOPE INVARIANT**:
> `setTheme()` modifies **color tokens exclusively**. Geometric and typographic tokens—including `radius`, `space`, `font`, `weight`, `shadows`, and `glows`—are static design system constants.

---

## 3. Catalog of Styled Void Components

`@vexart/styled` exports pre-styled components ready for application construction:

### 3.1 Typography Hierarchy
- `<H1>`: 36px (`4xl`), bold (700), `foreground` color.
- `<H2>`: 30px (`3xl`), semibold (600), `foreground` color.
- `<H3>`: 20px (`xl`), semibold (600), `foreground` color.
- `<H4>`: 16px (`lg`), semibold (600), `foreground` color.
- `<P>`: 14px (`base`), normal (400), `foreground` color.
- `<Lead>`: 20px (`xl`), normal (400), `mutedForeground` color.
- `<Large>`: 16px (`lg`), semibold (600), `foreground` color.
- `<Small>`: 12px (`sm`), medium (500), `foreground` color.
- `<Muted>`: 12px (`sm`), normal (400), `mutedForeground` color.

### 3.2 Structural & Data Display
- `<VoidCard>`, `<VoidCardHeader>`, `<VoidCardTitle>`, `<VoidCardDescription>`, `<VoidCardContent>`, `<VoidCardFooter>`, `<VoidCardAction>`: Elevated containers styled with `card` background, `border`, and `radius.xl` (14px).
- `<VoidSeparator>`: 1px divider styled with `border` color (`orientation="horizontal" | "vertical"`).
- `<VoidSkeleton>`: Animated loading placeholder quad (`radius.md`).
- `<VoidBadge>`: Status chips with `default`, `secondary`, `destructive`, and `outline` variants (`radius.full`).
- `<VoidAvatar>`: Circular image/initials container (`radius.full`, sizes: `sm`, `default`, `lg`).

### 3.3 Form Controls & Interactive Inputs
- `<VoidButton>`: Fully styled button with variants ("default", "secondary", "destructive", "outline", "ghost", "link") and sizes ("sm", "default", "lg", "icon").
- `<VoidInput>`: Styled text input with `border-input`, focus ring glow, and subpixel cursor.
- `<VoidCheckbox>`: Styled check box with checkmark glyph and focus ring.
- `<VoidSelect>`: Themed dropdown menu with active item highlights.
- `<VoidSlider>`: Themed track and thumb with drag scrubbing.
- `<VoidSwitch>`: Pill toggle switch with smooth transition animation.
- `<VoidRadioGroup>`: Accessible radio selector with active dot indicator.
- `<VoidCombobox>`: Filterable autocomplete input with floating dropdown.
- `<VoidTextarea>`: Multi-line text editor with line numbers and focus glow.

### 3.4 Overlays & Feedback
- `<VoidDialog>` (VoidDialogTitle, VoidDialogDescription, VoidDialogFooter): Themed modal dialog with darkened scrim backdrop and automatic focus trap.
- `<VoidDropdownMenu>` (VoidDropdownMenuTrigger, VoidDropdownMenuContent, VoidDropdownMenuItem, VoidDropdownMenuSeparator, VoidDropdownMenuLabel): Popover action menu with keyboard navigation.
- `<VoidTooltip>`: Contextual tooltip card with anchor alignment.
- `<VoidPopover>`: Floating surface for arbitrary child content.
- `createVoidToaster()`: Styled toast notifications (`default`, `success`, `destructive`).

### 3.5 Collections & Specialized Display Components
- `<VoidTable>`: Themed tabular data grid with zebra striping and header borders.
- `<VoidTabs>`: Tabbed navigation strip with active tab underline.
- `<VoidCode>`: Tree-Sitter syntax-highlighted code viewer with One Dark styling.
- `<VoidMarkdown>`: Styled Markdown document renderer.
- `<VoidDiff>`: Color-coded line diff viewer (green additions, red deletions).
- `<VoidProgress>`: Horizontal progress bar indicator.
- `<VoidList>`: Themed list container with keyboard selection.
- `<VoidVirtualList>`: Large list virtualization with Void styling.
- `<VoidScrollView>`: Scrollable container with styled scrollbars.
