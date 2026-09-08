import assert from "node:assert/strict"
import type { FilterConfig } from "../../../packages/engine/src/ffi/node"
import type { RenderToBufferResult } from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 440
export const height = 260

type FilterSceneOptions = {
  disableSelfFilters?: boolean
  disableSelfBlur?: boolean
  disableBackdropFilters?: boolean
}

const ORANGE = 0xf97316ff
const SELF_FILTERS: FilterConfig[] = [
  { brightness: 50 },
  { contrast: 50 },
  { saturate: 0 },
  { grayscale: 100 },
  { invert: 100 },
  { sepia: 100 },
  { hueRotate: 180 },
  { blur: 4 },
]
const SELF_EXPECTED = [
  [125, 58, 11, 255],
  [188, 121, 75, 255],
  [137, 137, 137, 255],
  [137, 137, 137, 255],
  [6, 140, 233, 255],
  [190, 169, 132, 255],
  [25, 159, 252, 255],
]
const BACKDROP_KEYS = [
  "backdropBlur",
  "backdropBrightness",
  "backdropContrast",
  "backdropSaturate",
  "backdropGrayscale",
  "backdropInvert",
  "backdropSepia",
  "backdropHueRotate",
] as const

type BackdropProps = {
  backdropBlur?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
}

function selfCard(filter: FilterConfig, disabled: boolean, blurDisabled: boolean) {
  if (filter.blur !== undefined) {
    return (
      <box width={40} height={40} backgroundColor={ORANGE} filter={disabled || blurDisabled ? undefined : filter}>
        <box width={20} height={40} backgroundColor={0x2563ebff} floating="parent" floatOffset={{ x: 20, y: 0 }} zIndex={0} />
      </box>
    )
  }
  return <box width={40} height={40} backgroundColor={ORANGE} filter={disabled ? undefined : filter} />
}

function backdropProps(index: number): BackdropProps {
  if (index === 0) return { backdropBlur: 8 }
  if (index === 1) return { backdropBrightness: 50 }
  if (index === 2) return { backdropContrast: 50 }
  if (index === 3) return { backdropSaturate: 0 }
  if (index === 4) return { backdropGrayscale: 100 }
  if (index === 5) return { backdropInvert: 100 }
  if (index === 6) return { backdropSepia: 100 }
  return { backdropHueRotate: 180 }
}

function backdropTile(index: number, disabled: boolean) {
  const props = disabled ? {} : backdropProps(index)
  return (
    <box width={40} height={72} backgroundColor={0xef4444ff}>
      {/* A shared red/blue edge makes blur observable at the same probe in every tile. */}
      <box width={20} height={72} backgroundColor={0x2563ebff} floating="parent" floatOffset={{ x: 20, y: 0 }} zIndex={0} />
      <box width={40} height={72} backgroundColor={0xffffff20} cornerRadius={6} floating="parent" floatOffset={{ x: 0, y: 0 }} zIndex={1} {...props} />
    </box>
  )
}

export function Scene(options: FilterSceneOptions = {}) {
  return (
    <box width={width} height={height} backgroundColor={0x080b16ff} padding={16} direction="column" gap={8}>
      <box direction="row" gap={4} height={40}>
        {SELF_FILTERS.map((filter) => selfCard(filter, options.disableSelfFilters === true, options.disableSelfBlur === true))}
      </box>
      <box direction="row" gap={4} height={72}>
        <box width={40} height={72} backgroundColor={0xef4444ff}>
          <box width={20} height={72} backgroundColor={0x2563ebff} floating="parent" floatOffset={{ x: 20, y: 0 }} zIndex={0} />
          <box width={40} height={72} backgroundColor={0xffffff20} cornerRadius={6} floating="parent" floatOffset={{ x: 0, y: 0 }} zIndex={1} />
        </box>
        {BACKDROP_KEYS.map((_, index) => backdropTile(index, options.disableBackdropFilters === true))}
      </box>
    </box>
  )
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)

  const selfY = 36
  SELF_EXPECTED.forEach((expected, index) => {
    assert.deepEqual(pixel(frame, 36 + index * 44, selfY), new Uint8Array(expected), `self filter ${index} mismatch`)
  })
  // The left side stays orange while an internal blue edge is softened by
  // blur; the two probes below distinguish the filter from an absent blur.
  const blurStart = 16 + 7 * 44
  assert.deepEqual(pixel(frame, blurStart + 10, selfY), new Uint8Array([249, 115, 22, 255]), "self blur source mismatch")
  const selfBlurLeft = pixel(frame, blurStart + 19, selfY)
  const selfBlurRight = pixel(frame, blurStart + 21, selfY)
  assert.ok(selfBlurLeft[2] > 22 && selfBlurLeft[0] < 249, "self blur left edge was not softened")
  assert.ok(selfBlurRight[0] > 37 && selfBlurRight[2] < 235, "self blur right edge was not softened")

  // Every backdrop card uses the same red/blue source edge. Comparing the
  // identical edge location prevents a changing background from masking a
  // missing filter implementation.
  const control = pixel(frame, 36, 100)
  BACKDROP_KEYS.forEach((key, index) => {
    const actual = pixel(frame, 80 + index * 44, 100)
    const distance = Math.abs(actual[0] - control[0]) + Math.abs(actual[1] - control[1]) + Math.abs(actual[2] - control[2])
    assert.ok(distance > 6, `${key} did not change its backdrop probe`)
  })
}
