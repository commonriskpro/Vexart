/**
 * Toast — styled notification system using Void design tokens.
 *
 * @public
 */

import { createToaster } from "@vexart/headless"
import type { ToastData, ToastPosition, ToasterHandle } from "@vexart/headless"
import type { JSX } from "solid-js"
import { radius, space, font, weight, shadows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidToasterOptions = {
  position?: ToastPosition
  maxVisible?: number
  defaultDuration?: number
}

// ── Variant color getters (lazy — read themeColors inside effects) ──

type VariantColors = {
  accent: () => string | number
  border: () => string | number
}

const variantGetters: Record<string, VariantColors> = {
  default: { accent: () => themeColors.foreground, border: () => themeColors.border },
  // TODO: add semantic success toast tokens.
  success: { accent: () => "#22c55e",              border: () => "#22c55e40" },
  error:   { accent: () => themeColors.destructive, border: () => themeColors.destructive },
  // TODO: add semantic warning toast tokens.
  warning: { accent: () => "#f59e0b",              border: () => "#f59e0b40" },
  // TODO: add semantic info toast tokens.
  info:    { accent: () => "#3b82f6",              border: () => "#3b82f640" },
}

/** @public */
export function createVoidToaster(options: VoidToasterOptions = {}): ToasterHandle {
  return createToaster({
    position: options.position ?? "bottom-right",
    maxVisible: options.maxVisible ?? 5,
    defaultDuration: options.defaultDuration ?? 3000,
    gap: space[2],
    padding: space[4],
    renderToast(t: ToastData, dismiss: () => void): JSX.Element {
      const vg = variantGetters[t.variant] ?? variantGetters.default
      return (
        <box
          direction="column"
          backgroundColor={themeColors.card}
          cornerRadius={radius.lg}
          borderColor={vg.border()}
          borderWidth={1}
          padding={space[3]}
          paddingX={space[4]}
          gap={space[1]}
          minWidth={240}
          maxWidth={360}
          shadow={shadows.lg}
        >
          <text color={vg.accent()} fontSize={font.sm} fontWeight={weight.medium}>
            {t.message}
          </text>
          {t.description ? (
            <text color={themeColors.mutedForeground} fontSize={font.xs}>
              {t.description}
            </text>
          ) : null}
        </box>
      )
    },
  })
}
