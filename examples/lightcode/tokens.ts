export const LIGHTCODE_WINDOW_VARIANT = {
  GLASS: "glass",
  PANEL: "panel",
} as const

export type LightcodeWindowVariant = (typeof LIGHTCODE_WINDOW_VARIANT)[keyof typeof LIGHTCODE_WINDOW_VARIANT]

interface ShadowToken {
  x: number
  y: number
  blur: number
  color: number
}

interface GlowToken {
  radius: number
  color: number
  intensity: number
}

interface GradientToken {
  type: "linear"
  from: number
  to: number
  angle: number
}

interface LightcodeWindowColorTokens {
  surface: string
  surfaceFocused: string
  titlebar: string
  titlebarFocused: string
  titlebarHighlight: string
  titlebarLowlight: string
  titlebarPill: string
  titlebarPillBorder: string
  border: string
  borderFocused: string
  bevelLight: string
  bevelDark: string
  divider: string
  content: string
  contentInset: string
  contentBorder: string
  foreground: string
  muted: string
  faint: string
  accent: string
  accentSoft: string
  accentWash: string
  control: string
  controlHover: string
  close: string
  closeHover: string
  dock: string
  dockBorder: string
  dockItem: string
  resizeHandle: string
  resizeHandleActive: string
  desktopChrome: string
  desktopChromeBorder: string
}

interface LightcodeWindowSizeTokens {
  radius: number
  titlebarHeight: number
  controlSize: number
  controlGap: number
  padding: number
  contentPadding: number
  borderWidth: number
  resizeHandle: number
  dockHeight: number
  dockInset: number
  titlePillHeight: number
  toolbarButton: number
  statusHeight: number
}

interface LightcodeWindowEffectTokens {
  shadow: ShadowToken[]
  shadowFocused: ShadowToken[]
  glowFocused: GlowToken
}

interface LightcodeWindowGradientTokens {
  surface: GradientToken
  surfaceFocused: GradientToken
  titlebar: GradientToken
  titlebarFocused: GradientToken
  content: GradientToken
  dock: GradientToken
}

interface LightcodeWindowTokenSet {
  colors: LightcodeWindowColorTokens
  size: LightcodeWindowSizeTokens
  effects: LightcodeWindowEffectTokens
  gradients: LightcodeWindowGradientTokens
}

interface LightcodeWindowRecipe {
  backgroundColor: string
  titlebarColor: string
  borderColor: string
  surfaceGradient: GradientToken
  titlebarGradient: GradientToken
  shadow: ShadowToken[]
  glow?: GlowToken
  opacity: number
}

function hexToU32(hex: string): number {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex
  if (raw.length === 6) return ((parseInt(raw, 16) << 8) | 0xff) >>> 0
  if (raw.length === 8) return parseInt(raw, 16) >>> 0
  return 0
}

export const lightcodeWindowTokens: LightcodeWindowTokenSet = {
  colors: {
    surface: "#141820f5",
    surfaceFocused: "#1f2028ff",
    titlebar: "#20242cf8",
    titlebarFocused: "#342b22ff",
    titlebarHighlight: "#ffffff26",
    titlebarLowlight: "#00000038",
    titlebarPill: "#090c11ee",
    titlebarPillBorder: "#ffffff28",
    border: "#ffffff3b",
    borderFocused: "#f6c36ad4",
    bevelLight: "#ffffff3b",
    bevelDark: "#00000070",
    divider: "#ffffff18",
    content: "#090d13e8",
    contentInset: "#030609ec",
    contentBorder: "#ffffff20",
    foreground: "#f5efe4",
    muted: "#a9a49a",
    faint: "#ffffff75",
    accent: "#f3bb5cff",
    accentSoft: "#f3bb5c34",
    accentWash: "#f3bb5c18",
    control: "#d8d4cc9e",
    controlHover: "#ffffff22",
    close: "#e9a66cff",
    closeHover: "#e06b58ff",
    dock: "#151922f3",
    dockBorder: "#ffffff32",
    dockItem: "#ffffff18",
    resizeHandle: "#ffffff24",
    resizeHandleActive: "#f3bb5c90",
    desktopChrome: "#11151ded",
    desktopChromeBorder: "#ffffff30",
  },
  size: {
    radius: 11,
    titlebarHeight: 38,
    controlSize: 22,
    controlGap: 7,
    padding: 10,
    contentPadding: 14,
    borderWidth: 1,
    resizeHandle: 14,
    dockHeight: 40,
    dockInset: 18,
    titlePillHeight: 26,
    toolbarButton: 22,
    statusHeight: 26,
  },
  effects: {
    shadow: [
      { x: 0, y: 18, blur: 34, color: hexToU32("#000000a4") },
      { x: 0, y: 4, blur: 10, color: hexToU32("#00000090") },
    ],
    shadowFocused: [
      { x: 0, y: 24, blur: 48, color: hexToU32("#000000c0") },
      { x: 0, y: 0, blur: 24, color: hexToU32("#f3bb5c42") },
    ],
    glowFocused: {
      radius: 12,
      color: hexToU32("#f3bb5c4a"),
      intensity: 48,
    },
  },
  gradients: {
    surface: { type: "linear", from: hexToU32("#202630f8"), to: hexToU32("#090d13f2"), angle: 95 },
    surfaceFocused: { type: "linear", from: hexToU32("#403428ff"), to: hexToU32("#0d1119fa"), angle: 102 },
    titlebar: { type: "linear", from: hexToU32("#303640fb"), to: hexToU32("#151a22fa"), angle: 90 },
    titlebarFocused: { type: "linear", from: hexToU32("#4b3928ff"), to: hexToU32("#191d25ff"), angle: 93 },
    content: { type: "linear", from: hexToU32("#121820f5"), to: hexToU32("#030609fa"), angle: 90 },
    dock: { type: "linear", from: hexToU32("#222733f6"), to: hexToU32("#0a0d12f5"), angle: 90 },
  },
}

export const lightcodeWindowRecipes: Record<LightcodeWindowVariant, {
  focused: LightcodeWindowRecipe
  inactive: LightcodeWindowRecipe
}> = {
  glass: {
    focused: {
      backgroundColor: lightcodeWindowTokens.colors.surfaceFocused,
      titlebarColor: lightcodeWindowTokens.colors.titlebarFocused,
      borderColor: lightcodeWindowTokens.colors.borderFocused,
      surfaceGradient: lightcodeWindowTokens.gradients.surfaceFocused,
      titlebarGradient: lightcodeWindowTokens.gradients.titlebarFocused,
      shadow: lightcodeWindowTokens.effects.shadowFocused,
      glow: lightcodeWindowTokens.effects.glowFocused,
      opacity: 1,
    },
    inactive: {
      backgroundColor: lightcodeWindowTokens.colors.surface,
      titlebarColor: lightcodeWindowTokens.colors.titlebar,
      borderColor: lightcodeWindowTokens.colors.border,
      surfaceGradient: lightcodeWindowTokens.gradients.surface,
      titlebarGradient: lightcodeWindowTokens.gradients.titlebar,
      shadow: lightcodeWindowTokens.effects.shadow,
      opacity: 0.92,
    },
  },
  panel: {
    focused: {
      backgroundColor: "#18191df6",
      titlebarColor: "#202026ff",
      borderColor: lightcodeWindowTokens.colors.borderFocused,
      surfaceGradient: lightcodeWindowTokens.gradients.surfaceFocused,
      titlebarGradient: lightcodeWindowTokens.gradients.titlebarFocused,
      shadow: lightcodeWindowTokens.effects.shadowFocused,
      glow: lightcodeWindowTokens.effects.glowFocused,
      opacity: 1,
    },
    inactive: {
      backgroundColor: "#111216e8",
      titlebarColor: "#17181dde",
      borderColor: lightcodeWindowTokens.colors.border,
      surfaceGradient: lightcodeWindowTokens.gradients.surface,
      titlebarGradient: lightcodeWindowTokens.gradients.titlebar,
      shadow: lightcodeWindowTokens.effects.shadow,
      opacity: 0.94,
    },
  },
} as const
