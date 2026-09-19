/**
 * Flexily Node Style
 *
 * Yoga-compatible style getters and setters for flexbox layout.
 */

import * as C from "./constants.js"
import {
  type Style,
  type Value,
  createDefaultStyle,
} from "./types.js"
import {
  setEdgeValue,
  setEdgeBorder,
  getEdgeValue,
  getEdgeBorderValue,
} from "./utils.js"

/**
 * Abstract base class providing style properties, setters, and getters.
 */
export abstract class NodeStyle {
  // Style
  protected _style: Style = createDefaultStyle()

  abstract markDirty(): void

  get style(): Style {
    return this._style
  }

  resetStyle(): void {
    this._style = createDefaultStyle()
  }

  // ============================================================================
  // Width Setters
  // ============================================================================

  /**
   * Set the width to a fixed value in points.
   *
   * @param value - Width in points
   */
  setWidth(value: number): void {
    // NaN means "auto" in Yoga API
    if (Number.isNaN(value)) {
      this._style.width = { value: 0, unit: C.UNIT_AUTO }
    } else {
      this._style.width = { value, unit: C.UNIT_POINT }
    }
    this.markDirty()
  }

  /**
   * Set the width as a percentage of the parent's width.
   *
   * @param value - Width as a percentage (0-100)
   */
  setWidthPercent(value: number): void {
    this._style.width = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the width to auto (determined by layout algorithm).
   */
  setWidthAuto(): void {
    this._style.width = { value: 0, unit: C.UNIT_AUTO }
    this.markDirty()
  }

  /**
   * Set the width to fit-content mode.
   *
   * CSS fit-content = min(max-content, max(min-content, available-width)).
   * For terminals: min(max-content, available-width) since min-content
   * floor is rarely relevant.
   *
   * The layout algorithm measures unconstrained content width (max-content),
   * then clamps to the available width from the parent.
   */
  setWidthFitContent(): void {
    this._style.width = { value: 0, unit: C.UNIT_FIT_CONTENT }
    this.markDirty()
  }

  /**
   * Set the width to snug-content mode.
   *
   * Like fit-content but signals that the consumer wants the tightest
   * possible width (binary-search shrinkwrap). The layout engine treats
   * this identically to fit-content for sizing; the consuming framework
   * (e.g., silvery) can further tighten via its own binary search.
   */
  setWidthSnugContent(): void {
    this._style.width = { value: 0, unit: C.UNIT_SNUG_CONTENT }
    this.markDirty()
  }

  // ============================================================================
  // Height Setters
  // ============================================================================

  /**
   * Set the height to a fixed value in points.
   *
   * @param value - Height in points
   */
  setHeight(value: number): void {
    // NaN means "auto" in Yoga API
    if (Number.isNaN(value)) {
      this._style.height = { value: 0, unit: C.UNIT_AUTO }
    } else {
      this._style.height = { value, unit: C.UNIT_POINT }
    }
    this.markDirty()
  }

  /**
   * Set the height as a percentage of the parent's height.
   *
   * @param value - Height as a percentage (0-100)
   */
  setHeightPercent(value: number): void {
    this._style.height = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the height to auto (determined by layout algorithm).
   */
  setHeightAuto(): void {
    this._style.height = { value: 0, unit: C.UNIT_AUTO }
    this.markDirty()
  }

  /** Set height to the internal fit-content unit used by Grid item sizing. */
  setHeightFitContent(): void {
    this._style.height = { value: 0, unit: C.UNIT_FIT_CONTENT }
    this.markDirty()
  }

  // ============================================================================
  // Min/Max Size Setters
  // ============================================================================

  /**
   * Set the minimum width in points.
   *
   * @param value - Minimum width in points
   */
  setMinWidth(value: number): void {
    this._style.minWidth = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the minimum width as a percentage of the parent's width.
   *
   * @param value - Minimum width as a percentage (0-100)
   */
  setMinWidthPercent(value: number): void {
    this._style.minWidth = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the minimum height in points.
   *
   * @param value - Minimum height in points
   */
  setMinHeight(value: number): void {
    this._style.minHeight = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the minimum height as a percentage of the parent's height.
   *
   * @param value - Minimum height as a percentage (0-100)
   */
  setMinHeightPercent(value: number): void {
    this._style.minHeight = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the maximum width in points.
   *
   * @param value - Maximum width in points
   */
  setMaxWidth(value: number): void {
    this._style.maxWidth = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the maximum width as a percentage of the parent's width.
   *
   * @param value - Maximum width as a percentage (0-100)
   */
  setMaxWidthPercent(value: number): void {
    this._style.maxWidth = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the maximum height in points.
   *
   * @param value - Maximum height in points
   */
  setMaxHeight(value: number): void {
    this._style.maxHeight = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the maximum height as a percentage of the parent's height.
   *
   * @param value - Maximum height as a percentage (0-100)
   */
  setMaxHeightPercent(value: number): void {
    this._style.maxHeight = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the aspect ratio of the node.
   * When set, the node's width/height relationship is constrained.
   * If width is defined, height = width / aspectRatio.
   * If height is defined, width = height * aspectRatio.
   *
   * @param value - Aspect ratio (width/height). Use NaN to unset.
   */
  setAspectRatio(value: number): void {
    this._style.aspectRatio = value
    this.markDirty()
  }

  // ============================================================================
  // Flex Setters
  // ============================================================================

  /**
   * Set the flex grow factor.
   * Determines how much the node will grow relative to siblings when there is extra space.
   *
   * @param value - Flex grow factor (typically 0 or 1+)
   */
  setFlexGrow(value: number): void {
    this._style.flexGrow = value
    this.markDirty()
  }

  /**
   * Set the flex shrink factor.
   * Determines how much the node will shrink relative to siblings when there is insufficient space.
   *
   * @param value - Flex shrink factor (default is 1)
   */
  setFlexShrink(value: number): void {
    this._style.flexShrink = value
    this.markDirty()
  }

  /**
   * Set the flex basis to a fixed value in points.
   * The initial size of the node before flex grow/shrink is applied.
   *
   * @param value - Flex basis in points
   */
  setFlexBasis(value: number): void {
    this._style.flexBasis = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the flex basis as a percentage of the parent's size.
   *
   * @param value - Flex basis as a percentage (0-100)
   */
  setFlexBasisPercent(value: number): void {
    this._style.flexBasis = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the flex basis to auto (based on the node's width/height).
   */
  setFlexBasisAuto(): void {
    this._style.flexBasis = { value: 0, unit: C.UNIT_AUTO }
    this.markDirty()
  }

  /**
   * Set the flex direction (main axis direction).
   *
   * @param direction - FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_ROW_REVERSE, or FLEX_DIRECTION_COLUMN_REVERSE
   */
  setFlexDirection(direction: number): void {
    this._style.flexDirection = direction
    this.markDirty()
  }

  /**
   * Set the flex wrap behavior.
   *
   * @param wrap - WRAP_NO_WRAP, WRAP_WRAP, or WRAP_WRAP_REVERSE
   */
  setFlexWrap(wrap: number): void {
    this._style.flexWrap = wrap
    this.markDirty()
  }

  // ============================================================================
  // Alignment Setters
  // ============================================================================

  /**
   * Set how children are aligned along the cross axis.
   *
   * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
   */
  setAlignItems(align: number): void {
    this._style.alignItems = align
    this.markDirty()
  }

  /**
   * Set how this node is aligned along the parent's cross axis.
   * Overrides the parent's alignItems for this specific child.
   *
   * @param align - ALIGN_AUTO, ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
   */
  setAlignSelf(align: number): void {
    this._style.alignSelf = align
    this.markDirty()
  }

  /**
   * Set how lines are aligned in a multi-line flex container.
   * Only affects containers with wrap enabled and multiple lines.
   *
   * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, ALIGN_SPACE_BETWEEN, or ALIGN_SPACE_AROUND
   */
  setAlignContent(align: number): void {
    this._style.alignContent = align
    this.markDirty()
  }

  /**
   * Set how children are distributed along the main axis.
   *
   * @param justify - JUSTIFY_FLEX_START, JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_AROUND, or JUSTIFY_SPACE_EVENLY
   */
  setJustifyContent(justify: number): void {
    this._style.justifyContent = justify
    this.markDirty()
  }

  // ============================================================================
  // Spacing Setters
  // ============================================================================

  /**
   * Set padding for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Padding in points
   */
  setPadding(edge: number, value: number): void {
    setEdgeValue(this._style.padding, edge, value, C.UNIT_POINT)
    this.markDirty()
  }

  /**
   * Set padding as a percentage of the parent's width.
   * Per CSS spec, percentage padding always resolves against the containing block's width.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Padding as a percentage (0-100)
   */
  setPaddingPercent(edge: number, value: number): void {
    setEdgeValue(this._style.padding, edge, value, C.UNIT_PERCENT)
    this.markDirty()
  }

  /**
   * Set margin for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Margin in points
   */
  setMargin(edge: number, value: number): void {
    setEdgeValue(this._style.margin, edge, value, C.UNIT_POINT)
    this.markDirty()
  }

  /**
   * Set margin as a percentage of the parent's size.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Margin as a percentage (0-100)
   */
  setMarginPercent(edge: number, value: number): void {
    setEdgeValue(this._style.margin, edge, value, C.UNIT_PERCENT)
    this.markDirty()
  }

  /**
   * Set margin to auto (for centering items with margin: auto).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   */
  setMarginAuto(edge: number): void {
    setEdgeValue(this._style.margin, edge, 0, C.UNIT_AUTO)
    this.markDirty()
  }

  /**
   * Set border width for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Border width in points
   */
  setBorder(edge: number, value: number): void {
    setEdgeBorder(this._style.border, edge, value)
    this.markDirty()
  }

  /**
   * Set gap between flex items.
   *
   * @param gutter - GUTTER_COLUMN (horizontal gap), GUTTER_ROW (vertical gap), or GUTTER_ALL (both)
   * @param value - Gap size in points
   */
  setGap(gutter: number, value: number): void {
    if (gutter === C.GUTTER_COLUMN) {
      this._style.gap[0] = value
    } else if (gutter === C.GUTTER_ROW) {
      this._style.gap[1] = value
    } else if (gutter === C.GUTTER_ALL) {
      this._style.gap[0] = value
      this._style.gap[1] = value
    }
    this.markDirty()
  }

  // ============================================================================
  // Position Setters
  // ============================================================================

  /**
   * Set the position type.
   *
   * @param positionType - POSITION_TYPE_STATIC, POSITION_TYPE_RELATIVE, or POSITION_TYPE_ABSOLUTE
   */
  setPositionType(positionType: number): void {
    this._style.positionType = positionType
    this.markDirty()
  }

  /**
   * Set position offset for one or more edges.
   * Only applies when position type is ABSOLUTE or RELATIVE.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Position offset in points
   */
  setPosition(edge: number, value: number): void {
    // NaN means "auto" (unset) in Yoga API
    if (Number.isNaN(value)) {
      setEdgeValue(this._style.position, edge, 0, C.UNIT_UNDEFINED)
    } else {
      setEdgeValue(this._style.position, edge, value, C.UNIT_POINT)
    }
    this.markDirty()
  }

  /**
   * Set position offset as a percentage.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Position offset as a percentage of parent's corresponding dimension
   */
  setPositionPercent(edge: number, value: number): void {
    setEdgeValue(this._style.position, edge, value, C.UNIT_PERCENT)
    this.markDirty()
  }

  // ============================================================================
  // Other Setters
  // ============================================================================

  /**
   * Set the display type.
   *
   * @param display - DISPLAY_FLEX or DISPLAY_NONE
   */
  setDisplay(display: number): void {
    this._style.display = display
    this.markDirty()
  }

  /**
   * Set the overflow behavior.
   *
   * @param overflow - OVERFLOW_VISIBLE, OVERFLOW_HIDDEN, or OVERFLOW_SCROLL
   */
  setOverflow(overflow: number): void {
    this._style.overflow = overflow
    this.markDirty()
  }

  // ============================================================================
  // Style Getters
  // ============================================================================

  /**
   * Get the width style value.
   *
   * @returns Width value with unit (points, percent, or auto)
   */
  getWidth(): Value {
    return this._style.width
  }

  /**
   * Get the height style value.
   *
   * @returns Height value with unit (points, percent, or auto)
   */
  getHeight(): Value {
    return this._style.height
  }

  /**
   * Get the minimum width style value.
   *
   * @returns Minimum width value with unit
   */
  getMinWidth(): Value {
    return this._style.minWidth
  }

  /**
   * Get the minimum height style value.
   *
   * @returns Minimum height value with unit
   */
  getMinHeight(): Value {
    return this._style.minHeight
  }

  /**
   * Get the maximum width style value.
   *
   * @returns Maximum width value with unit
   */
  getMaxWidth(): Value {
    return this._style.maxWidth
  }

  /**
   * Get the maximum height style value.
   *
   * @returns Maximum height value with unit
   */
  getMaxHeight(): Value {
    return this._style.maxHeight
  }

  /**
   * Get the aspect ratio.
   *
   * @returns Aspect ratio value (NaN if not set)
   */
  getAspectRatio(): number {
    return this._style.aspectRatio
  }

  /**
   * Get the flex grow factor.
   *
   * @returns Flex grow value
   */
  getFlexGrow(): number {
    return this._style.flexGrow
  }

  /**
   * Get the flex shrink factor.
   *
   * @returns Flex shrink value
   */
  getFlexShrink(): number {
    return this._style.flexShrink
  }

  /**
   * Get the flex basis style value.
   *
   * @returns Flex basis value with unit
   */
  getFlexBasis(): Value {
    return this._style.flexBasis
  }

  /**
   * Get the flex direction.
   *
   * @returns Flex direction constant
   */
  getFlexDirection(): number {
    return this._style.flexDirection
  }

  /**
   * Get the flex wrap setting.
   *
   * @returns Flex wrap constant
   */
  getFlexWrap(): number {
    return this._style.flexWrap
  }

  /**
   * Get the align items setting.
   *
   * @returns Align items constant
   */
  getAlignItems(): number {
    return this._style.alignItems
  }

  /**
   * Get the align self setting.
   *
   * @returns Align self constant
   */
  getAlignSelf(): number {
    return this._style.alignSelf
  }

  /**
   * Get the align content setting.
   *
   * @returns Align content constant
   */
  getAlignContent(): number {
    return this._style.alignContent
  }

  /**
   * Get the justify content setting.
   *
   * @returns Justify content constant
   */
  getJustifyContent(): number {
    return this._style.justifyContent
  }

  /**
   * Get the padding for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Padding value with unit
   */
  getPadding(edge: number): Value {
    return getEdgeValue(this._style.padding, edge)
  }

  /**
   * Get the margin for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Margin value with unit
   */
  getMargin(edge: number): Value {
    return getEdgeValue(this._style.margin, edge)
  }

  /**
   * Get the border width for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Border width in points
   */
  getBorder(edge: number): number {
    return getEdgeBorderValue(this._style.border, edge)
  }

  /**
   * Get the position offset for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Position value with unit
   */
  getPosition(edge: number): Value {
    return getEdgeValue(this._style.position, edge)
  }

  /**
   * Get the position type.
   *
   * @returns Position type constant
   */
  getPositionType(): number {
    return this._style.positionType
  }

  /**
   * Get the display type.
   *
   * @returns Display constant
   */
  getDisplay(): number {
    return this._style.display
  }

  /**
   * Get the overflow setting.
   *
   * @returns Overflow constant
   */
  getOverflow(): number {
    return this._style.overflow
  }

  /**
   * Get the gap for column or row.
   *
   * @param gutter - GUTTER_COLUMN or GUTTER_ROW
   * @returns Gap size in points
   */
  getGap(gutter: number): number {
    if (gutter === C.GUTTER_COLUMN) {
      return this._style.gap[0]
    } else if (gutter === C.GUTTER_ROW) {
      return this._style.gap[1]
    }
    return this._style.gap[0]
  }

  // ============================================================================
  // Computed Edge Getters
  // ============================================================================

  /**
   * Get the computed padding for a specific edge after layout.
   * Returns the resolved padding value (percentage and logical edges resolved).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Padding value in points
   */
  getComputedPadding(edge: number): number {
    return getEdgeValue(this._style.padding, edge).value
  }

  /**
   * Get the computed margin for a specific edge after layout.
   * Returns the resolved margin value (percentage and logical edges resolved).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Margin value in points
   */
  getComputedMargin(edge: number): number {
    return getEdgeValue(this._style.margin, edge).value
  }

  /**
   * Get the computed border width for a specific edge after layout.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Border width in points
   */
  getComputedBorder(edge: number): number {
    return getEdgeBorderValue(this._style.border, edge)
  }
}
