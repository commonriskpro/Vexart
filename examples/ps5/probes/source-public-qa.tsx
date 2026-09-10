import assert from "node:assert/strict"
import { resolve } from "node:path"
import sharp from "sharp"
import { renderToBuffer, renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"
import { focusedId } from "vexart"
import { Box, Dialog, DialogContent, DialogOverlay, Show, Text, createSignal, createTransition } from "vexart"
import { ProbeScene, createProbeState } from "./public-consumer"

function pixelDelta(left: Uint8Array, right: Uint8Array) {
  let changed = 0
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) changed++
  }
  return changed
}

function alphaPixels(pixels: Uint8Array) {
  let count = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++
  return count
}

function variedPixels(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number, background: [number, number, number]) {
  let count = 0
  const [br, bg, bb] = background
  for (let row = Math.max(0, y); row < Math.min(y + h, 560); row++) {
    for (let col = Math.max(0, x); col < Math.min(x + w, width); col++) {
      const offset = (row * width + col) * 4
      if (Math.abs(pixels[offset] - br) + Math.abs(pixels[offset + 1] - bg) + Math.abs(pixels[offset + 2] - bb) > 18) count++
    }
  }
  return count
}

function colorBuckets(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number) {
  const buckets = new Set<string>()
  for (let row = Math.max(0, y); row < Math.min(y + h, 560); row++) {
    for (let col = Math.max(0, x); col < Math.min(x + w, width); col++) {
      const offset = (row * width + col) * 4
      buckets.add(`${pixels[offset] >> 4}:${pixels[offset + 1] >> 4}:${pixels[offset + 2] >> 4}`)
    }
  }
  return buckets.size
}

function pixelRgb(pixels: Uint8Array, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2]] as const
}

function sameRgb(actual: readonly number[], expected: readonly number[]) {
  return actual[0] === expected[0] && actual[1] === expected[1] && actual[2] === expected[2]
}

function assetPath(path: string) {
  const marker = "/assets/"
  const index = path.lastIndexOf(marker)
  return index >= 0 ? path.slice(index + 1) : path
}

const fixtureWidth = 420
const fixtureHeight = 300
const fixtureRowX = 18
const fixtureRowY = 48
const fixtureViewportWidth = 220
const fixtureRowHeight = 80
const fixtureItemWidth = 48
const fixtureGap = 12
const fixtureAdvance = fixtureItemWidth + fixtureGap
const fixtureRowWidth = 6 * fixtureItemWidth + 5 * fixtureGap
const fixtureItems = [
  { color: "#ba8b5a" },
  { color: "#4a77ba" },
  { color: "#5d3b8f" },
  { color: "#2f8c77" },
  { src: resolve(import.meta.dir, "../assets/covers/ghost-of-tsushima.png") },
  { src: resolve(import.meta.dir, "../assets/covers/marvels-spider-man-2.png") },
]

function createClipFixtureState() {
  const [offset, setOffset] = createTransition(0, { duration: 120 })
  const [overlay, setOverlay] = createSignal(false)
  const [clicked, setClicked] = createSignal<number | null>(null)
  return { offset, setOffset, overlay, setOverlay, clicked, setClicked }
}

let fixtureSetOffset: ((target: number) => void) | undefined
let fixtureClicked: (() => number | null) | undefined

function ClipFixture(props: { layer: boolean }) {
  // The state is intentionally created by the mounted public component, not
  // by the QA adapter, so the fixture exercises normal Solid ownership.
  const state = createClipFixtureState()
  fixtureSetOffset = state.setOffset
  fixtureClicked = state.clicked
  return (
    <Box width={fixtureWidth} height={fixtureHeight} backgroundColor="#0b0d10" direction="column" padding={18} gap={10}>
      <Text color="#f5f5f5" fontSize={16}>clip fixture</Text>
      <Box width={fixtureViewportWidth} height={fixtureRowHeight} scrollX layer={props.layer} backgroundColor="#090c11">
        <Box width={fixtureRowWidth} height={fixtureRowHeight} flexShrink={0} direction="row" gap={fixtureGap} transform={{ translateX: state.offset() }}>
          {fixtureItems.map((item, index) => (
            <Box width={fixtureItemWidth} height={fixtureRowHeight} flexShrink={0} focusable onPress={() => state.setClicked(index)} backgroundColor={item.color ?? "#303640"}>
              {item.src ? <img src={item.src} width={fixtureItemWidth} height={fixtureRowHeight} objectFit="cover" /> : null}
            </Box>
          ))}
        </Box>
      </Box>
      <Box width={150} height={32} focusable onPress={() => state.setOverlay(true)} backgroundColor="#303640" cornerRadius={6} alignX="center" alignY="center">
        <Text color="#ffffff">Open overlay</Text>
      </Box>
      <Show when={state.overlay()}>
        <Dialog onClose={() => state.setOverlay(false)}>
          <DialogOverlay backgroundColor="#000000b8" />
          <DialogContent width={240} padding={16} backgroundColor="#151a20">
            <Box direction="column" gap={10}>
              <Text color="#ffffff">Fixture overlay</Text>
              <Box width={110} height={30} focusable onPress={() => state.setOverlay(false)} backgroundColor="#303640" alignX="center" alignY="center">
                <Text color="#ffffff">Close</Text>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </Show>
    </Box>
  )
}

async function runClipVariant(name: string, layer: boolean, overlay: boolean) {
  const initial = await renderToBuffer(() => <ClipFixture layer={layer} />, fixtureWidth, fixtureHeight, 5)
  const final = await renderToBufferAfterInteractions(() => <ClipFixture layer={layer} />, fixtureWidth, fixtureHeight, async ({ clickAt, keyPress, frame }) => {
    // Leave the translated strip extending past the right edge so a missing
    // clip is observable in the paired no-layer frame.
    fixtureSetOffset!(-fixtureAdvance)
    await new Promise((resolve) => setTimeout(resolve, 180))
    await frame()
    await clickAt(fixtureRowX + 2 * fixtureAdvance + fixtureItemWidth / 2 - fixtureAdvance, fixtureRowY + fixtureRowHeight / 2)
    if (overlay) {
      await clickAt(90, 160)
      await keyPress("escape")
      await frame()
    }
  }, 5)
  const inside = variedPixels(final.pixels, final.width, fixtureRowX, fixtureRowY, fixtureViewportWidth, fixtureRowHeight, [9, 12, 17])
  const outside = variedPixels(final.pixels, final.width, fixtureRowX + fixtureViewportWidth, fixtureRowY, fixtureWidth - fixtureRowX - fixtureViewportWidth, fixtureRowHeight, [11, 13, 16])
  const colorCenters = [
    pixelRgb(final.pixels, final.width, fixtureRowX + fixtureItemWidth / 2, fixtureRowY + fixtureRowHeight / 2),
    pixelRgb(final.pixels, final.width, fixtureRowX + fixtureAdvance + fixtureItemWidth / 2, fixtureRowY + fixtureRowHeight / 2),
    pixelRgb(final.pixels, final.width, fixtureRowX + 2 * fixtureAdvance + fixtureItemWidth / 2, fixtureRowY + fixtureRowHeight / 2),
  ]
  const expectedColors = [[74, 119, 186], [93, 59, 143], [47, 140, 119]]
  const colorPositionsObserved = colorCenters.every((actual, index) => sameRgb(actual, expectedColors[index]))
  const imageBuckets = colorBuckets(final.pixels, final.width, fixtureRowX + 3 * fixtureAdvance, fixtureRowY, fixtureItemWidth - 8, fixtureRowHeight)
  const result = {
    name,
    layer,
    overlay,
    initialDeltaBytes: pixelDelta(initial.pixels, final.pixels),
    insideInk: inside,
    outsideInk: outside,
    pointerHit: fixtureClicked?.() ?? null,
    colorCenters,
    colorPositionsObserved,
    imageBuckets,
    enteringImageVisible: imageBuckets > 30,
    visibleAfterTransform: inside > 500 && colorPositionsObserved,
    // The row is flat except for the translated items, so any residual ink
    // outside the 220px viewport is evidence of a clip miss. Keep this bound
    // strict enough to distinguish the no-layer pair from the layered pair.
    clipObserved: outside < 50,
    pointerHitObserved: colorPositionsObserved && fixtureClicked?.() === 2,
  }
  const artifactDir = resolve(import.meta.dir, "../../../scripts/ps5-demo/artifacts")
  await sharp(Buffer.from(initial.pixels), { raw: { width: initial.width, height: initial.height, channels: 4 } }).png().toFile(resolve(artifactDir, `clip-${name}-initial.png`))
  await sharp(Buffer.from(final.pixels), { raw: { width: final.width, height: final.height, channels: 4 } }).png().toFile(resolve(artifactDir, `clip-${name}-final.png`))
  return result
}

const clipVariants = [
  await runClipVariant("no-layer", false, false),
  await runClipVariant("layer", true, false),
  await runClipVariant("layer-overlay", true, true),
]

const clipBlockers = [
  ...clipVariants.filter((variant) => !variant.colorPositionsObserved).map((variant) => ({
    id: "PS5-API-CLIP-NOLAYER-POSITION",
    variant: variant.name,
    expected: "translated item 1/2/3 colors at x=42/102/162 after offset -60",
    observed: variant.colorCenters,
  })),
  ...clipVariants.filter((variant) => variant.layer && !variant.enteringImageVisible).map((variant) => ({
    id: "PS5-API-CLIP-LAYER-IMAGE",
    variant: variant.name,
    expected: "ghost image pixels enter x=198..238 after offset -60",
    observed: { imageBuckets: variant.imageBuckets, colorCenters: variant.colorCenters },
  })),
]
const clipGatePassed = clipBlockers.length === 0

const initial = await renderToBuffer(() => {
  const initialState = createProbeState()
  return <ProbeScene state={initialState} />
}, 720, 560, 6)
let crossfadeState: ReturnType<typeof createProbeState> | undefined
const crossfadeResult = await renderToBufferAfterInteractions(() => {
  crossfadeState ??= createProbeState()
  return <ProbeScene state={crossfadeState} />
}, 720, 560, async ({ frame }) => {
  crossfadeState!.select(1)
  // The first transition tick is synchronous; a following frame lands within
  // the one-second probe transition rather than at its final target.
  await new Promise((resolve) => setTimeout(resolve, 1))
  await frame()
})
let state: ReturnType<typeof createProbeState> | undefined
let crossfadeSample = Number.NaN
let crossfadeFrom = ""
let crossfadeTo = ""
let rapidNavigation = false
let overlayFocusRestored = false
const scene = () => {
  state ??= createProbeState()
  return <ProbeScene state={state} />
}
const result = await renderToBufferAfterInteractions(scene, 720, 560, async ({ clickAt, keyPress, frame }) => {
  for (let i = 0; i < 35; i++) await keyPress("right")
  for (let i = 0; i < 7; i++) await keyPress("left")
  assert.equal(state!.snapshot().selected, 16, "rapid navigation must clamp and retarget to the latest selection")
  rapidNavigation = true

  // Retarget once without waiting for the timer-backed fade to settle. The
  // public transition signal must expose a real intermediate frame while the
  // previous and next local hero paths remain distinct.
  state!.select(15)
  await frame()
  await new Promise((resolve) => setTimeout(resolve, 1))
  await frame()
  crossfadeSample = state!.heroFade()
  crossfadeFrom = String(state!.heroFrom())
  crossfadeTo = String(state!.heroTo())
  assert.ok(crossfadeSample >= 0 && crossfadeSample < 1, `crossfade did not expose an intermediate alpha: ${crossfadeSample}`)
  assert.notEqual(state!.heroFrom(), state!.heroTo(), "crossfade retarget did not keep distinct source and destination heroes")

  const beforeOverlaySelection = state!.snapshot().selected
  await clickAt(100, 410)
  assert.equal(state!.snapshot().overlay, true, "public overlay trigger did not open")
  const openerFocus = state!.openerFocus()
  assert.ok(openerFocus, "overlay opener did not receive focus before the public dialog scope")
  await keyPress("escape")
  await frame()
  assert.equal(state!.snapshot().overlay, false, "Escape did not close the public overlay")
  assert.equal(state!.snapshot().selected, beforeOverlaySelection, "overlay changed the underlying selection")
  assert.equal(focusedId(), openerFocus, "overlay did not restore the exact opener focus")
  overlayFocusRestored = true
})

assert.ok(alphaPixels(result.pixels) > 20_000, "source-public scene produced no meaningful pixels")
assert.ok(pixelDelta(initial.pixels, result.pixels) > 100, "rapid navigation did not change the rendered frame")
const heroInk = variedPixels(crossfadeResult.pixels, crossfadeResult.width, 18, 50, 680, 190, [21, 26, 32])
const heroBuckets = colorBuckets(crossfadeResult.pixels, crossfadeResult.width, 18, 50, 680, 190)
const rowInsideInk = variedPixels(result.pixels, result.width, 18, 280, 440, 104, [9, 12, 17])
const rowOutsideInk = variedPixels(result.pixels, result.width, 458, 280, 242, 104, [11, 13, 16])
const imagesAndCrossfade = crossfadeSample > 0 && crossfadeSample < 1 && crossfadeFrom !== crossfadeTo && heroInk > 2_000 && heroBuckets > 30
assert.ok(imagesAndCrossfade, `local hero artwork/crossfade oracle failed: fade=${crossfadeSample} ink=${heroInk} buckets=${heroBuckets}`)
assert.ok(crossfadeState!.heroFade() > 0 && crossfadeState!.heroFade() < 1, `crossfade frame settled at an endpoint: ${crossfadeState!.heroFade()}`)
assert.notEqual(crossfadeState!.heroFrom(), crossfadeState!.heroTo(), "crossfade frame lost its distinct hero paths")
const artifactDir = resolve(import.meta.dir, "../../../scripts/ps5-demo/artifacts")
await sharp(Buffer.from(result.pixels), { raw: { width: result.width, height: result.height, channels: 4 } }).png().toFile(resolve(artifactDir, "source-public-final.png"))
await sharp(Buffer.from(crossfadeResult.pixels), { raw: { width: crossfadeResult.width, height: crossfadeResult.height, channels: 4 } }).png().toFile(resolve(artifactDir, "source-public-crossfade.png"))
const report = {
  layer: "source-public-offscreen",
  reconciler: "source engine + source public barrel + internal QA adapter",
  dimensions: { width: result.width, height: result.height },
  selected: state!.snapshot().selected,
  hero: assetPath(state!.snapshot().hero),
  focus: focusedId(),
  alphaPixels: alphaPixels(result.pixels),
  initialDeltaBytes: pixelDelta(initial.pixels, result.pixels),
  imageBytes: result.pixels.byteLength,
  heroInk,
  heroBuckets,
  rowInsideInk,
  rowOutsideInk,
  clipVariants,
  checks: {
    // This is intentionally narrower than a final visual crossfade claim:
    // local artwork and an intermediate alpha were observed offscreen.
    localImageAndIntermediateAlphaObserved: imagesAndCrossfade,
    crossfadeVisualFinal: false,
    horizontalTransformClipCandidate: clipGatePassed && clipVariants.some((variant) => variant.layer && variant.colorPositionsObserved && variant.enteringImageVisible && variant.clipObserved),
    transformedPointerHit: clipGatePassed && clipVariants.every((variant) => variant.pointerHitObserved),
    overlayFocusRestore: overlayFocusRestored,
    rapidNavigation,
  },
  blockers: clipBlockers,
  runtimeRow: {
    visibleAfterNavigation: rowInsideInk > 500,
    outsideInk: rowOutsideInk,
    status: rowInsideInk > 500 ? "unverified-overlay-lifecycle" : "pending-row-empty-after-overlay-lifecycle",
  },
  status: clipBlockers.length > 0 ? "STOP-public-transform-clip" : "PENDING-packaged-PTY-review",
  crossfade: { sample: crossfadeSample, from: crossfadeFrom, to: crossfadeTo },
}
await Bun.write(resolve(artifactDir, "source-public-qa.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
if (clipBlockers.length > 0) process.exitCode = 1
