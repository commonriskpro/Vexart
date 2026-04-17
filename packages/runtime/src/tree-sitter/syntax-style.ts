/**
 * SyntaxStyle — maps tree-sitter capture names to colors.
 *
 * Follows opentui's pattern:
 *   - Theme rules: { scope: ["keyword", "keyword.function"], style: { foreground: "#c678dd" } }
 *   - Dot-notation fallback: "function.method" → "function" if no exact match
 *   - getStyleId(name) returns a numeric ID for highlight integration
 *
 * Unlike opentui, this is TS-only (no Zig FFI) because TGE renders
 * per-token <text> elements with individual colors — no native text buffer.
 *
 * Usage:
 *   const style = SyntaxStyle.fromTheme([
 *     { scope: ["keyword"], style: { foreground: "#c678dd" } },
 *     { scope: ["string"], style: { foreground: "#98c379" } },
 *   ])
 *
 *   style.colorFor("keyword")  // → 0xc678ddff
 *   style.colorFor("keyword.function")  // → 0xc678ddff (dot-fallback)
 */

import { parseColor } from "../../../engine/src/ffi/node"

// ── Types ──

export type StyleDefinition = {
  fg?: number  // packed RGBA
  bg?: number  // packed RGBA
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export type ThemeTokenStyle = {
  scope: string[]
  style: {
    foreground?: string | number
    background?: string | number
    bold?: boolean
    italic?: boolean
    underline?: boolean
  }
}

/** Simple theme rules: scope name → foreground color */
export type SimpleThemeRules = Record<string, string | number>

// ── SyntaxStyle class ──

export class SyntaxStyle {
  private styles = new Map<string, StyleDefinition>()
  private idMap = new Map<string, number>()
  private nextId = 1
  private defaultColor: number

  private constructor(defaultColor: number) {
    this.defaultColor = defaultColor
  }

  /**
   * Create from structured theme rules (opentui-compatible).
   *
   *   SyntaxStyle.fromTheme([
   *     { scope: ["keyword", "keyword.function"], style: { foreground: "#c678dd" } },
   *   ])
   */
  static fromTheme(rules: ThemeTokenStyle[], defaultColor: string | number = "#e0e0e0"): SyntaxStyle {
    const style = new SyntaxStyle(parseColor(defaultColor))
    for (const rule of rules) {
      const def: StyleDefinition = {}
      if (rule.style.foreground !== undefined) def.fg = parseColor(rule.style.foreground)
      if (rule.style.background !== undefined) def.bg = parseColor(rule.style.background)
      if (rule.style.bold !== undefined) def.bold = rule.style.bold
      if (rule.style.italic !== undefined) def.italic = rule.style.italic
      if (rule.style.underline !== undefined) def.underline = rule.style.underline
      for (const scope of rule.scope) {
        style.registerStyle(scope, def)
      }
    }
    return style
  }

  /**
   * Create from simple rules (shorthand — scope: color).
   *
   *   SyntaxStyle.fromSimple({ keyword: "#c678dd", string: "#98c379" })
   */
  static fromSimple(rules: SimpleThemeRules, defaultColor: string | number = "#e0e0e0"): SyntaxStyle {
    const style = new SyntaxStyle(parseColor(defaultColor))
    for (const [scope, color] of Object.entries(rules)) {
      style.registerStyle(scope, { fg: parseColor(color) })
    }
    return style
  }

  /** Register a named style. */
  registerStyle(name: string, def: StyleDefinition): number {
    this.styles.set(name, def)
    if (!this.idMap.has(name)) {
      this.idMap.set(name, this.nextId++)
    }
    return this.idMap.get(name)!
  }

  /**
   * Get the style definition for a scope name.
   *
   * Supports dot-notation fallback:
   *   "function.method" → looks for "function.method", then "function"
   */
  getStyle(name: string): StyleDefinition | undefined {
    const exact = this.styles.get(name)
    if (exact) return exact

    // Dot-notation fallback
    const parts = name.split(".")
    while (parts.length > 1) {
      parts.pop()
      const parent = parts.join(".")
      const found = this.styles.get(parent)
      if (found) return found
    }

    return undefined
  }

  /** Get the foreground color for a scope name. Falls back to default. */
  colorFor(name: string): number {
    const style = this.getStyle(name)
    return style?.fg ?? this.defaultColor
  }

  /** Get the numeric ID for a scope name (for extmark integration). */
  getStyleId(name: string): number {
    return this.idMap.get(name) ?? 0
  }

  /** Get the default (fallback) color. */
  getDefaultColor(): number {
    return this.defaultColor
  }

  /** Get all registered styles. */
  getAllStyles(): Map<string, StyleDefinition> {
    return new Map(this.styles)
  }
}

// ── Built-in themes ──

/** One Dark-inspired theme */
export const ONE_DARK: ThemeTokenStyle[] = [
  { scope: ["keyword", "keyword.function", "keyword.operator", "keyword.return"], style: { foreground: "#c678dd" } },
  { scope: ["string", "string.special"], style: { foreground: "#98c379" } },
  { scope: ["comment", "comment.line", "comment.block"], style: { foreground: "#5c6370", italic: true } },
  { scope: ["number", "constant.numeric", "float"], style: { foreground: "#d19a66" } },
  { scope: ["function", "function.call", "function.method", "method"], style: { foreground: "#61afef" } },
  { scope: ["variable", "variable.parameter", "variable.builtin"], style: { foreground: "#e06c75" } },
  { scope: ["type", "type.builtin", "type.qualifier"], style: { foreground: "#e5c07b" } },
  { scope: ["property", "property.definition", "variable.member"], style: { foreground: "#e06c75" } },
  { scope: ["operator"], style: { foreground: "#56b6c2" } },
  { scope: ["punctuation", "punctuation.bracket", "punctuation.delimiter"], style: { foreground: "#abb2bf" } },
  { scope: ["constant", "constant.builtin", "boolean"], style: { foreground: "#d19a66" } },
  { scope: ["tag", "tag.builtin"], style: { foreground: "#e06c75" } },
  { scope: ["attribute"], style: { foreground: "#d19a66" } },
  { scope: ["constructor"], style: { foreground: "#e5c07b" } },
  { scope: ["module", "namespace"], style: { foreground: "#e06c75" } },
  { scope: ["label"], style: { foreground: "#e06c75" } },
]

/** Kanagawa-inspired theme matching Gentleman.Dots aesthetics */
export const KANAGAWA: ThemeTokenStyle[] = [
  { scope: ["keyword", "keyword.function", "keyword.operator", "keyword.return"], style: { foreground: "#957fb8" } },
  { scope: ["string", "string.special"], style: { foreground: "#98bb6c" } },
  { scope: ["comment", "comment.line", "comment.block"], style: { foreground: "#727169", italic: true } },
  { scope: ["number", "constant.numeric", "float"], style: { foreground: "#d27e99" } },
  { scope: ["function", "function.call", "function.method", "method"], style: { foreground: "#7e9cd8" } },
  { scope: ["variable", "variable.parameter", "variable.builtin"], style: { foreground: "#c8c093" } },
  { scope: ["type", "type.builtin", "type.qualifier"], style: { foreground: "#7aa89f" } },
  { scope: ["property", "property.definition", "variable.member"], style: { foreground: "#e6c384" } },
  { scope: ["operator"], style: { foreground: "#c0a36e" } },
  { scope: ["punctuation", "punctuation.bracket", "punctuation.delimiter"], style: { foreground: "#9cabca" } },
  { scope: ["constant", "constant.builtin", "boolean"], style: { foreground: "#ffa066" } },
  { scope: ["tag", "tag.builtin"], style: { foreground: "#e6c384" } },
  { scope: ["attribute"], style: { foreground: "#d27e99" } },
  { scope: ["constructor"], style: { foreground: "#7aa89f" } },
  { scope: ["module", "namespace"], style: { foreground: "#7e9cd8" } },
  { scope: ["label"], style: { foreground: "#e6c384" } },
]
