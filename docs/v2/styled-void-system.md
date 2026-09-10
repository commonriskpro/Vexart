# Styled Void Design System & Theming Architecture

The `@vexart/styled` package provides the **Void Design System**, a dark, OLED-calibrated design system inspired by shadcn/ui. It combines design tokens, zero-remount reactive runtime theming, typography primitives, and pre-styled UI components that map directly to engine `<box>` and `<text>` intrinsics.

---

## 1. Void Design System Tokens

Tokens are defined in `tokens/tokens.ts`. All color tokens are hex strings (`"#rrggbb"` or `"#rrggbbaa"`), which the engine reconciler parses once into `u32` colors.

### OLED-Calibrated Color Palette (`colors`)
Designed specifically for high-contrast, pure-black terminal displays:

| Token Name | Hex Value | Semantic Role |
| :--- | :--- | :--- |
| `background` | `#0a0a0a` | App root background (near-OLED pure black) |
| `foreground` | `#fafafa` | Primary text and foreground elements |
| `card` | `#171717` | Elevated surface (cards, dialogs, panels) |
| `cardForeground` | `#fafafa` | Text on card surfaces |
| `popover` | `#171717` | Floating surface (menus, tooltips, dropdowns) |
| `popoverForeground`| `#fafafa` | Text on popover surfaces |
| `primary` | `#e5e5e5` | High-emphasis brand / primary action surface |
| `primaryForeground`| `#171717` | High-contrast text on primary actions |
| `secondary` | `#262626` | Lower-emphasis surfaces and secondary buttons |
| `secondaryForeground`|`#fafafa` | Text on secondary surfaces |
| `muted` | `#262626` | Low-emphasis background accents |
| `mutedForeground` | `#a3a3a3` | Secondary / muted text labels |
| `accent` | `#262626` | Hover, active, and focused surface highlights |
| `accentForeground` | `#fafafa` | Text on active accent surfaces |
| `destructive` | `#dc2626` | Errors, warnings, and destructive actions |
| `destructiveForeground`|`#fafafa` | Text on destructive surfaces |
| `border` | `#ffffff25` | Subtle layout borders (~14.5% white for OLED) |
| `input` | `#ffffff40` | Form control borders (~25% white for visibility) |
| `ring` | `#737373` | Focus indicator outline |
| `ringSubtle` | `#73737380` | Focus-visible glow halo (50% opacity) |
| `transparent` | `#00000000` | Fully transparent fill/stroke |

### Spacing Scale (`space`)
4px base spacing grid:
- `px: 1`, `0.5: 2`, `1: 4`, `1.5: 6`, `2: 8`, `2.5: 10`, `3: 12`, `3.5: 14`, `4: 16`, `5: 20`, `6: 24`, `7: 28`, `8: 32`, `9: 36`, `10: 40`

### Radius Scale (`radius`)
Derived from a 10px base radius:
- `sm`: `6`
- `md`: `8`
- `lg`: `10`
- `xl`: `14`
- `xxl`: `18`
- `full`: `9999` (pill / circular geometry)

### Typography Scale (`font` & `weight`)
- Sizes (`font`): `xs: 10`, `sm: 12`, `base: 14`, `lg: 16`, `xl: 20`, `2xl: 24`, `3xl: 30`, `4xl: 36`
- Weights (`weight`): `normal: 400`, `medium: 500`, `semibold: 600`, `bold: 700`

### Shadows & Glows
- **Shadow Presets (`shadows`)**: Multi-shadow arrays with packed `u32` colors and Gaussian blur radii:
  - `xs`: 1 layer, blur 2
  - `sm`: 2 layers, blur 3 and 2
  - `md`: 2 layers, blur 6 and 4
  - `lg`: 2 layers, blur 15 and 6
  - `xl`: 2 layers, blur 25 and 10
- **Glow Presets (`glows`)**:
  - `ring`: Focus indicator halo (`radius: 6`, `color: 0x73737380`, `intensity: 40`)
  - `destructive`: Error halo (`radius: 6`, `color: 0xdc262680`, `intensity: 40`)
  - `success`: Positive feedback halo (`radius: 6`, `color: 0x22c55e80`, `intensity: 40`)

---

## 2. Zero-Remount Reactive Runtime Theming

Theming is implemented in `theme/theme.ts` via SolidJS reactivity without triggering tree re-creation.

### Signal-Backed Getter Architecture
Every token in `themeColors` is backed by an independent SolidJS signal:
```typescript
const colorSignals: Record<string, [() => string, (v: string) => void]> = {}
for (const key of Object.keys(defaultColors)) {
  colorSignals[key] = createSignal(defaultColors[key])
}

export const themeColors = {} as ColorTokens
for (const key of Object.keys(defaultColors)) {
  Object.defineProperty(themeColors, key, {
    get() {
      return colorSignals[key][0]()
    },
    enumerable: true,
  })
}
```

### Zero-Remount Mechanism
When JSX reads `themeColors.background`:
1. The getter reads `colorSignals.background[0]()`.
2. SolidJS reconciler registers an effect dependency only for that specific node property.
3. Calling `setTheme(lightTheme)` updates the signals in place.
4. The engine executes `setProperty(node, "backgroundColor", newValue)` directly on affected nodes.
5. **No DOM nodes, scene nodes, or component instances are destroyed or remounted.**

> **Theming Scope Invariant**: `ThemeDefinition` (`{ colors: Partial<ColorTokens> }`) and `setTheme()` **strictly modify color tokens**. Geometric and typographic tokens—including spacing (`space`), corner radii (`radius`), font sizes (`font`), font weights (`weight`), multi-shadow presets (`shadows`), and glow configurations (`glows`)—are static, compile-time design constants and are not dynamically altered across runtime theme switches.

> ### ⚠️ The `themeColors` Reactivity Rule
> 
> Because SolidJS uses fine-grained signal reactivity rather than a Virtual DOM, **component function bodies execute only once during mount**. They do not re-execute when state or theme signals mutate.
> 
> **The Gotcha (Static Snapshot)**:
> Extracting or destructuring `themeColors` properties inside the component function body evaluates the getter eagerly and creates a **static snapshot** of the color string at mount time:
> ```tsx
> function BrokenCard() {
>   // ❌ ANTI-PATTERN: Evaluated only once at mount time!
>   // 'bg' becomes a static string snapshot. When setTheme() changes
>   // the active theme, this node will NEVER update its background color.
>   const bg = themeColors.background
>   const { card, border } = themeColors
> 
>   return <box backgroundColor={bg} borderColor={border} />
> }
> ```
> 
> **The Correct Patterns**:
> 1. **Pass `themeColors.*` directly into JSX props**: Solid's JSX compiler preserves the getter property access within the compiled property setter, creating a fine-grained reactive subscription for that specific node attribute:
>    ```tsx
>    function GoodCard() {
>      // ✅ RECOMMENDED: Read directly within JSX props
>      return (
>        <box
>          backgroundColor={themeColors.background}
>          borderColor={themeColors.border}
>        />
>      )
>    }
>    ```
> 2. **Wrap in a getter function `() => themeColors.*` inside effects, memos, or custom derivations**:
>    ```tsx
>    // ✅ CORRECT: Wrap in a getter or createMemo for reactive tracking
>    const cardBg = () => themeColors.card
>    const highlightBorder = createMemo(() => `${themeColors.primary}80`)
>    ```

---

## 3. Styled Components Catalog

The package exports 28+ styled components pre-configured with Void tokens:

### Structural & Layout Components
- `Card`: Surface container with border and background.
  - Sub-parts: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction`.
- `Separator`: Subtle horizontal or vertical divider (`#ffffff25`).
- `Skeleton`: Pulsing placeholder container for loading states.
- `Avatar`: Circular or rounded image container with fallback text.
- `Badge`: Status badge supporting `default`, `secondary`, `destructive`, and `outline` variants.

### Interactive Form Controls
- `Button`: Primary, secondary, outline, ghost, destructive, and link variants with sizing (`sm`, `md`, `lg`).
- `VoidInput`: Single-line text input with focus ring glow.
- `VoidTextarea`: Multi-line text editor with line numbers and syntax highlighting.
- `VoidCheckbox`: Styled checkbox with checkmark glyph.
- `VoidRadioGroup`: Mutually exclusive option group.
- `VoidSelect`: Popover-based dropdown select.
- `VoidCombobox`: Searchable autocomplete combobox.
- `VoidSwitch`: Sliding pill toggle switch.
- `VoidSlider`: Draggable track and thumb.

### Overlays & Menus
- `VoidDialog`: Modal dialog with dimmed background backdrop.
  - Sub-parts: `VoidDialogTitle`, `VoidDialogDescription`, `VoidDialogFooter`.
- `VoidDropdownMenu`: Context and action dropdown menu.
  - Sub-parts: `VoidDropdownMenuTrigger`, `VoidDropdownMenuContent`, `VoidDropdownMenuItem`, `VoidDropdownMenuSeparator`, `VoidDropdownMenuLabel`.
- `VoidPopover`: Floating anchored panel.
- `VoidTooltip`: Hover-activated label tooltip.
- `createVoidToaster`: Toast notification manager and container.

### Collections & Data
- `VoidTable`: Styled data table with column headers and zebra striping.
- `VoidTabs`: Tab strip and panels supporting `line` and `pill` variants.
- `VoidList`: Keyboard-navigable list.
- `VoidVirtualList`: High-performance virtualized list.
- `VoidScrollView`: Custom scroll container with styled scrollbars.
- `VoidDiff`: Visual Git diff viewer.

### Display & Code
- `VoidCode`: Syntax-highlighted code block with line numbers.
- `VoidMarkdown`: Formatted Markdown renderer.
- `VoidProgress`: Rounded progress bar with smooth indicator.

### Typography Primitives
Dedicated typography components enforcing modular typographic scale:
- `H1`: 36px (`4xl`), bold (700)
- `H2`: 30px (`3xl`), semibold (600)
- `H3`: 20px (`xl`), semibold (600)
- `H4`: 16px (`lg`), semibold (600)
- `P`: 14px (`base`), normal (400)
- `Lead`: 20px (`xl`), muted color (`#a3a3a3`)
- `Large`: 16px (`lg`), semibold (600)
- `Small`: 12px (`sm`), medium (500)
- `Muted`: 12px (`sm`), muted color (`#a3a3a3`)

---

## 4. Style Merging with Engine Intrinsics

Styled components translate high-level variants and theme tokens directly into engine `<box>` and `<text>` intrinsic props.

### Interactive Styles Integration
Interactive behaviors leverage engine-level state styles:
```tsx
<box
  backgroundColor={themeColors.card}
  borderWidth={1}
  borderColor={themeColors.border}
  cornerRadius={radius.md}
  hoverStyle={{
    backgroundColor: themeColors.accent,
    borderColor: themeColors.input,
  }}
  focusStyle={{
    borderColor: themeColors.ring,
    glow: glows.ring,
  }}
  activeStyle={{
    backgroundColor: themeColors.secondary,
  }}
/>
```
These properties are evaluated natively during event dispatch without forcing component re-renders.
