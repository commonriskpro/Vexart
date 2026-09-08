/**
 * Compact, text-free paint-feature parity scene.
 *
 * Each row is deliberately made of independent, solid-color probes.  The
 * default oracle checks the effect contract, while the exported variant
 * renderer makes it possible to disable one effect family and prove that its
 * pixels actually change.  This is intentionally separate from the larger
 * browser-style effect goldens: it is small enough to run through both native
 * presentation transports on every focused parity pass.
 */

import assert from "node:assert/strict"
import type { JSX } from "solid-js"
import {
  renderToBuffer,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 360
export const height = 340

const ROOT = 0x080b16ff
const LINEAR_FROM = 0x0ea5e9ff
const LINEAR_TO = 0x7c3aedff
const RADIAL_FROM = 0xfde047ff
const RADIAL_TO = 0xef4444ff
const SHADOW_SINGLE = 0x22c55eff
const SHADOW_MULTI = 0xf59e0bff
const GLOW = 0x0f172aff
const GLOW_COLOR = 0x2dd4bfff
const RADIUS_UNIFORM = 0x38bdf8ff
const RADIUS_CORNERS = 0xa78bfaFF
const OPACITY = 0x2563ebff
const TRANSFORM_SCALE = 0x22c55eff
const TRANSFORM_ROTATE = 0xf97316ff
const TRANSFORM_SKEW = 0xec4899ff
const CLIP_FRAME = 0x1e293bff
const CLIP_CHILD = 0xef4444ff

const TILE_WIDTH = 96
const TILE_HEIGHT = 64
const TILE_GAP = 12
const LEFT = 16
const TOP = 16

export type PaintFeatureSceneOptions = {
  disableGradients?: boolean
  disableShadows?: boolean
  disableGlow?: boolean
  disableRadii?: boolean
  disableOpacity?: boolean
  disableTransforms?: boolean
  disableClipping?: boolean
}

function Tile(props: { children?: JSX.Element }) {
  return (
    <box
      width={TILE_WIDTH}
      height={TILE_HEIGHT}
      alignX="center"
      alignY="center"
    >
      {props.children}
    </box>
  )
}

function Row(props: { children?: JSX.Element }) {
  return (
    <box direction="row" gap={TILE_GAP} height={TILE_HEIGHT}>
      {props.children}
    </box>
  )
}

function App(options: PaintFeatureSceneOptions = {}) {
  const gradients = options.disableGradients !== true
  const shadows = options.disableShadows !== true
  const glow = options.disableGlow !== true
  const radii = options.disableRadii !== true
  const opacity = options.disableOpacity !== true
  const transforms = options.disableTransforms !== true
  const clipping = options.disableClipping !== true

  return (
    <box width={width} height={height} backgroundColor={ROOT} padding={16} direction="column" gap={TILE_GAP}>
      <Row>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={LINEAR_FROM}
            gradient={gradients ? { type: "linear", from: LINEAR_FROM, to: LINEAR_TO, angle: 0 } : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={RADIAL_TO}
            gradient={gradients ? { type: "radial", from: RADIAL_FROM, to: RADIAL_TO } : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={SHADOW_SINGLE}
            cornerRadius={8}
            shadow={shadows ? { x: 0, y: 8, blur: 8, color: 0x000000aa } : undefined}
          />
        </Tile>
      </Row>

      <Row>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={SHADOW_MULTI}
            cornerRadius={8}
            shadow={shadows ? [
              { x: 0, y: 5, blur: 5, color: 0x00000099 },
              { x: 0, y: 12, blur: 10, color: 0x7c2d1266 },
            ] : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={GLOW}
            cornerRadius={10}
            glow={glow ? { radius: 10, color: GLOW_COLOR, intensity: 85 } : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={RADIUS_UNIFORM}
            cornerRadius={radii ? 18 : undefined}
          />
        </Tile>
      </Row>

      <Row>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={RADIUS_CORNERS}
            cornerRadii={radii ? { tl: 22, tr: 4, br: 22, bl: 4 } : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={72}
            height={48}
            backgroundColor={OPACITY}
            opacity={opacity ? 0.5 : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={56}
            height={40}
            backgroundColor={TRANSFORM_SCALE}
            cornerRadius={6}
            transform={transforms ? { scale: 1.35 } : undefined}
          />
        </Tile>
      </Row>

      <Row>
        <Tile>
          <box
            width={56}
            height={40}
            backgroundColor={TRANSFORM_ROTATE}
            cornerRadius={6}
            transform={transforms ? { rotate: 20 } : undefined}
          />
        </Tile>
        <Tile>
          <box
            width={56}
            height={40}
            backgroundColor={TRANSFORM_SKEW}
            cornerRadius={6}
            transform={transforms ? { skewX: 18, skewY: -8 } : undefined}
          />
        </Tile>
        <Tile>
          <box width={72} height={48} backgroundColor={CLIP_FRAME} scrollX={clipping ? true : undefined}>
            <box width={112} height={32} backgroundColor={CLIP_CHILD} />
          </box>
        </Tile>
      </Row>
    </box>
  )
}

export function Scene(options: PaintFeatureSceneOptions = {}) {
  return <App {...options} />
}

export function render(options?: RenderToBufferOptions) {
  return renderToBuffer(() => <Scene />, width, height, 2, options)
}

export function renderVariant(sceneOptions: PaintFeatureSceneOptions, options?: RenderToBufferOptions) {
  return renderToBuffer(() => <Scene {...sceneOptions} />, width, height, 2, options)
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

function distance(a: Uint8Array, b: readonly number[]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
}

function tileX(column: number) {
  return LEFT + column * (TILE_WIDTH + TILE_GAP)
}

function tileY(row: number) {
  return TOP + row * (TILE_HEIGHT + TILE_GAP)
}

function verifyGeometry(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)
  assert.deepEqual(pixel(frame, 0, 0), new Uint8Array([8, 11, 22, 255]), "root background changed")
}

function verifyGradients(frame: RenderToBufferResult, disabled: boolean) {
  const linearY = tileY(0) + TILE_HEIGHT / 2
  const linearLeft = pixel(frame, tileX(0) + 14, linearY)
  const linearRight = pixel(frame, tileX(0) + TILE_WIDTH - 14, linearY)
  const radialCenter = pixel(frame, tileX(1) + TILE_WIDTH / 2, tileY(0) + TILE_HEIGHT / 2)
  const radialEdge = pixel(frame, tileX(1) + 14, tileY(0) + TILE_HEIGHT / 2)
  if (disabled) {
    assert.deepEqual(linearLeft, new Uint8Array([14, 165, 233, 255]), "linear gradient disable control did not restore its base color")
    assert.deepEqual(linearRight, new Uint8Array([14, 165, 233, 255]), "linear gradient disable control did not restore its base color")
    assert.deepEqual(radialCenter, new Uint8Array([239, 68, 68, 255]), "radial gradient disable control did not restore its base color")
    assert.deepEqual(radialEdge, new Uint8Array([239, 68, 68, 255]), "radial gradient disable control did not restore its base color")
    return
  }
  assert.ok(distance(linearLeft, [14, 165, 233]) <= 12, "linear gradient start stop missing")
  assert.ok(distance(linearRight, [124, 58, 237]) <= 10, "linear gradient end stop missing")
  assert.ok(distance(radialCenter, [253, 224, 71]) <= 10, "radial gradient center stop missing")
  assert.ok(distance(radialEdge, [239, 68, 68]) <= 16, "radial gradient edge stop missing")
}

function verifyShadows(frame: RenderToBufferResult, disabled: boolean) {
  const singleX = tileX(2) + TILE_WIDTH / 2
  const singleY = tileY(0) + TILE_HEIGHT - 2
  const multiX = tileX(0) + TILE_WIDTH / 2
  const multiY = tileY(1) + TILE_HEIGHT - 2
  const single = pixel(frame, singleX, singleY)
  const multi = pixel(frame, multiX, multiY)
  if (disabled) {
    assert.deepEqual(single, new Uint8Array([8, 11, 22, 255]), "shadow disable control left a single-shadow halo")
    assert.deepEqual(multi, new Uint8Array([8, 11, 22, 255]), "shadow disable control left a multi-shadow halo")
    return
  }
  assert.ok(distance(single, [8, 11, 22]) > 8, "single shadow halo missing")
  assert.ok(distance(multi, [8, 11, 22]) > 8, "multi-shadow halo missing")
}

function verifyGlow(frame: RenderToBufferResult, disabled: boolean) {
  const halo = pixel(frame, tileX(1) + TILE_WIDTH / 2, tileY(1))
  if (disabled) {
    assert.deepEqual(halo, new Uint8Array([8, 11, 22, 255]), "glow disable control left a halo")
    return
  }
  assert.ok(halo[1] > 18 && halo[2] > 25, "glow halo missing")
}

function verifyRadii(frame: RenderToBufferResult, disabled: boolean) {
  const uniformCorner = pixel(frame, tileX(2) + 14, tileY(1) + 8)
  const cornerTile = pixel(frame, tileX(0) + 14, tileY(2) + 8)
  if (disabled) {
    assert.deepEqual(uniformCorner, new Uint8Array([56, 189, 248, 255]), "uniform radius disable control changed its fill")
    assert.deepEqual(cornerTile, new Uint8Array([167, 139, 250, 255]), "per-corner radius disable control changed its fill")
    return
  }
  assert.deepEqual(uniformCorner, new Uint8Array([8, 11, 22, 255]), "uniform corner is not rounded")
  assert.deepEqual(cornerTile, new Uint8Array([8, 11, 22, 255]), "per-corner top-left is not rounded")
  const cornerTopRight = pixel(frame, tileX(0) + TILE_WIDTH - 14, tileY(2) + 8)
  assert.ok(distance(cornerTopRight, [167, 139, 250]) < distance(cornerTopRight, [8, 11, 22]), "per-corner top-right radius is not asymmetric")
}

function verifyOpacity(frame: RenderToBufferResult, disabled: boolean) {
  const sample = pixel(frame, tileX(1) + TILE_WIDTH / 2, tileY(2) + TILE_HEIGHT / 2)
  if (disabled) {
    assert.deepEqual(sample, new Uint8Array([37, 99, 235, 255]), "opacity disable control did not restore opaque fill")
    return
  }
  assert.ok(distance(sample, [22, 55, 128]) <= 4, "opacity was not composited over the root background")
}

function countRegion(frame: RenderToBufferResult, left: number, top: number, right: number, bottom: number, predicate: (pixel: Uint8Array) => boolean) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) if (predicate(pixel(frame, x, y))) count++
  }
  return count
}

function verifyTransforms(frame: RenderToBufferResult, disabled: boolean) {
  const scaleRegion = { left: tileX(2), top: tileY(2), right: tileX(2) + TILE_WIDTH, bottom: tileY(2) + TILE_HEIGHT }
  const rotateRegion = { left: tileX(0), top: tileY(3), right: tileX(0) + TILE_WIDTH, bottom: tileY(3) + TILE_HEIGHT }
  const skewRegion = { left: tileX(1), top: tileY(3), right: tileX(1) + TILE_WIDTH, bottom: tileY(3) + TILE_HEIGHT }
  const colors = [TRANSFORM_SCALE, TRANSFORM_ROTATE, TRANSFORM_SKEW]
  const regions = [scaleRegion, rotateRegion, skewRegion]
  const counts = regions.map((region, index) => countRegion(frame, region.left, region.top, region.right, region.bottom, (sample) => distance(sample, [colors[index] >>> 24, (colors[index] >>> 16) & 0xff, (colors[index] >>> 8) & 0xff]) < 8))
  // These points lie just outside the untransformed 56x40 rectangles but
  // inside their rotated/skewed paint bounds. They make the rotate/skew
  // checks non-vacuous even if coverage counts happen to look plausible.
  const rotateProbe = pixel(frame, tileX(0) + 48 - 20, tileY(3) + 32 - 24)
  const skewProbe = pixel(frame, tileX(1) + 48 + 20, tileY(3) + 32 - 21)
  if (disabled) {
    assert.ok(counts.every((count) => count >= 2_200 && count <= 2_240), "transform disable control did not restore untransformed geometry")
    assert.deepEqual(rotateProbe, new Uint8Array([8, 11, 22, 255]), "transform disable control exposed a rotate-only pixel")
    assert.deepEqual(skewProbe, new Uint8Array([8, 11, 22, 255]), "transform disable control exposed a skew-only pixel")
    return
  }
  assert.ok(counts[0] > 2_240, "scale transform did not expand the paint bounds")
  assert.ok(counts[1] > 1_500 && counts[1] < 2_240, "rotate transform did not change paint coverage")
  assert.ok(counts[2] > 1_500 && counts[2] < 2_240, "skew transform did not change paint coverage")
  assert.ok(distance(rotateProbe, [249, 115, 22]) <= 4, "rotate transform did not expand its top-left paint bound")
  assert.ok(distance(skewProbe, [236, 72, 153]) <= 4, "skew transform did not expand its top-right paint bound")
}

function verifyClipping(frame: RenderToBufferResult, disabled: boolean) {
  const clipX = tileX(2)
  const clipY = tileY(3)
  const inside = pixel(frame, clipX + 48, clipY + 32)
  const outside = pixel(frame, clipX + 88, clipY + 32)
  assert.deepEqual(inside, new Uint8Array([239, 68, 68, 255]), "clipping probe child fill missing")
  if (disabled) {
    assert.deepEqual(outside, new Uint8Array([239, 68, 68, 255]), "clipping disable control did not expose overflow")
    return
  }
  assert.deepEqual(outside, new Uint8Array([8, 11, 22, 255]), "scroll clipping did not stop overflow")
}

export function verifyVariant(frame: RenderToBufferResult, options: PaintFeatureSceneOptions = {}) {
  verifyGeometry(frame)
  verifyGradients(frame, options.disableGradients === true)
  verifyShadows(frame, options.disableShadows === true)
  verifyGlow(frame, options.disableGlow === true)
  verifyRadii(frame, options.disableRadii === true)
  verifyOpacity(frame, options.disableOpacity === true)
  verifyTransforms(frame, options.disableTransforms === true)
  verifyClipping(frame, options.disableClipping === true)
}

export function verify(frame: RenderToBufferResult) {
  verifyVariant(frame)
}
