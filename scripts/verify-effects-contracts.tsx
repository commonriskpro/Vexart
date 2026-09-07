/**
 * Focused GPU-effects contract checks.
 *
 * Unlike the golden suite, these checks assert observable pixels from the
 * real `renderToBuffer` path. They intentionally use sharp edges and an
 * impulse backdrop so a blur cannot pass by merely changing a smooth fill.
 *
 * Run with:
 *   bun --conditions=browser run scripts/verify-effects-contracts.tsx
 */

import { renderToBuffer } from "../packages/engine/src/testing/render-to-buffer"
import { EXPECTED_BRIDGE_VERSION, vexartVersion } from "../packages/engine/src/ffi/vexart-functions"

type Pixel = [number, number, number, number]
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

const EPSILON = 4
const INPUT: [number, number, number] = [51, 102, 153]

const nativeVersion = vexartVersion()
console.log(`Native bridge 0x${nativeVersion.toString(16)} (expected 0x${EXPECTED_BRIDGE_VERSION.toString(16)})`)

function pixel(frame: { pixels: Uint8Array; width: number }, x: number, y: number): Pixel {
  const offset = (y * frame.width + x) * 4
  return [frame.pixels[offset], frame.pixels[offset + 1], frame.pixels[offset + 2], frame.pixels[offset + 3]]
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertNear(name: string, actual: Pixel, expected: Pixel, epsilon = EPSILON) {
  const delta = actual.map((value, index) => Math.abs(value - expected[index]))
  assert(
    delta.every((value) => value <= epsilon),
    `${name}: expected ${expected.join(",")} ±${epsilon}, got ${actual.join(",")} (delta ${delta.join(",")})`,
  )
}

function assertDifferent(name: string, left: Pixel, right: Pixel, minimum = 8) {
  const delta = left.slice(0, 3).reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0)
  assert(delta >= minimum, `${name}: expected a visible pixel delta, got ${left.join(",")} and ${right.join(",")}`)
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}

function rgba(rgb: [number, number, number]): Pixel {
  return [
    Math.round(clamp(rgb[0]) * 255),
    Math.round(clamp(rgb[1]) * 255),
    Math.round(clamp(rgb[2]) * 255),
    255,
  ]
}

function filterExpected(props: BackdropProps): Pixel {
  let r = INPUT[0] / 255
  let g = INPUT[1] / 255
  let b = INPUT[2] / 255

  if (props.backdropBrightness !== undefined) {
    const factor = props.backdropBrightness / 100
    r *= factor
    g *= factor
    b *= factor
  }
  if (props.backdropContrast !== undefined) {
    const factor = props.backdropContrast / 100
    r = (r - 0.5) * factor + 0.5
    g = (g - 0.5) * factor + 0.5
    b = (b - 0.5) * factor + 0.5
  }

  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (props.backdropSaturate !== undefined) {
    const factor = props.backdropSaturate / 100
    r = luma + (r - luma) * factor
    g = luma + (g - luma) * factor
    b = luma + (b - luma) * factor
  }
  if (props.backdropGrayscale !== undefined) {
    const factor = Math.min(1, Math.max(0, props.backdropGrayscale / 100))
    r = r + (luma - r) * factor
    g = g + (luma - g) * factor
    b = b + (luma - b) * factor
  }
  if (props.backdropInvert !== undefined) {
    const factor = Math.min(1, Math.max(0, props.backdropInvert / 100))
    r = r + (1 - 2 * r) * factor
    g = g + (1 - 2 * g) * factor
    b = b + (1 - 2 * b) * factor
  }
  if (props.backdropSepia !== undefined) {
    const factor = Math.min(1, Math.max(0, props.backdropSepia / 100))
    const sr = r * 0.393 + g * 0.769 + b * 0.189
    const sg = r * 0.349 + g * 0.686 + b * 0.168
    const sb = r * 0.272 + g * 0.534 + b * 0.131
    r += (sr - r) * factor
    g += (sg - g) * factor
    b += (sb - b) * factor
  }
  if (props.backdropHueRotate !== undefined) {
    const radians = props.backdropHueRotate * Math.PI / 180
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    const m0 = 0.213 + c * 0.787 - s * 0.213
    const m1 = 0.715 - c * 0.715 - s * 0.715
    const m2 = 0.072 - c * 0.072 + s * 0.928
    const m3 = 0.213 - c * 0.213 + s * 0.143
    const m4 = 0.715 + c * 0.285 + s * 0.140
    const m5 = 0.072 - c * 0.072 - s * 0.283
    const m6 = 0.213 - c * 0.213 - s * 0.787
    const m7 = 0.715 - c * 0.715 + s * 0.715
    const m8 = 0.072 + c * 0.928 + s * 0.072
    const nr = r * m0 + g * m1 + b * m2
    const ng = r * m3 + g * m4 + b * m5
    const nb = r * m6 + g * m7 + b * m8
    r = nr
    g = ng
    b = nb
  }

  return rgba([r, g, b])
}

async function verifyBackdropBlur() {
  const width = 160
  const height = 64
  const frame = await renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x000000ff}>
      <box floating="parent" floatOffset={{ x: 70, y: 0 }} width={2} height={height} backgroundColor={0xffffffff} />
      <box
        floating="parent"
        floatOffset={{ x: 24, y: 8 }}
        zIndex={20}
        width={112}
        height={48}
        backgroundColor={0x00000001}
        backdropBlur={8}
      />
    </box>
  ), width, height, 4)

  // A dense blur response must cover the impulse's +/-8px support. The old
  // nine-tap shader emitted three repeated samples with 8px gaps instead.
  const response = Array.from({ length: 18 }, (_, index) => frame.pixels[(32 * width + 62 + index) * 4])
  const nonzero = response.map((value) => value > 2)
  assert(nonzero.every(Boolean), `backdrop blur impulse has gaps: ${response.join(",")}`)
  const peak = Math.max(...response)
  const peakIndex = response.indexOf(peak)
  assert(peakIndex >= 6 && peakIndex <= 11, `backdrop blur peak escaped impulse neighborhood: ${peakIndex + 62}`)
  assert(response[8] > response[0], `backdrop blur did not preserve a central response: ${response.join(",")}`)
  assert(frame.pixels[(32 * width + 10) * 4] === 0, "backdrop blur modified an unaffected neighbor")
}

const FILTERS: Array<{ name: string; props: BackdropProps }> = [
  { name: "brightness", props: { backdropBrightness: 150 } },
  { name: "contrast", props: { backdropContrast: 140 } },
  { name: "saturate", props: { backdropSaturate: 40 } },
  { name: "grayscale", props: { backdropGrayscale: 100 } },
  { name: "invert", props: { backdropInvert: 100 } },
  { name: "sepia", props: { backdropSepia: 100 } },
  { name: "hue-rotate", props: { backdropHueRotate: 180 } },
]

async function verifyIndependentBackdropFilters() {
  const width = FILTERS.length * 64
  const height = 96
  const frame = await renderToBuffer(() => (
    <box width={width} height={height} direction="row">
      {FILTERS.map((filter) => (
        <box width={64} height={height} backgroundColor={0x336699ff}>
          <box
            floating="parent"
            floatOffset={{ x: 0, y: 16 }}
            zIndex={20}
            width={64}
            height={64}
            backgroundColor={0x00000001}
            cornerRadius={0}
            {...filter.props}
          />
        </box>
      ))}
    </box>
  ), width, height, 4)

  FILTERS.forEach((filter, index) => {
    const x = index * 64
    const actual = pixel(frame, x + 32, 48)
    assertNear(`backdrop ${filter.name}`, actual, filterExpected(filter.props))
    assertNear(`backdrop ${filter.name} unaffected neighbor`, pixel(frame, x + 32, 4), [...INPUT, 255])
  })
}

async function verifyCornerMask() {
  const width = 128
  const height = 80
  const frame = await renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x224466ff}>
      <box floating="parent" floatOffset={{ x: 8, y: 8 }} width={96} height={64} backgroundColor={0x336699ff} />
      <box
        floating="parent"
        floatOffset={{ x: 8, y: 8 }}
        zIndex={20}
        width={96}
        height={64}
        backgroundColor={0x00000001}
        backdropBrightness={150}
        cornerRadius={20}
      />
    </box>
  ), width, height, 4)

  assertNear("rounded backdrop corner remains outside mask", pixel(frame, 9, 9), [...INPUT, 255])
  assertNear("rounded backdrop center is filtered", pixel(frame, 56, 40), [77, 152, 229, 255])
}

async function verifyScissor() {
  const width = 128
  const height = 80
  const frame = await renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x224466ff}>
      <box width={96} height={48} backgroundColor={0xff0000ff} scrollX scrollY>
        <box width={140} minWidth={140} flexShrink={0} height={80} backgroundColor={0x336699ff}>
          <box
            floating="parent"
            floatOffset={{ x: 72, y: 8 }}
            zIndex={20}
            width={64}
            height={40}
            backgroundColor={0x00000001}
            backdropBrightness={150}
          />
        </box>
      </box>
    </box>
  ), width, height, 4)

  assertNear("scissor keeps in-viewport backdrop", pixel(frame, 80, 20), [77, 152, 229, 255])
  assertNear("scissor clips effect at right edge", pixel(frame, 100, 20), [34, 68, 102, 255])
  assertNear("scissor clips effect below viewport", pixel(frame, 80, 52), [34, 68, 102, 255])
}

async function verifyScissorCropEquivalence() {
  const width = 140
  const height = 80
  const fullGradient = await renderToBuffer(() => (
    <box width={width} height={height} gradient={{ type: "linear", from: 0xff0000ff, to: 0x0000ffff, angle: 0 }} />
  ), width, height, 4)
  const croppedGradient = await renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x000000ff}>
      <box width={96} height={48} scrollX scrollY>
        <box
          width={width}
          minWidth={width}
          flexShrink={0}
          height={height}
          gradient={{ type: "linear", from: 0xff0000ff, to: 0x0000ffff, angle: 0 }}
        />
      </box>
    </box>
  ), width, height, 4)

  const gradientPoints = [[8, 8], [24, 16], [48, 24], [72, 32], [88, 40], [94, 46]] as const
  gradientPoints.forEach(([x, y]) => {
    assertNear(`scissor preserves gradient crop at ${x},${y}`, pixel(croppedGradient, x, y), pixel(fullGradient, x, y))
  })

  const fullRounded = await renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x000000ff}>
      <box
        width={width}
        height={height}
        gradient={{ type: "linear", from: 0xff0000ff, to: 0x0000ffff, angle: 0 }}
        cornerRadius={40}
      />
    </box>
  ), width, height, 4)
  const croppedRounded = await renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x000000ff}>
      <box width={96} height={48} scrollX scrollY>
        <box
          width={width}
          minWidth={width}
          flexShrink={0}
          height={height}
          gradient={{ type: "linear", from: 0xff0000ff, to: 0x0000ffff, angle: 0 }}
          cornerRadius={40}
        />
      </box>
    </box>
  ), width, height, 4)

  // These points sit near the source corner and catch both radius rescaling
  // and gradient rescaling if clipping mutates the paint geometry.
  const roundedPoints = [[20, 2], [32, 2], [8, 12], [20, 12], [48, 24], [88, 40]] as const
  roundedPoints.forEach(([x, y]) => {
    assertNear(`scissor preserves rounded crop at ${x},${y}`, pixel(croppedRounded, x, y), pixel(fullRounded, x, y))
  })
}

async function verifyScissorHaloClipping() {
  const width = 128
  const height = 80
  const background: Pixel = [34, 68, 102, 255]
  const renderHalo = (kind: "shadow" | "glow") => renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x224466ff}>
      <box
        width={96}
        height={48}
        backgroundColor={0x224466ff}
        scrollX
        scrollY
        direction="row"
        alignX="right"
        alignY="bottom"
      >
        <box
          width={20}
          height={20}
          marginRight={2}
          backgroundColor={0xffffffff}
          shadow={kind === "shadow" ? { x: 10, y: 10, blur: 10, color: 0xff0000ff } : undefined}
          glow={kind === "glow" ? { radius: 12, color: 0x00ff00ff, intensity: 100 } : undefined}
        />
      </box>
    </box>
  ), width, height, 4)
  const renderUnclippedHalo = (kind: "shadow" | "glow") => renderToBuffer(() => (
    <box width={width} height={height} backgroundColor={0x224466ff}>
      <box
        floating="parent"
        floatOffset={{ x: 74, y: 28 }}
        width={20}
        height={20}
        marginRight={2}
        backgroundColor={0xffffffff}
        shadow={kind === "shadow" ? { x: 10, y: 10, blur: 10, color: 0xff0000ff } : undefined}
        glow={kind === "glow" ? { radius: 12, color: 0x00ff00ff, intensity: 100 } : undefined}
      />
    </box>
  ), width, height, 4)

  const shadow = await renderHalo("shadow")
  const glow = await renderHalo("glow")
  const unclippedShadow = await renderUnclippedHalo("shadow")
  const unclippedGlow = await renderUnclippedHalo("glow")
  const interiorPoints = [[68, 40], [70, 40], [72, 40], [73, 28]] as const
  interiorPoints.forEach(([x, y]) => {
    assertNear(`shadow preserves source inside scissor at ${x},${y}`, pixel(shadow, x, y), pixel(unclippedShadow, x, y))
    assertNear(`glow preserves source inside scissor at ${x},${y}`, pixel(glow, x, y), pixel(unclippedGlow, x, y))
  })
  // The source rect stays inside the scroller with a two-pixel right margin.
  // Its red shadow and green glow extend beyond the viewport, but must clip.
  const outsidePoints = [[96, 47], [100, 44], [92, 48], [100, 52], [110, 44]] as const
  outsidePoints.forEach(([x, y]) => {
    assertNear(`shadow scissor halo at ${x},${y}`, pixel(shadow, x, y), background)
    assertNear(`glow scissor halo at ${x},${y}`, pixel(glow, x, y), background)
  })
  const shadowControl = pixel(shadow, 95, 36)
  assert(
    shadowControl[0] > background[0] + 8
      && shadowControl[1] < background[1] - 2
      && shadowControl[2] < background[2] - 2,
    `shadow fixture did not produce an in-viewport red halo: ${shadowControl.join(",")}`,
  )
  assert(pixel(glow, 73, 28)[1] > background[1] + 40, "glow fixture did not produce an in-viewport green halo")
}

async function verifyOpacityGradientsAndHalos() {
  const opacity = await renderToBuffer(() => (
    <box width={64} height={64} backgroundColor={0xffffffff}>
      <box width={32} height={32} backgroundColor={0xff0000ff} opacity={0.5} />
    </box>
  ), 64, 64, 4)
  assertNear("opacity blends source and backdrop", pixel(opacity, 16, 16), [255, 127, 127, 255])
  assertNear("opacity leaves neighbor untouched", pixel(opacity, 48, 48), [255, 255, 255, 255])

  const linear = await renderToBuffer(() => (
    <box width={64} height={64} gradient={{ type: "linear", from: 0xff0000ff, to: 0x0000ffff, angle: 0 }} />
  ), 64, 64, 4)
  assert(pixel(linear, 4, 32)[0] > 200 && pixel(linear, 4, 32)[2] < 60, "linear gradient start is not red")
  assert(pixel(linear, 60, 32)[2] > 200 && pixel(linear, 60, 32)[0] < 60, "linear gradient end is not blue")
  assertDifferent("linear gradient center", pixel(linear, 4, 32), pixel(linear, 60, 32), 300)

  const radial = await renderToBuffer(() => (
    <box width={64} height={64} gradient={{ type: "radial", from: 0xffffffff, to: 0x000000ff }} />
  ), 64, 64, 4)
  assert(pixel(radial, 32, 32)[0] > 220, "radial gradient center is not bright")
  assert(pixel(radial, 2, 32)[0] < 40, "radial gradient edge is not dark")

  const corners = await renderToBuffer(() => (
    <box width={96} height={64} backgroundColor={0x000000ff}>
      <box
        floating="parent"
        floatOffset={{ x: 16, y: 16 }}
        width={64}
        height={32}
        backgroundColor={0xff0000ff}
        cornerRadii={{ tl: 24, tr: 2, br: 24, bl: 2 }}
      />
    </box>
  ), 96, 64, 4)
  assertNear("per-corner top-left mask", pixel(corners, 17, 17), [0, 0, 0, 255])
  assertNear("per-corner top-right mask", pixel(corners, 78, 17), [255, 0, 0, 255])
  assertNear("per-corner bottom-right mask", pixel(corners, 78, 46), [0, 0, 0, 255])
  assertNear("per-corner bottom-left mask", pixel(corners, 17, 46), [255, 0, 0, 255])

  const halos = await renderToBuffer(() => (
    <box width={64} height={64} backgroundColor={0x000000ff}>
      <box
        floating="parent"
        floatOffset={{ x: 16, y: 16 }}
        width={24}
        height={24}
        backgroundColor={0xffffffff}
        shadow={{ x: 8, y: 8, blur: 8, color: 0xff0000aa }}
        glow={{ radius: 10, color: 0x00ff00ff, intensity: 100 }}
      />
    </box>
  ), 64, 64, 4)
  assert(pixel(halos, 48, 48)[0] > 10, "drop shadow did not produce an offset halo")
  assert(pixel(halos, 45, 32)[1] > 10, "outer glow did not produce a neighboring halo")

  const multiShadow = await renderToBuffer(() => (
    <box width={96} height={64} backgroundColor={0x000000ff}>
      <box
        floating="parent"
        floatOffset={{ x: 32, y: 16 }}
        width={32}
        height={32}
        backgroundColor={0xffffffff}
        shadow={[
          { x: -8, y: 0, blur: 6, color: 0xff0000aa },
          { x: 8, y: 0, blur: 6, color: 0x0000ffaa },
        ]}
      />
    </box>
  ), 96, 64, 4)
  const leftShadow = pixel(multiShadow, 22, 32)
  const rightShadow = pixel(multiShadow, 72, 32)
  assert(leftShadow[0] > leftShadow[2] + 30, `left multi-shadow channel missing: ${leftShadow.join(",")}`)
  assert(rightShadow[2] > rightShadow[0] + 30, `right multi-shadow channel missing: ${rightShadow.join(",")}`)
}

async function verifyGroupOpacity() {
  const frame = await renderToBuffer(() => (
    <box width={64} height={64} backgroundColor={0xffffffff}>
      <box width={32} height={32} opacity={0.5}>
        <box width={32} height={32} backgroundColor={0xff0000ff} />
      </box>
    </box>
  ), 64, 64, 4)
  assertNear("group opacity composites its subtree", pixel(frame, 16, 16), [255, 127, 127, 255])
  assertNear("group opacity leaves neighbor untouched", pixel(frame, 48, 48), [255, 255, 255, 255])
}

const checks: Array<[string, () => Promise<void>]> = [
  ["backdrop blur impulse", verifyBackdropBlur],
  ["independent backdrop filters", verifyIndependentBackdropFilters],
  ["rounded backdrop mask", verifyCornerMask],
  ["scroll scissor", verifyScissor],
  ["scissor crop equivalence", verifyScissorCropEquivalence],
  ["scissor halo clipping", verifyScissorHaloClipping],
  ["group opacity", verifyGroupOpacity],
  ["opacity, gradients, shadow and glow", verifyOpacityGradientsAndHalos],
]

for (const [name, check] of checks) {
  const started = performance.now()
  try {
    await check()
    console.log(`PASS ${name} (${(performance.now() - started).toFixed(0)}ms)`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (process.exitCode) process.exit(process.exitCode)
