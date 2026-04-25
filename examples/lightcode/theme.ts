export const lightcodeTheme = {
  color: {
    void: 0x05070cff,
    deep: 0x0a0f19ff,
    panel: 0x111720e8,
    panelStrong: 0x171b22f4,
    panelSoft: 0x0d1118cc,
    rail: 0x1f242dcc,
    border: 0xffffff18,
    borderStrong: 0xffffff32,
    text: 0xf7efe0ff,
    textSoft: 0xc9c2b2ff,
    muted: 0x8e938fff,
    faint: 0x626a73ff,
    gold: 0xffc96aff,
    goldSoft: 0xe7a84dff,
    amberGlass: 0x6d451f88,
    blue: 0x7ab7ffff,
    cyan: 0x66e5ffff,
    green: 0x88d58fff,
    red: 0xff6b6bff,
    violet: 0xb89cffff,
    transparent: 0x00000000,
  },
  space: {
    chrome: 28,
    radius: 12,
    radiusLg: 18,
    dock: 34,
    topbar: 34,
  },
  shadow: {
    window: [
      { x: 0, y: 18, blur: 34, color: 0x000000aa },
      { x: 0, y: 0, blur: 18, color: 0xd8953540 },
    ],
    soft: { x: 0, y: 8, blur: 18, color: 0x00000090 },
    glow: { radius: 28, color: 0xeab85dff, intensity: 42 },
    blueGlow: { radius: 22, color: 0x7ab7ffff, intensity: 24 },
  },
  gradient: {
    desktop: { type: "linear", from: 0x080b12ff, to: 0x111827ff, angle: 145 } as const,
    window: { type: "linear", from: 0x1d2028ee, to: 0x0c1018ee, angle: 130 } as const,
    titlebar: { type: "linear", from: 0x2b2a2fee, to: 0x151923ee, angle: 90 } as const,
    activeTitlebar: { type: "linear", from: 0x44351fee, to: 0x171b25ee, angle: 96 } as const,
    gold: { type: "linear", from: 0xffdd8cff, to: 0x9b5f21ff, angle: 20 } as const,
    blue: { type: "linear", from: 0x2b73aaff, to: 0x111827ff, angle: 110 } as const,
  },
} as const

export const lightcodeStars = [
  [5, 13, 2, 0xffffffaa], [9, 72, 1, 0xffffff66], [14, 28, 1, 0xf7d9a766], [20, 55, 2, 0xb8d8ff66],
  [26, 18, 1, 0xffffff99], [31, 82, 1, 0xffffff66], [37, 40, 2, 0xffd28a88], [44, 10, 1, 0xffffff55],
  [50, 66, 2, 0xb8d8ff77], [58, 24, 1, 0xffffff77], [63, 78, 1, 0xffffff55], [68, 36, 2, 0xffd28a99],
  [74, 12, 1, 0xffffff77], [81, 59, 2, 0xb8d8ff77], [87, 31, 1, 0xffffff77], [93, 84, 1, 0xffffff55],
] as const

export const lightcodeGraphNodes = [
  { id: "shader", label: "Shader Core", x: 46, y: 42, hot: true },
  { id: "vertex", label: "Vertex Buffer", x: 18, y: 52 },
  { id: "dispatch", label: "Dispatch", x: 31, y: 43 },
  { id: "engine", label: "v_engine.zig", x: 45, y: 24 },
  { id: "light", label: "LightEngine", x: 12, y: 37 },
  { id: "camera", label: "Camera", x: 37, y: 62 },
  { id: "runner", label: "Runner", x: 50, y: 72 },
  { id: "diff", label: "Diff", x: 67, y: 19 },
] as const

export const lightcodeGraphEdges = [
  ["shader", "vertex"], ["shader", "dispatch"], ["shader", "engine"], ["shader", "camera"], ["shader", "runner"],
  ["engine", "diff"], ["engine", "vertex"], ["light", "shader"], ["light", "dispatch"], ["vertex", "camera"],
  ["dispatch", "camera"], ["runner", "camera"], ["diff", "shader"],
] as const
