import type { PixelBuffer } from "@tge/pixel"
import { paint } from "@tge/pixel"
import { getCanvasPainterBackend } from "../../core/src/canvas-backend"
import type { CanvasContext } from "../../core/src/canvas"

function unpack(c: number): [number, number, number, number] {
  return [(c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff]
}

/**
 * Flush buffered imperative canvas commands into a raster surface.
 * This is transition-only staging, not the canonical renderer architecture.
 */
export function paintCanvasCommands(
  buf: PixelBuffer,
  ctx: CanvasContext,
  canvasW: number,
  canvasH: number,
) {
  const backend = getCanvasPainterBackend()
  if (backend) {
    backend.paint(buf, ctx, canvasW, canvasH)
    return
  }

  paintCanvasCommandsCPU(buf, ctx, canvasW, canvasH)
}

/**
 * Force CPU rasterization into a staging surface.
 *
 * This must NOT bounce through the active GPU canvas backend, otherwise the
 * staging path becomes GPU -> CPU readback -> GPU upload again.
 */
export function paintCanvasCommandsToRasterSurface(
  buf: PixelBuffer,
  ctx: CanvasContext,
  canvasW: number,
  canvasH: number,
) {
  paintCanvasCommandsCPU(buf, ctx, canvasW, canvasH)
}

export function paintCanvasCommandsCPU(
  buf: PixelBuffer,
  ctx: CanvasContext,
  canvasW: number,
  canvasH: number,
) {
  const vp = ctx.viewport
  const z = vp.zoom
  const ox = vp.x
  const oy = vp.y

  const tx = (wx: number) => Math.round((wx - ox) * z)
  const ty = (wy: number) => Math.round((wy - oy) * z)
  const ts = (ws: number) => Math.max(1, Math.round(ws * z))

  for (const cmd of ctx._commands) {
    switch (cmd.kind) {
      case "line": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.line(buf, tx(cmd.x0), ty(cmd.y0), tx(cmd.x1), ty(cmd.y1), r, g, b, a, ts(cmd.width))
        break
      }

      case "bezier": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.bezier(buf,
          tx(cmd.x0), ty(cmd.y0),
          tx(cmd.cx), ty(cmd.cy),
          tx(cmd.x1), ty(cmd.y1),
          r, g, b, a, ts(cmd.width))
        break
      }

      case "circle": {
        const sx = tx(cmd.cx)
        const sy = ty(cmd.cy)
        const srx = ts(cmd.rx)
        const sry = ts(cmd.ry)

        if (cmd.fill !== undefined) {
          const [r, g, b, a] = unpack(cmd.fill)
          paint.filledCircle(buf, sx, sy, srx, sry, r, g, b, a)
        }
        if (cmd.stroke !== undefined) {
          const [r, g, b, a] = unpack(cmd.stroke)
          paint.strokedCircle(buf, sx, sy, srx, sry, r, g, b, a, ts(cmd.strokeWidth))
        }
        break
      }

      case "rect": {
        const sx = tx(cmd.x)
        const sy = ty(cmd.y)
        const sw = ts(cmd.w)
        const sh = ts(cmd.h)
        const sr = ts(cmd.radius)

        if (cmd.fill !== undefined) {
          const [r, g, b, a] = unpack(cmd.fill)
          if (sr > 0) {
            paint.roundedRect(buf, sx, sy, sw, sh, r, g, b, a, sr)
          } else {
            paint.fillRect(buf, sx, sy, sw, sh, r, g, b, a)
          }
        }
        if (cmd.stroke !== undefined) {
          const [r, g, b, a] = unpack(cmd.stroke)
          paint.strokeRect(buf, sx, sy, sw, sh, r, g, b, a, sr, ts(cmd.strokeWidth))
        }
        break
      }

      case "polygon": {
        const sx = tx(cmd.cx)
        const sy = ty(cmd.cy)
        const sr = ts(cmd.radius)
        const rot = Math.round(cmd.rotation)

        if (cmd.fill !== undefined) {
          const [r, g, b, a] = unpack(cmd.fill)
          paint.filledPolygon(buf, sx, sy, sr, cmd.sides, rot, r, g, b, a)
        }
        if (cmd.stroke !== undefined) {
          const [r, g, b, a] = unpack(cmd.stroke)
          paint.strokedPolygon(buf, sx, sy, sr, cmd.sides, rot, r, g, b, a, ts(cmd.strokeWidth))
        }
        break
      }

      case "text": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.drawText(buf, tx(cmd.x), ty(cmd.y), cmd.text, r, g, b, a)
        break
      }

      case "glow": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.halo(buf, tx(cmd.cx), ty(cmd.cy), ts(cmd.rx), ts(cmd.ry), r, g, b, a, cmd.intensity)
        break
      }

      case "image": {
        const dx = tx(cmd.x)
        const dy = ty(cmd.y)
        const dw = ts(cmd.w)
        const dh = ts(cmd.h)
        const src = cmd.data
        const sw = cmd.imgW
        const sh = cmd.imgH
        const oa = Math.round(cmd.opacity * 255)

        if (sw === dw && sh === dh) {
          const srcBuf = { data: src, width: sw, height: sh, stride: sw * 4 }

          if (cmd.opaque && oa === 255 && dx >= 0 && dy >= 0 && dx + dw <= buf.width && dy + dh <= buf.height) {
            for (let py = 0; py < dh; py++) {
              const srcRow = py * sw * 4
              const dstRow = (dy + py) * buf.width * 4 + dx * 4
              buf.data.set(src.subarray(srcRow, srcRow + sw * 4), dstRow)
            }
            break
          }

          if (paint.blitRGBA(buf, srcBuf, dx, dy, cmd.opacity)) break
        }

        for (let py = 0; py < dh; py++) {
          const destY = dy + py
          if (destY < 0 || destY >= buf.height) continue
          const srcY = Math.min(Math.floor(py * sh / dh), sh - 1)
          for (let px = 0; px < dw; px++) {
            const destX = dx + px
            if (destX < 0 || destX >= buf.width) continue
            const srcX = Math.min(Math.floor(px * sw / dw), sw - 1)
            const si = (srcY * sw + srcX) * 4
            const di = (destY * buf.width + destX) * 4
            const sa = Math.round((src[si + 3] * oa) / 255)
            if (sa === 0) continue
            if (sa === 255) {
              buf.data[di] = src[si]
              buf.data[di + 1] = src[si + 1]
              buf.data[di + 2] = src[si + 2]
              buf.data[di + 3] = 255
            } else {
              const inv = 255 - sa
              const da = buf.data[di + 3]
              const outA = sa + Math.round(da * inv / 255)
              if (outA === 0) continue
              buf.data[di] = Math.round((src[si] * sa + buf.data[di] * da * inv / 255) / outA)
              buf.data[di + 1] = Math.round((src[si + 1] * sa + buf.data[di + 1] * da * inv / 255) / outA)
              buf.data[di + 2] = Math.round((src[si + 2] * sa + buf.data[di + 2] * da * inv / 255) / outA)
              buf.data[di + 3] = Math.min(255, outA)
            }
          }
        }
        break
      }

      case "radialGradient": {
        const [r0, g0, b0, a0] = unpack(cmd.from)
        const [r1, g1, b1, a1] = unpack(cmd.to)
        paint.radialGradient(buf, tx(cmd.cx), ty(cmd.cy), ts(cmd.radius), r0, g0, b0, a0, r1, g1, b1, a1)
        break
      }

      case "linearGradient": {
        const [r0, g0, b0, a0] = unpack(cmd.from)
        const [r1, g1, b1, a1] = unpack(cmd.to)
        paint.linearGradient(buf, tx(cmd.x), ty(cmd.y), ts(cmd.w), ts(cmd.h), r0, g0, b0, a0, r1, g1, b1, a1, Math.round(cmd.angle))
        break
      }

      case "nebula": {
        paint.nebula(buf, tx(cmd.x), ty(cmd.y), ts(cmd.w), ts(cmd.h), cmd.stops, {
          seed: cmd.seed,
          scale: ts(cmd.scale),
          octaves: cmd.octaves,
          gain: cmd.gain,
          lacunarity: cmd.lacunarity,
          warp: cmd.warp,
          detail: cmd.detail,
          dust: cmd.dust,
        })
        break
      }

      case "starfield": {
        paint.starfield(buf, tx(cmd.x), ty(cmd.y), ts(cmd.w), ts(cmd.h), {
          seed: cmd.seed,
          count: cmd.count,
          clusterCount: cmd.clusterCount,
          clusterStars: cmd.clusterStars,
          warmColor: cmd.warmColor,
          neutralColor: cmd.neutralColor,
          coolColor: cmd.coolColor,
        })
        break
      }
    }
  }
}
