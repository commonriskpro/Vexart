/**
 * Toast — styled notification system using Void design tokens.
 *
 * Built on top of the headless @tge/components createToaster.
 * Provides ALL visual rendering via renderToast.
 *
 * Usage:
 *   const { toast, Toaster } = createVoidToaster()
 *   <Toaster />
 *   toast("Settings saved")
 *   toast({ message: "Error!", variant: "error" })
 */

import { createToaster } from "@tge/components"
import type { ToastData, ToastPosition, ToasterHandle } from "@tge/components"
import type { JSX } from "solid-js"
import { colors, radius, space, font, weight, shadows } from "./tokens"

export type VoidToasterOptions = {
  position?: ToastPosition
  maxVisible?: number
  defaultDuration?: number
}

const variantStyles: Record<string, { accent: string; border: string }> = {
  default: { accent: colors.foreground, border: colors.border },
  success: { accent: "#22c55e", border: "#22c55e40" },
  error:   { accent: colors.destructive, border: "#dc262640" },
  warning: { accent: "#f59e0b", border: "#f59e0b40" },
  info:    { accent: "#3b82f6", border: "#3b82f640" },
}

export function createVoidToaster(options: VoidToasterOptions = {}): ToasterHandle {
  return createToaster({
    position: options.position ?? "bottom-right",
    maxVisible: options.maxVisible ?? 5,
    defaultDuration: options.defaultDuration ?? 3000,
    gap: space[2],
    padding: space[4],
    renderToast(t: ToastData, dismiss: () => void): JSX.Element {
      const vs = variantStyles[t.variant] ?? variantStyles.default
      return (
        <box
          direction="column"
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          borderColor={vs.border}
          borderWidth={1}
          padding={space[3]}
          paddingX={space[4]}
          gap={space[1]}
          minWidth={240}
          maxWidth={360}
          shadow={shadows.lg}
        >
          <text color={vs.accent} fontSize={font.sm} fontWeight={weight.medium}>
            {t.message}
          </text>
          {t.description ? (
            <text color={colors.mutedForeground} fontSize={font.xs}>
              {t.description}
            </text>
          ) : null}
        </box>
      )
    },
  })
}
