/**
 * Focused public <img> GPU capability probe.
 *
 * Run with:
 *   bash scripts/ps5-demo/run-app-source.sh tests/image-style-probe.tsx
 *
 * This is intentionally a script (not a *.test.tsx file), so it can report
 * an observed public-API blocker without changing the normal test suite.
 */

import { unlink } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"

import { renderToBuffer } from "../../../packages/engine/src/testing/render-to-buffer"

const viewport = { width: 48, height: 48 }
const image = { x: 0, y: 0, width: 24, height: 24 }
const background = [16, 32, 48] as const
const sourceSize = { width: 4, height: 2 }

type Fit = "contain" | "fill" | "cover"

const fixtureColors = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
} as const

type FixtureColor = keyof typeof fixtureColors

type Probe = {
  fit: Fit
  radius: number
}

function pixel(pixels: Uint8Array, x: number, y: number) {
  const offset = (y * viewport.width + x) * 4
  return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!] as const
}

function rgbDistance(left: readonly number[], right: readonly number[]) {
  return Math.max(
    Math.abs(left[0]! - right[0]!),
    Math.abs(left[1]! - right[1]!),
    Math.abs(left[2]! - right[2]!),
  )
}

function imagePixel(result: { pixels: Uint8Array }, x: number, y: number) {
  return pixel(result.pixels, image.x + x, image.y + y)
}

function delta(left: Uint8Array, right: Uint8Array) {
  let total = 0
  let changed = 0
  for (let index = 0; index < left.length; index += 4) {
    const difference = Math.abs(left[index]! - right[index]!)
      + Math.abs(left[index + 1]! - right[index + 1]!)
      + Math.abs(left[index + 2]! - right[index + 2]!)
    total += difference
    if (difference > 3) changed++
  }
  return { total, changed }
}

function nearestFixtureColor(sample: readonly number[]) {
  return Object.entries(fixtureColors)
    .map(([name, color]) => ({ name, distance: rgbDistance(sample, color) }))
    .sort((left, right) => left.distance - right.distance)[0]!
}

function checkSamples(samples: readonly (readonly number[])[], expected: readonly FixtureColor[]) {
  return samples.map((sample, index) => {
    const observed = nearestFixtureColor(sample)
    const expectedColor = expected[index]!
    return {
      expected: expectedColor,
      observed: observed.name,
      distance: observed.distance,
      rgb: sample,
      matches: observed.name === expectedColor && observed.distance <= 64,
    }
  })
}

async function render(source: string, probe: Probe) {
  return renderToBuffer(
    () => (
      <box width={viewport.width} height={viewport.height} backgroundColor={0x102030ff}>
        <img
          src={source}
          width={image.width}
          height={image.height}
          objectFit={probe.fit}
          cornerRadius={probe.radius}
        />
      </box>
    ),
    viewport.width,
    viewport.height,
    8,
  )
}

const sourcePath = join("/tmp", `vexart-image-style-probe-${process.pid}.png`)

// Four distinct columns repeated across both rows make fill vs cover
// observable after fitting a 2:1 source into a square target.
const rgba = Buffer.from([
  255, 0, 0, 255,       0, 255, 0, 255,       0, 0, 255, 255,       255, 255, 0, 255,
  255, 0, 0, 255,       0, 255, 0, 255,       0, 0, 255, 255,       255, 255, 0, 255,
])

await sharp(rgba, { raw: { width: sourceSize.width, height: sourceSize.height, channels: 4 } })
  .png()
  .toFile(sourcePath)

try {
  // renderToBuffer swaps process-global backend state, so these captures must
  // remain sequential even though each individual capture is asynchronous.
  const fill = await render(sourcePath, { fit: "fill", radius: 0 })
  const roundedSquare = await render(sourcePath, { fit: "fill", radius: image.width / 2 })
  const coverWide = await render(sourcePath, { fit: "cover", radius: 0 })
  const containSquare = await render(sourcePath, { fit: "contain", radius: 0 })

  const cornerWithoutRadius = imagePixel(fill, 0, 0)
  const cornerWithRadius = imagePixel(roundedSquare, 0, 0)
  const centerWithoutRadius = imagePixel(fill, image.width / 2, image.height / 2)
  const centerWithRadius = imagePixel(roundedSquare, image.width / 2, image.height / 2)
  const cornerMaskDelta = delta(fill.pixels, roundedSquare.pixels)
  const fitDelta = delta(fill.pixels, coverWide.pixels)
  const fillSamples = [
    imagePixel(fill, 3, 12),
    imagePixel(fill, 9, 12),
    imagePixel(fill, 15, 12),
    imagePixel(fill, 21, 12),
  ]
  const coverSamples = [
    imagePixel(coverWide, 3, 12),
    imagePixel(coverWide, 9, 12),
    imagePixel(coverWide, 15, 12),
    imagePixel(coverWide, 21, 12),
  ]
  const containLetterboxTop = imagePixel(containSquare, 3, 1)
  const containLetterboxBottom = imagePixel(containSquare, 3, image.height - 2)
  const containSamples = [
    imagePixel(containSquare, 3, 12),
    imagePixel(containSquare, 9, 12),
    imagePixel(containSquare, 15, 12),
    imagePixel(containSquare, 21, 12),
  ]

  const fillSemantics = checkSamples(fillSamples, ["red", "green", "blue", "yellow"])
  const coverSemantics = checkSamples(coverSamples, ["green", "green", "blue", "blue"])
  const containSemantics = checkSamples(containSamples, ["red", "green", "blue", "yellow"])

  const roundedMaskApplied = rgbDistance(cornerWithRadius, background) < 12
    && rgbDistance(cornerWithoutRadius, background) > 32
    && rgbDistance(cornerWithoutRadius, fixtureColors.red) <= 64
    && rgbDistance(centerWithRadius, centerWithoutRadius) < 12
    && cornerMaskDelta.changed > 0
  const objectFitApplied = fillSemantics.every((sample) => sample.matches)
    && coverSemantics.every((sample) => sample.matches)
    && fitDelta.changed > 0
  const containApplied = rgbDistance(containLetterboxTop, background) < 12
    && rgbDistance(containLetterboxBottom, background) < 12
    && containSemantics.every((sample) => sample.matches)
  const supported = roundedMaskApplied && objectFitApplied && containApplied

  const report = {
    result: supported ? "public-api-capability-observed" : "public-api-blocked",
    supported,
    renderer: "real GPU renderToBuffer offscreen adapter",
    source: "public <img> intrinsic with local PNG fixture",
    fixture: {
      path: sourcePath,
      sourceSize,
      target: image,
      columns: ["red", "green", "blue", "yellow"],
    },
    probes: {
      roundedImage: {
        requestedRadius: image.width / 2,
        cornerWithoutRadius,
        cornerWithRadius,
        centerWithoutRadius,
        centerWithRadius,
        cornerMaskDelta,
        roundedMaskApplied,
      },
      objectFit: {
        fillSamples: fillSemantics,
        coverSamples: coverSemantics,
        fillVsCoverDelta: fitDelta,
        objectFitApplied,
      },
      contain: {
        letterboxTop: containLetterboxTop,
        letterboxBottom: containLetterboxBottom,
        samples: containSemantics,
        letterboxingApplied: containApplied,
      },
    },
    publicProps: {
      cornerRadius: "requested on <img>",
      objectFit: ["contain", "fill", "cover"],
    },
    sourceEvidence: [
      "examples/ps5/tests/image-style-probe.tsx (public <img> semantic probe)",
      "packages/engine/src/loop/walk-tree.ts (public <img> prop forwarding)",
      "packages/engine/src/loop/image.ts (fit-mode reference semantics)",
      "native/libvexart/src/composite/mod.rs (native image composition)",
    ],
  }

  console.log(JSON.stringify(report, null, 2))
  if (!supported) process.exitCode = 1
} finally {
  await unlink(sourcePath).catch(() => undefined)
}
