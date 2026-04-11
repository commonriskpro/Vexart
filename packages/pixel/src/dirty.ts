/**
 * Dirty rect tracking for the paint system.
 *
 * Maintains a list of rectangular regions that need repainting.
 * Merges overlapping rects to reduce redundant work.
 */

export type DirtyRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DirtyTracker = ReturnType<typeof createTracker>

function overlaps(a: DirtyRect, b: DirtyRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function merge(target: DirtyRect, source: DirtyRect) {
  const x = Math.min(target.x, source.x)
  const y = Math.min(target.y, source.y)
  target.width = Math.max(target.x + target.width, source.x + source.width) - x
  target.height = Math.max(target.y + target.height, source.y + source.height) - y
  target.x = x
  target.y = y
}

function compact(rects: DirtyRect[]) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i], rects[j])) {
        merge(rects[i], rects[j])
        rects.splice(j, 1)
        j--
      }
    }
  }
}

export function createTracker() {
  const rects: DirtyRect[] = []

  return {
    /** Add a dirty rect. Merges with existing overlapping rects. */
    add(x: number, y: number, w: number, h: number) {
      if (w <= 0 || h <= 0) return
      const rect: DirtyRect = { x, y, width: w, height: h }
      for (let i = rects.length - 1; i >= 0; i--) {
        if (overlaps(rects[i], rect)) {
          merge(rects[i], rect)
          compact(rects)
          return
        }
      }
      rects.push(rect)
    },

    /** Mark the entire viewport as dirty. */
    full(w: number, h: number) {
      rects.length = 0
      rects.push({ x: 0, y: 0, width: w, height: h })
    },

    /** Get current dirty rects and clear the list. */
    flush(): DirtyRect[] {
      const result = rects.slice()
      rects.length = 0
      return result
    },

    /** Check if anything is dirty. */
    dirty() {
      return rects.length > 0
    },

    /** Number of dirty rects. */
    count() {
      return rects.length
    },
  }
}
