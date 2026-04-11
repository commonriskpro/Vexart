/**
 * TGE color tokens — Void Black palette.
 *
 * All values are packed RGBA u32: 0xRRGGBBAA.
 * Use {@link rgba} to unpack into [r, g, b, a] for pixel buffer writes.
 */

function hex(v: string): number {
  const r = parseInt(v.slice(1, 3), 16)
  const g = parseInt(v.slice(3, 5), 16)
  const b = parseInt(v.slice(5, 7), 16)
  return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0
}

// ── Raw palette ──

export const palette = {
  void: hex("#04040a"),
  surface: hex("#0a0a12"),
  raised: hex("#0e0e18"),
  elevated: hex("#14141f"),
  floating: hex("#1a1a26"),
  borderWeak: hex("#181c2a"),
  borderBase: hex("#222838"),
  borderStrong: hex("#303850"),
  borderFocus: hex("#3e4a68"),
  muted: hex("#52587a"),
  text: hex("#c8cede"),
  bright: hex("#e0e6f0"),
  thread: hex("#4fc4d4"),
  anchor: hex("#4088cc"),
  signal: hex("#c8a040"),
  drift: hex("#a8483e"),
  purple: hex("#6b5a9a"),
  green: hex("#5cb878"),
  yellow: hex("#b8a850"),
  transparent: 0x00000000,
} as const

// ── Semantic surface tokens ──

export const surface = {
  void: palette.void,
  panel: palette.surface,
  card: palette.raised,
  context: palette.elevated,
  floating: palette.floating,
} as const

// ── Semantic accent tokens ──

export const accent = {
  thread: palette.thread,
  anchor: palette.anchor,
  signal: palette.signal,
  drift: palette.drift,
  purple: palette.purple,
  green: palette.green,
} as const

// ── Semantic text tokens ──

export const text = {
  primary: palette.bright,
  secondary: palette.text,
  muted: palette.muted,
} as const

// ── Semantic border tokens ──

export const border = {
  subtle: palette.borderWeak,
  normal: palette.borderBase,
  active: palette.borderStrong,
  focus: palette.borderFocus,
} as const

// ── RGBA helpers ──

/** Unpack a u32 RGBA into [r, g, b, a] bytes (0-255 each). */
export function rgba(packed: number): [number, number, number, number] {
  return [(packed >>> 24) & 0xff, (packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff]
}

/** Pack [r, g, b, a] bytes into a u32 RGBA. */
export function pack(r: number, g: number, b: number, a: number): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}

/** Create a color with modified alpha (0-255). */
export function alpha(packed: number, a: number): number {
  return ((packed & 0xffffff00) | (a & 0xff)) >>> 0
}
