import { alpha, palette } from "./color"

export type Shadow = {
  x: number
  y: number
  blur: number
  color: number
}

export const shadow = {
  none: { x: 0, y: 0, blur: 0, color: palette.transparent } satisfies Shadow,
  subtle: { x: 0, y: 1, blur: 3, color: alpha(palette.void, 0x80) } satisfies Shadow,
  elevated: { x: 0, y: 2, blur: 6, color: alpha(palette.void, 0xa0) } satisfies Shadow,
  floating: { x: 0, y: 4, blur: 12, color: alpha(palette.void, 0xc0) } satisfies Shadow,
} as const
