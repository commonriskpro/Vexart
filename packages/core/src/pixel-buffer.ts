/**
 * Transitional internal boundary for raster operations.
 *
 * The renderer no longer treats PixelBuffer as its core surface type.
 * This module only centralizes the current paint/composite implementation from
 * @tge/pixel so higher-level modules can move toward GPU-native or neutral
 * raster surfaces without importing that package directly everywhere.
 */

export {
  create,
  clear,
  paint,
  over,
  sub,
  withOpacity,
} from "@tge/pixel"
