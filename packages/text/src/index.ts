/**
 * Temporary bridge package for text layout and font atlas services.
 */

export {
  registerFont,
  getFont,
  clearTextCache,
  getTextLayoutCacheStats,
  measureForClay,
  layoutText,
  fontToCSS,
} from "../../renderer/src/text-layout"

export { getFontAtlasCacheStats } from "../../renderer/src/font-atlas"

export type { FontDescriptor } from "../../renderer/src/text-layout"
