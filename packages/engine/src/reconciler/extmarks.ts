/**
 * Extmarks system — inline text decorations for textarea/editors.
 *
 * Extmarks are positioned marks that attach to character ranges in a text buffer.
 * They survive edits (shift with insertions/deletions) and can represent:
 *   - Syntax highlighting ranges (via styleId)
 *   - Autocomplete ghost text (via ghost flag)
 *   - Search match highlights
 *   - Diagnostic underlines
 *   - Inline annotations
 *
 * Architecture:
 *   - ExtmarkManager manages a flat list of extmarks
 *   - Each extmark has a type (registered via registerType)
 *   - Types have a numeric ID for fast filtering
 *   - Extmarks are queried by type or by range
 *
 * Usage:
 *   const mgr = new ExtmarkManager()
 *   const searchType = mgr.registerType("search")
 *   const ghostType = mgr.registerType("ghost")
 *
 *   mgr.create({ start: 10, end: 15, typeId: searchType, styleId: style.getStyleId("search.match") })
 *   mgr.create({ start: 42, end: 42, typeId: ghostType, ghost: true, data: { text: "suggestion" } })
 *
 *   const searchMarks = mgr.getAllForTypeId(searchType)
 *   mgr.clear()
 */

/** A single extmark — a positioned decoration in a text buffer */
/** @public */
export type Extmark = {
  id: number
  /** Start character offset (inclusive) */
  start: number
  /** End character offset (exclusive). For ghost text, start === end. */
  end: number
  /** Type ID (from registerType) */
  typeId: number
  /** Style ID (from SyntaxStyle.getStyleId) for visual rendering */
  styleId?: number
  /** Foreground color override (packed RGBA) */
  fg?: number
  /** Background color override (packed RGBA) */
  bg?: number
  /** Priority for layering — higher wins on overlap */
  priority?: number
  /** Ghost text flag — renders as semi-transparent text after the position */
  ghost?: boolean
  /** Arbitrary data attached to this extmark */
  data?: Record<string, unknown>
}

/** Options for creating an extmark */
/** @public */
export type CreateExtmarkOptions = Omit<Extmark, "id">

/**
 * ExtmarkManager — manages extmarks for a text buffer.
 *
 * Thread-safe for single-threaded use (no locks needed).
 * Extmarks are stored in a flat array sorted by start position.
 */
/** @public */
export class ExtmarkManager {
  private extmarks: Extmark[] = []
  private types = new Map<string, number>()
  private nextId = 1
  private nextTypeId = 1

  /** Register a named extmark type. Returns a numeric type ID. */
  registerType(name: string): number {
    const existing = this.types.get(name)
    if (existing !== undefined) return existing
    const id = this.nextTypeId++
    this.types.set(name, id)
    return id
  }

  /** Get the type ID for a registered type name. Returns 0 if not found. */
  getTypeId(name: string): number {
    return this.types.get(name) ?? 0
  }

  /** Create a new extmark. Returns its unique ID. */
  create(opts: CreateExtmarkOptions): number {
    const id = this.nextId++
    const extmark: Extmark = { id, ...opts }

    // Insert sorted by start position
    let insertIdx = this.extmarks.length
    for (let i = 0; i < this.extmarks.length; i++) {
      if (this.extmarks[i].start > extmark.start) {
        insertIdx = i
        break
      }
    }
    this.extmarks.splice(insertIdx, 0, extmark)

    return id
  }

  /** Remove an extmark by ID. */
  remove(id: number): boolean {
    const idx = this.extmarks.findIndex((e) => e.id === id)
    if (idx < 0) return false
    this.extmarks.splice(idx, 1)
    return true
  }

  /** Get an extmark by ID. */
  get(id: number): Extmark | undefined {
    return this.extmarks.find((e) => e.id === id)
  }

  /** Get all extmarks for a given type ID. */
  getAllForTypeId(typeId: number): Extmark[] {
    return this.extmarks.filter((e) => e.typeId === typeId)
  }

  /** Get all extmarks that overlap a character range [start, end). */
  getInRange(start: number, end: number): Extmark[] {
    return this.extmarks.filter((e) => e.start < end && e.end > start)
  }

  /** Get all extmarks on a specific line (given line start/end offsets). */
  getForLine(lineStart: number, lineEnd: number): Extmark[] {
    return this.getInRange(lineStart, lineEnd)
  }

  /** Get all ghost text extmarks. */
  getGhostTexts(): Extmark[] {
    return this.extmarks.filter((e) => e.ghost === true)
  }

  /** Clear all extmarks. */
  clear(): void {
    this.extmarks.length = 0
  }

  /** Clear all extmarks of a specific type. */
  clearType(typeId: number): void {
    this.extmarks = this.extmarks.filter((e) => e.typeId !== typeId)
  }

  /** Get the total number of extmarks. */
  count(): number {
    return this.extmarks.length
  }

  /**
   * Adjust extmark positions after a text edit.
   *
   * @param editStart - Character offset where the edit starts.
   * @param oldEnd - Character offset where the old text ended.
   * @param newEnd - Character offset where the new text ends.
   */
  adjustForEdit(editStart: number, oldEnd: number, newEnd: number): void {
    const delta = newEnd - oldEnd

    for (const extmark of this.extmarks) {
      if (extmark.start >= oldEnd) {
        // Extmark is entirely after the edit — shift
        extmark.start += delta
        extmark.end += delta
      } else if (extmark.start >= editStart) {
        // Extmark starts inside the edit region
        if (extmark.end <= oldEnd) {
          // Entirely inside — collapse to edit point
          extmark.start = editStart
          extmark.end = editStart
        } else {
          // Starts inside, ends after — adjust
          extmark.start = editStart
          extmark.end += delta
        }
      } else if (extmark.end > editStart) {
        // Extmark starts before edit but extends into it
        if (extmark.end <= oldEnd) {
          // Ends inside the edit — truncate to edit start
          extmark.end = editStart
        } else {
          // Spans across the edit — adjust end
          extmark.end += delta
        }
      }
      // Extmark entirely before edit — no change
    }

    // Remove collapsed (zero-length non-ghost) extmarks
    this.extmarks = this.extmarks.filter((e) => e.ghost || e.start < e.end)
  }
}
