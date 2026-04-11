/**
 * Paint bridge — re-exports color packing for use by the render loop.
 */

/** Pack r,g,b,a into u32 RGBA. */
export function packColor(r: number, g: number, b: number, a: number): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}
