/**
 * Flexily Node Style
 *
 * Yoga-compatible style getters and setters for flexbox layout.
 */
import { type Style, type Value } from "./types.js";
/**
 * Abstract base class providing style properties, setters, and getters.
 */
export declare abstract class NodeStyle {
    protected _style: Style;
    abstract markDirty(): void;
    get style(): Style;
    resetStyle(): void;
    /**
     * Set the width to a fixed value in points.
     *
     * @param value - Width in points
     */
    setWidth(value: number): void;
    /**
     * Set the width as a percentage of the parent's width.
     *
     * @param value - Width as a percentage (0-100)
     */
    setWidthPercent(value: number): void;
    /**
     * Set the width to auto (determined by layout algorithm).
     */
    setWidthAuto(): void;
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
    setWidthFitContent(): void;
    /**
     * Set the width to snug-content mode.
     *
     * Like fit-content but signals that the consumer wants the tightest
     * possible width (binary-search shrinkwrap). The layout engine treats
     * this identically to fit-content for sizing; the consuming framework
     * (e.g., silvery) can further tighten via its own binary search.
     */
    setWidthSnugContent(): void;
    /**
     * Set the height to a fixed value in points.
     *
     * @param value - Height in points
     */
    setHeight(value: number): void;
    /**
     * Set the height as a percentage of the parent's height.
     *
     * @param value - Height as a percentage (0-100)
     */
    setHeightPercent(value: number): void;
    /**
     * Set the height to auto (determined by layout algorithm).
     */
    setHeightAuto(): void;
    /** Set height to the internal fit-content unit used by Grid item sizing. */
    setHeightFitContent(): void;
    /**
     * Set the minimum width in points.
     *
     * @param value - Minimum width in points
     */
    setMinWidth(value: number): void;
    /**
     * Set the minimum width as a percentage of the parent's width.
     *
     * @param value - Minimum width as a percentage (0-100)
     */
    setMinWidthPercent(value: number): void;
    /**
     * Set the minimum height in points.
     *
     * @param value - Minimum height in points
     */
    setMinHeight(value: number): void;
    /**
     * Set the minimum height as a percentage of the parent's height.
     *
     * @param value - Minimum height as a percentage (0-100)
     */
    setMinHeightPercent(value: number): void;
    /**
     * Set the maximum width in points.
     *
     * @param value - Maximum width in points
     */
    setMaxWidth(value: number): void;
    /**
     * Set the maximum width as a percentage of the parent's width.
     *
     * @param value - Maximum width as a percentage (0-100)
     */
    setMaxWidthPercent(value: number): void;
    /**
     * Set the maximum height in points.
     *
     * @param value - Maximum height in points
     */
    setMaxHeight(value: number): void;
    /**
     * Set the maximum height as a percentage of the parent's height.
     *
     * @param value - Maximum height as a percentage (0-100)
     */
    setMaxHeightPercent(value: number): void;
    /**
     * Set the aspect ratio of the node.
     * When set, the node's width/height relationship is constrained.
     * If width is defined, height = width / aspectRatio.
     * If height is defined, width = height * aspectRatio.
     *
     * @param value - Aspect ratio (width/height). Use NaN to unset.
     */
    setAspectRatio(value: number): void;
    /**
     * Set the flex grow factor.
     * Determines how much the node will grow relative to siblings when there is extra space.
     *
     * @param value - Flex grow factor (typically 0 or 1+)
     */
    setFlexGrow(value: number): void;
    /**
     * Set the flex shrink factor.
     * Determines how much the node will shrink relative to siblings when there is insufficient space.
     *
     * @param value - Flex shrink factor (default is 1)
     */
    setFlexShrink(value: number): void;
    /**
     * Set the flex basis to a fixed value in points.
     * The initial size of the node before flex grow/shrink is applied.
     *
     * @param value - Flex basis in points
     */
    setFlexBasis(value: number): void;
    /**
     * Set the flex basis as a percentage of the parent's size.
     *
     * @param value - Flex basis as a percentage (0-100)
     */
    setFlexBasisPercent(value: number): void;
    /**
     * Set the flex basis to auto (based on the node's width/height).
     */
    setFlexBasisAuto(): void;
    /**
     * Set the flex direction (main axis direction).
     *
     * @param direction - FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_ROW_REVERSE, or FLEX_DIRECTION_COLUMN_REVERSE
     */
    setFlexDirection(direction: number): void;
    /**
     * Set the flex wrap behavior.
     *
     * @param wrap - WRAP_NO_WRAP, WRAP_WRAP, or WRAP_WRAP_REVERSE
     */
    setFlexWrap(wrap: number): void;
    /**
     * Set how children are aligned along the cross axis.
     *
     * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
     */
    setAlignItems(align: number): void;
    /**
     * Set how this node is aligned along the parent's cross axis.
     * Overrides the parent's alignItems for this specific child.
     *
     * @param align - ALIGN_AUTO, ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
     */
    setAlignSelf(align: number): void;
    /**
     * Set how lines are aligned in a multi-line flex container.
     * Only affects containers with wrap enabled and multiple lines.
     *
     * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, ALIGN_SPACE_BETWEEN, or ALIGN_SPACE_AROUND
     */
    setAlignContent(align: number): void;
    /**
     * Set how children are distributed along the main axis.
     *
     * @param justify - JUSTIFY_FLEX_START, JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_AROUND, or JUSTIFY_SPACE_EVENLY
     */
    setJustifyContent(justify: number): void;
    /**
     * Set padding for one or more edges.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Padding in points
     */
    setPadding(edge: number, value: number): void;
    /**
     * Set padding as a percentage of the parent's width.
     * Per CSS spec, percentage padding always resolves against the containing block's width.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Padding as a percentage (0-100)
     */
    setPaddingPercent(edge: number, value: number): void;
    /**
     * Set margin for one or more edges.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Margin in points
     */
    setMargin(edge: number, value: number): void;
    /**
     * Set margin as a percentage of the parent's size.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Margin as a percentage (0-100)
     */
    setMarginPercent(edge: number, value: number): void;
    /**
     * Set margin to auto (for centering items with margin: auto).
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     */
    setMarginAuto(edge: number): void;
    /**
     * Set border width for one or more edges.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Border width in points
     */
    setBorder(edge: number, value: number): void;
    /**
     * Set gap between flex items.
     *
     * @param gutter - GUTTER_COLUMN (horizontal gap), GUTTER_ROW (vertical gap), or GUTTER_ALL (both)
     * @param value - Gap size in points
     */
    setGap(gutter: number, value: number): void;
    /**
     * Set the position type.
     *
     * @param positionType - POSITION_TYPE_STATIC, POSITION_TYPE_RELATIVE, or POSITION_TYPE_ABSOLUTE
     */
    setPositionType(positionType: number): void;
    /**
     * Set position offset for one or more edges.
     * Only applies when position type is ABSOLUTE or RELATIVE.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Position offset in points
     */
    setPosition(edge: number, value: number): void;
    /**
     * Set position offset as a percentage.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
     * @param value - Position offset as a percentage of parent's corresponding dimension
     */
    setPositionPercent(edge: number, value: number): void;
    /**
     * Set the display type.
     *
     * @param display - DISPLAY_FLEX or DISPLAY_NONE
     */
    setDisplay(display: number): void;
    /**
     * Set the overflow behavior.
     *
     * @param overflow - OVERFLOW_VISIBLE, OVERFLOW_HIDDEN, or OVERFLOW_SCROLL
     */
    setOverflow(overflow: number): void;
    /**
     * Get the width style value.
     *
     * @returns Width value with unit (points, percent, or auto)
     */
    getWidth(): Value;
    /**
     * Get the height style value.
     *
     * @returns Height value with unit (points, percent, or auto)
     */
    getHeight(): Value;
    /**
     * Get the minimum width style value.
     *
     * @returns Minimum width value with unit
     */
    getMinWidth(): Value;
    /**
     * Get the minimum height style value.
     *
     * @returns Minimum height value with unit
     */
    getMinHeight(): Value;
    /**
     * Get the maximum width style value.
     *
     * @returns Maximum width value with unit
     */
    getMaxWidth(): Value;
    /**
     * Get the maximum height style value.
     *
     * @returns Maximum height value with unit
     */
    getMaxHeight(): Value;
    /**
     * Get the aspect ratio.
     *
     * @returns Aspect ratio value (NaN if not set)
     */
    getAspectRatio(): number;
    /**
     * Get the flex grow factor.
     *
     * @returns Flex grow value
     */
    getFlexGrow(): number;
    /**
     * Get the flex shrink factor.
     *
     * @returns Flex shrink value
     */
    getFlexShrink(): number;
    /**
     * Get the flex basis style value.
     *
     * @returns Flex basis value with unit
     */
    getFlexBasis(): Value;
    /**
     * Get the flex direction.
     *
     * @returns Flex direction constant
     */
    getFlexDirection(): number;
    /**
     * Get the flex wrap setting.
     *
     * @returns Flex wrap constant
     */
    getFlexWrap(): number;
    /**
     * Get the align items setting.
     *
     * @returns Align items constant
     */
    getAlignItems(): number;
    /**
     * Get the align self setting.
     *
     * @returns Align self constant
     */
    getAlignSelf(): number;
    /**
     * Get the align content setting.
     *
     * @returns Align content constant
     */
    getAlignContent(): number;
    /**
     * Get the justify content setting.
     *
     * @returns Justify content constant
     */
    getJustifyContent(): number;
    /**
     * Get the padding for a specific edge.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Padding value with unit
     */
    getPadding(edge: number): Value;
    /**
     * Get the margin for a specific edge.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Margin value with unit
     */
    getMargin(edge: number): Value;
    /**
     * Get the border width for a specific edge.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Border width in points
     */
    getBorder(edge: number): number;
    /**
     * Get the position offset for a specific edge.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Position value with unit
     */
    getPosition(edge: number): Value;
    /**
     * Get the position type.
     *
     * @returns Position type constant
     */
    getPositionType(): number;
    /**
     * Get the display type.
     *
     * @returns Display constant
     */
    getDisplay(): number;
    /**
     * Get the overflow setting.
     *
     * @returns Overflow constant
     */
    getOverflow(): number;
    /**
     * Get the gap for column or row.
     *
     * @param gutter - GUTTER_COLUMN or GUTTER_ROW
     * @returns Gap size in points
     */
    getGap(gutter: number): number;
    /**
     * Get the computed padding for a specific edge after layout.
     * Returns the resolved padding value (percentage and logical edges resolved).
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Padding value in points
     */
    getComputedPadding(edge: number): number;
    /**
     * Get the computed margin for a specific edge after layout.
     * Returns the resolved margin value (percentage and logical edges resolved).
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Margin value in points
     */
    getComputedMargin(edge: number): number;
    /**
     * Get the computed border width for a specific edge after layout.
     *
     * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
     * @returns Border width in points
     */
    getComputedBorder(edge: number): number;
}
