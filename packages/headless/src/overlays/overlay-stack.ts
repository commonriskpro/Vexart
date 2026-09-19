/**
 * Shared LIFO overlay dismiss stack for coordinating Escape key dismissal.
 *
 * Topmost overlay dismiss callback receives the Escape key first.
 *
 * @internal
 */

const stack: Array<() => void> = []

export function pushOverlayDismiss(close: () => void): () => void {
  stack.push(close)
  return () => {
    const index = stack.lastIndexOf(close)
    if (index >= 0) {
      stack.splice(index, 1)
    }
  }
}

export function isTopOverlay(close: () => void): boolean {
  return stack.length > 0 && stack[stack.length - 1] === close
}
