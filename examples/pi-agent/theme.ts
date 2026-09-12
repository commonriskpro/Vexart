/** Visual tokens for the Pi Vexart frontend.
 *
 * These values deliberately stay local to the example. They are the palette
 * approved for the Pi mock, rather than changes to the shared Void theme.
 */

export const piColors = {
  background: "#0a0a0a",
  surface: "#111111",
  charcoal: "#171717",
  raised: "#1e1e1e",
  border: "#ffffff1f",
  borderStrong: "#ffffff33",
  text: "#f6f4ed",
  secondary: "#b8bfbc",
  dim: "#8d9691",
  mint: "#99f5d4",
  mintSoft: "#99f5d41f",
  red: "#f87171",
  amber: "#f7c873",
  blue: "#7aa2f7",
} as const

export const piSpace = {
  rail: 64,
  page: 28,
  section: 20,
  row: 12,
  compact: 8,
  hairline: 1,
} as const

export const piType = {
  eyebrow: 12,
  small: 14,
  body: 16,
  title: 18,
  display: 28,
} as const

export const piFocus = {
  railChat: "pi-rail-chat",
  railSessions: "pi-rail-sessions",
  railTree: "pi-rail-tree",
  railSettings: "pi-rail-settings",
  composer: "pi-composer",
  model: "pi-model",
  sessionList: "pi-session-list",
  treeList: "pi-tree-list",
  autoCompaction: "pi-setting-auto-compaction",
  reducedMotion: "pi-setting-reduced-motion",
} as const

export type PiRailView = "chat" | "sessions" | "tree" | "settings"
