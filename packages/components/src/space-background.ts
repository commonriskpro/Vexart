import { createScaledImageCache, type CanvasContext, type RawImage } from "@tge/renderer"
import { create, paint, withOpacity, hasNebulaSupport, hasStarfieldSupport, type PixelBuffer } from "@tge/pixel"

type NoiseOptions = {
  scale: number
  octaves: number
  gain: number
  lacunarity: number
  warp: number
  detail?: number
  dust?: number
}

type StarPoint = {
  x: number
  y: number
  radius: number
  color: number
  glow: number
  glowRadius: number
  parallax: number
}

type Sparkle = {
  x: number
  y: number
  radius: number
  arm: number
  color: number
  glow: number
  parallax: number
}

type AtmosphereGlow = {
  x: number
  y: number
  rx: number
  ry: number
  color: number
  intensity: number
  parallax: number
}

export type SpaceBackgroundConfig = {
  width: number
  height: number
  seed: number
  backgroundColor?: number
  nebula?: {
    stops: { color: number; position: number }[]
    noise: NoiseOptions
    renderScale?: number
  }
  starfield?: {
    count?: number
    clusterCount?: number
    clusterStars?: number
    warmColor?: number
    coolColor?: number
    neutralColor?: number
    renderScale?: number
  }
  sparkles?: {
    count?: number
    color?: number
  }
  atmosphere?: {
    count?: number
    colors?: number[]
  }
}

export type SpaceDrawOptions = {
  x: number
  y: number
  w: number
  h: number
  opacity?: number
  nebulaOpacity?: number
  starsOpacity?: number
  sparklesOpacity?: number
  atmosphereOpacity?: number
  showNebula?: boolean
  showStars?: boolean
  showSparkles?: boolean
  showAtmosphere?: boolean
}

export type SpaceBackground = {
  width: number
  height: number
  texture: Uint8Array | null
  starsTexture: Uint8Array | null
  draw: (ctx: CanvasContext, options: SpaceDrawOptions) => void
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let n = Math.imul(t ^ (t >>> 15), 1 | t)
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v: number, lo: number, hi: number) {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function sampleColor(a: number, b: number, t: number) {
  const ar = (a >>> 24) & 0xff
  const ag = (a >>> 16) & 0xff
  const ab = (a >>> 8) & 0xff
  const aa = a & 0xff
  const br = (b >>> 24) & 0xff
  const bg = (b >>> 16) & 0xff
  const bb = (b >>> 8) & 0xff
  const ba = b & 0xff
  return ((Math.round(lerp(ar, br, t)) << 24) |
    (Math.round(lerp(ag, bg, t)) << 16) |
    (Math.round(lerp(ab, bb, t)) << 8) |
    Math.round(lerp(aa, ba, t))) >>> 0
}

function withAlpha(color: number, alpha: number) {
  return ((color & 0xffffff00) | clamp(Math.round(alpha), 0, 255)) >>> 0
}

function unpack(color: number): [number, number, number, number] {
  return [(color >>> 24) & 0xff, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff]
}

function triRand(rand: () => number) {
  return (rand() + rand() + rand()) / 3
}

function pushStar(list: StarPoint[], x: number, y: number, radius: number, color: number, glow: number, glowRadius: number, parallax: number) {
  list.push({ x, y, radius, color, glow, glowRadius, parallax })
}

function createStars(config: SpaceBackgroundConfig, rand: () => number) {
  const stars: StarPoint[] = []
  const width = config.width
  const height = config.height
  const opts = config.starfield ?? {}
  const count = opts.count ?? 240
  const clusterCount = opts.clusterCount ?? 5
  const clusterStars = opts.clusterStars ?? 45
  const warm = opts.warmColor ?? 0xf3d7a1d0
  const cool = opts.coolColor ?? 0xbfd8ffe0
  const neutral = opts.neutralColor ?? 0xffffffd0

  for (let i = 0; i < count; i++) {
    const t = rand()
    const color = t < 0.18 ? warm : t < 0.62 ? neutral : cool
    const bright = rand() > 0.9
    const radius = bright ? lerp(1.1, 2.1, rand()) : lerp(0.25, 1.1, rand())
    const alpha = bright ? lerp(180, 255, rand()) : lerp(18, 110, rand())
    pushStar(stars, rand() * width, rand() * height, radius, withAlpha(color, alpha), withAlpha(color, alpha * 0.45), bright ? radius * 5 : radius * 2.5, lerp(0.92, 1.08, rand()))
  }

  for (let i = 0; i < clusterCount; i++) {
    const cx = lerp(width * 0.15, width * 0.85, rand())
    const cy = lerp(height * 0.15, height * 0.85, rand())
    const spreadX = lerp(width * 0.05, width * 0.12, rand())
    const spreadY = lerp(height * 0.04, height * 0.1, rand())
    const clusterColor = rand() > 0.5 ? cool : warm
    for (let j = 0; j < clusterStars; j++) {
      const x = cx + (triRand(rand) - 0.5) * spreadX * 2.8
      const y = cy + (triRand(rand) - 0.5) * spreadY * 2.8
      if (x < 0 || x > width || y < 0 || y > height) continue
      const bright = rand() > 0.84
      const radius = bright ? lerp(0.9, 1.8, rand()) : lerp(0.2, 0.95, rand())
      const alpha = bright ? lerp(150, 240, rand()) : lerp(15, 90, rand())
      pushStar(stars, x, y, radius, withAlpha(sampleColor(clusterColor, neutral, rand() * 0.4), alpha), withAlpha(clusterColor, alpha * 0.55), bright ? radius * 4.5 : radius * 2.1, lerp(0.88, 1.03, rand()))
    }
  }

  return stars
}

function createSparkles(config: SpaceBackgroundConfig, rand: () => number) {
  const list: Sparkle[] = []
  const count = config.sparkles?.count ?? 3
  const color = config.sparkles?.color ?? 0xfff2d2ff
  for (let i = 0; i < count; i++) {
    const radius = lerp(0.7, 1.8, rand())
    list.push({
      x: lerp(config.width * 0.08, config.width * 0.92, rand()),
      y: lerp(config.height * 0.08, config.height * 0.92, rand()),
      radius,
      arm: lerp(5, 11, rand()),
      color: withAlpha(color, lerp(110, 190, rand())),
      glow: withAlpha(color, lerp(18, 55, rand())),
      parallax: lerp(0.95, 1.1, rand()),
    })
  }
  return list
}

function createAtmosphere(config: SpaceBackgroundConfig, rand: () => number) {
  const list: AtmosphereGlow[] = []
  const colors = config.atmosphere?.colors ?? [0x7db6ff16, 0xf3bf6b14, 0xffffff0a]
  const count = config.atmosphere?.count ?? 4
  for (let i = 0; i < count; i++) {
    const color = colors[Math.floor(rand() * colors.length)]
    list.push({
      x: lerp(config.width * 0.1, config.width * 0.9, rand()),
      y: lerp(config.height * 0.12, config.height * 0.88, rand()),
      rx: lerp(config.width * 0.08, config.width * 0.18, rand()),
      ry: lerp(config.height * 0.08, config.height * 0.18, rand()),
      color,
      intensity: lerp(10, 24, rand()),
      parallax: lerp(0.82, 0.98, rand()),
    })
  }
  return list
}

export function createSpaceBackground(config: SpaceBackgroundConfig): SpaceBackground {
  const rand = mulberry32(config.seed)
  let texture: Uint8Array | null = null
  let starsTexture: Uint8Array | null = null
  const scaledCache = createScaledImageCache()
  const finalCache = new Map<string, RawImage>()
  const nebulaRenderScale = clamp(config.nebula?.renderScale ?? 0.5, 0.1, 1)
  const starsRenderScale = clamp(config.starfield?.renderScale ?? 0.75, 0.1, 1)

  if (config.nebula && hasNebulaSupport()) {
    const tex = create(config.width, config.height)
    const bg = config.backgroundColor ?? 0x040507ff
    paint.fillRect(tex, 0, 0, tex.width, tex.height, (bg >>> 24) & 0xff, (bg >>> 16) & 0xff, (bg >>> 8) & 0xff, bg & 0xff)
    paint.nebula(tex, 0, 0, tex.width, tex.height, config.nebula.stops, {
      seed: config.seed,
      scale: config.nebula.noise.scale,
      octaves: config.nebula.noise.octaves,
      gain: config.nebula.noise.gain,
      lacunarity: config.nebula.noise.lacunarity,
      warp: config.nebula.noise.warp,
      detail: config.nebula.noise.detail,
      dust: config.nebula.noise.dust,
    })
    texture = tex.data
  }

  if (config.starfield && hasStarfieldSupport()) {
    const tex = create(config.width, config.height)
    paint.starfield(tex, 0, 0, tex.width, tex.height, {
      seed: config.seed ^ 0x9e3779b9,
      count: config.starfield.count,
      clusterCount: config.starfield.clusterCount,
      clusterStars: config.starfield.clusterStars,
      warmColor: config.starfield.warmColor,
      neutralColor: config.starfield.neutralColor,
      coolColor: config.starfield.coolColor,
    })
    starsTexture = tex.data
  }

  const stars = createStars(config, rand)
  const sparkles = createSparkles(config, rand)
  const atmosphere = createAtmosphere(config, rand)

  function getCachedDrawTexture(data: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number, renderScale: number, key: string) {
    const src: RawImage = { data, width: srcW, height: srcH }
    const scaledW = Math.max(1, Math.round(dstW * renderScale))
    const scaledH = Math.max(1, Math.round(dstH * renderScale))
    const lowRes = renderScale < 1
      ? scaledCache.get(src, scaledW, scaledH, `${key}:low:${renderScale}`)
      : src
    return scaledCache.get(lowRes, dstW, dstH, `${key}:dst:${renderScale}`)
  }

  function blitImageBuffer(dst: PixelBuffer, image: RawImage, opacity: number) {
    const src: PixelBuffer = { data: image.data, width: image.width, height: image.height, stride: image.width * 4 }
    withOpacity(dst, src, 0, 0, opacity)
  }

  function getComposedBackground(dstW: number, dstH: number, options: SpaceDrawOptions): RawImage {
    const nebulaOpacity = options.nebulaOpacity ?? options.opacity ?? 1
    const starsOpacity = options.starsOpacity ?? options.opacity ?? 1
    const sparklesOpacity = options.sparklesOpacity ?? options.opacity ?? 1
    const atmosphereOpacity = options.atmosphereOpacity ?? options.opacity ?? 1
    const key = [
      dstW,
      dstH,
      options.showNebula !== false ? 1 : 0,
      options.showAtmosphere !== false ? 1 : 0,
      options.showStars !== false ? 1 : 0,
      options.showSparkles !== false ? 1 : 0,
      nebulaOpacity.toFixed(3),
      starsOpacity.toFixed(3),
      sparklesOpacity.toFixed(3),
      atmosphereOpacity.toFixed(3),
      nebulaRenderScale.toFixed(2),
      starsRenderScale.toFixed(2),
    ].join(":")
    const cached = finalCache.get(key)
    if (cached) return cached

    const out = create(dstW, dstH)
    const sx = dstW / config.width
    const sy = dstH / config.height

    if (options.showNebula !== false && texture) {
      const image = getCachedDrawTexture(texture, config.width, config.height, dstW, dstH, nebulaRenderScale, "nebula")
      blitImageBuffer(out, image, nebulaOpacity)
    }

    if (options.showAtmosphere !== false) {
      for (const glow of atmosphere) {
        const color = withAlpha(glow.color, (glow.color & 0xff) * atmosphereOpacity)
        const [r, g, b, a] = unpack(color)
        paint.halo(out, Math.round(glow.x * sx), Math.round(glow.y * sy), Math.max(1, Math.round(glow.rx * sx)), Math.max(1, Math.round(glow.ry * sy)), r, g, b, a, Math.round(glow.intensity))
      }
    }

    if (options.showStars !== false) {
      if (starsTexture) {
        const image = getCachedDrawTexture(starsTexture, config.width, config.height, dstW, dstH, starsRenderScale, "stars")
        blitImageBuffer(out, image, starsOpacity)
      } else {
        for (const star of stars) {
          const color = withAlpha(star.color, (star.color & 0xff) * starsOpacity)
          const glow = withAlpha(star.glow, (star.glow & 0xff) * starsOpacity)
          const px = Math.round(star.x * sx)
          const py = Math.round(star.y * sy)
          if (glow !== 0 && (glow & 0xff) > 0) {
            const [r, g, b, a] = unpack(glow)
            paint.halo(out, px, py, Math.max(1, Math.round(star.glowRadius * sx)), Math.max(1, Math.round(star.glowRadius * sy)), r, g, b, a, 24)
          }
          const [r, g, b, a] = unpack(color)
          const radius = Math.max(1, Math.round(star.radius * ((sx + sy) * 0.5)))
          paint.filledCircle(out, px, py, radius, radius, r, g, b, a)
        }
      }
    }

    if (options.showSparkles !== false) {
      for (const sparkle of sparkles) {
        const color = withAlpha(sparkle.color, (sparkle.color & 0xff) * sparklesOpacity)
        const glow = withAlpha(sparkle.glow, (sparkle.glow & 0xff) * sparklesOpacity)
        const px = Math.round(sparkle.x * sx)
        const py = Math.round(sparkle.y * sy)
        const arm = Math.max(1, Math.round(sparkle.arm * ((sx + sy) * 0.5)))
        const radius = Math.max(1, Math.round(sparkle.radius * ((sx + sy) * 0.5)))
        const [gr, gg, gb, ga] = unpack(glow)
        paint.halo(out, px, py, Math.max(1, Math.round(arm * 0.65)), Math.max(1, Math.round(arm * 0.65)), gr, gg, gb, ga, 26)
        const lineColor = withAlpha(color, (color & 0xff) * 0.22)
        const [lr, lg, lb, la] = unpack(lineColor)
        paint.line(out, px - arm, py, px + arm, py, lr, lg, lb, la, 1)
        paint.line(out, px, py - arm, px, py + arm, lr, lg, lb, la, 1)
        const [r, g, b, a] = unpack(color)
        paint.filledCircle(out, px, py, radius, radius, r, g, b, a)
      }
    }

    const result = { data: out.data, width: out.width, height: out.height }
    finalCache.set(key, result)
    return result
  }

  return {
    width: config.width,
    height: config.height,
    texture,
    starsTexture,
    draw(ctx: CanvasContext, options: SpaceDrawOptions) {
      const x = options.x
      const y = options.y
      const w = options.w
      const h = options.h
      if (w <= 0 || h <= 0) return

      const dstW = Math.max(1, Math.round(w))
      const dstH = Math.max(1, Math.round(h))
      const composed = getComposedBackground(dstW, dstH, options)
      ctx.drawImage(x, y, dstW, dstH, composed.data, composed.width, composed.height, 1)
    },
  }
}
