/**
 * Toast — truly headless notification system.
 *
 * Provides an imperative API for showing auto-dismissing notifications.
 *
 * @public
 */

import { createSignal, For } from "solid-js"
import type { JSX } from "solid-js"
import { Portal } from "../containers/portal"

// ── Types ──

/** @public */
export type ToastVariant = "default" | "success" | "error" | "warning" | "info"

/** @public */
export type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "bottom-center"

/** @public */
export type ToastData = {
  id: number
  message: string
  variant: ToastVariant
  duration: number
  description?: string
}

/** @public */
export type ToastInput = string | {
  message: string
  variant?: ToastVariant
  duration?: number
  description?: string
}

/** @public */
export type ToasterOptions = {
  /** Position on screen. Default: "bottom-right". */
  position?: ToastPosition
  /** Max visible toasts. Default: 5. */
  maxVisible?: number
  /** Default duration in ms. Default: 3000. */
  defaultDuration?: number
  /** Gap between toasts in px. Default: 4. */
  gap?: number
  /** Padding from screen edges in px. Default: 16. */
  padding?: number
  /** Render function for each toast. REQUIRED — no default visual. */
  renderToast: (toast: ToastData, dismiss: () => void) => JSX.Element
}

/** @public */
export type ToasterHandle = {
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
  dismissAll: () => void
  Toaster: () => JSX.Element
}

// ── Factory ──

let nextToastId = 0

/** @public */
export function createToaster(options: ToasterOptions): ToasterHandle {
  const position = options.position ?? "bottom-right"
  const maxVisible = options.maxVisible ?? 5
  const defaultDuration = options.defaultDuration ?? 3000
  const gap = options.gap ?? 4
  const edgePadding = options.padding ?? 16

  const [toasts, setToasts] = createSignal<ToastData[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function dismiss(id: number) {
    const timer = timers.get(id)
    if (timer) { clearTimeout(timer); timers.delete(id) }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  function dismissAll() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    setToasts([])
  }

  function toast(input: ToastInput): number {
    const id = nextToastId++
    const data: ToastData =
      typeof input === "string"
        ? { id, message: input, variant: "default", duration: defaultDuration }
        : {
            id,
            message: input.message,
            variant: input.variant ?? "default",
            duration: input.duration ?? defaultDuration,
            description: input.description,
          }

    setToasts((prev) => {
      const next = [data, ...prev]
      if (next.length > maxVisible) {
        const overflow = next.slice(maxVisible)
        for (const t of overflow) {
          const timer = timers.get(t.id)
          if (timer) { clearTimeout(timer); timers.delete(t.id) }
        }
        return next.slice(0, maxVisible)
      }
      return next
    })

    if (data.duration > 0) {
      const timer = setTimeout(() => dismiss(id), data.duration)
      timers.set(id, timer)
    }

    return id
  }

  // ── Position alignment ──

  type AlignX = "left" | "right" | "center"
  type AlignY = "top" | "bottom" | "center"
  function getAlignment(): { alignX: AlignX; alignY: AlignY } {
    switch (position) {
      case "top-right":     return { alignX: "right",  alignY: "top" }
      case "top-left":      return { alignX: "left",   alignY: "top" }
      case "top-center":    return { alignX: "center", alignY: "top" }
      case "bottom-right":  return { alignX: "right",  alignY: "bottom" }
      case "bottom-left":   return { alignX: "left",   alignY: "bottom" }
      case "bottom-center": return { alignX: "center", alignY: "bottom" }
      default:              return { alignX: "right",  alignY: "bottom" }
    }
  }

  function Toaster() {
    const align = getAlignment()
    return (
      <Portal>
        <box
          width="100%"
          height="100%"
          alignX={align.alignX}
          alignY={align.alignY}
          padding={edgePadding}
          pointerPassthrough
        >
          <box direction="column" gap={gap} pointerPassthrough>
            <For each={toasts()}>
              {(t) => options.renderToast(t, () => dismiss(t.id))}
            </For>
          </box>
        </box>
      </Portal>
    )
  }

  return { toast, dismiss, dismissAll, Toaster }
}
