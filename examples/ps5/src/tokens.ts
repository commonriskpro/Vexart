export const ps5Visual = {
  canvas: { width: 1920, height: 1080 },
  topBar: { x: 80, y: 42, height: 42 },
  gameRow: { x: 45, y: 120, normal: 130, selected: 172, gap: 14 },
  logo: { x: 125, y: 350, width: 460 },
  play: { x: 125, y: 557, width: 243, height: 59 },
  activities: { x: 117, y: 663, cardWidth: 540, cardHeight: 225, gap: 16 },
  bottomScrim: { y: 932, height: 148 },
  controlCard: { width: 132, height: 84, gap: 36 },
  pagePadding: 45,
} as const

export const ps5Colors = {
  background: "#0b0d10",
  scrim: "#07090dcc",
  panel: "#090c11ee",
  panelSoft: "#151a20cc",
  text: "#f5f5f5",
  mutedText: "#b8bbc0",
  focus: "#ffffff",
  focusGlow: "#ffffff80",
  divider: "#ffffff26",
  success: "#5de0a5",
  error: "#ff7777",
} as const

export const ps5Motion = {
  focus: 160,
  carousel: 250,
  background: 400,
  panel: 210,
  screen: 260,
  scrim: 180,
  loadingPulse: 900,
} as const
