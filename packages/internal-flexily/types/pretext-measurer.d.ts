/**
 * Pretext text measurement plugin.
 *
 * Integrates with @chenglou/pretext for proportional font measurement.
 * Pretext is a peer dependency — users must install it separately.
 *
 * See silvery-internal/design/v05-layout/pretext-integration.md
 */
import type { FlexilyPlugin } from "./create-flexily.js";
import type { TextLayoutService } from "./text-layout.js";
/** Pretext API shape (from @chenglou/pretext). Defined here to avoid a hard dependency. */
export interface PretextAPI {
    prepare(text: string, font: string): PretextPrepared;
}
export interface PretextPrepared {
    layout(maxWidth: number, lineHeight?: number): PretextLayout;
}
export interface PretextLayout {
    width: number;
    height: number;
    lines?: Array<{
        text: string;
        width: number;
    }>;
}
/**
 * Create a Pretext-based text measurement service.
 *
 * @param pretext - The pretext module (import from "@chenglou/pretext")
 */
export declare function createPretextMeasurer(pretext: PretextAPI): TextLayoutService;
/**
 * Plugin: add Pretext-based proportional text measurement.
 *
 * @param pretext - The pretext module (import from "@chenglou/pretext")
 */
export declare function withPretext(pretext: PretextAPI): FlexilyPlugin;
