/**
 * Flexily Node Pool.
 *
 * Avoids allocating and destroying Flexily layout nodes on every unmount/mount
 * cycle (e.g. <Show>, <For> toggles, list re-rendering) by pooling detached/freed
 * Flexily Node instances with guaranteed state sanitization via Node.reset().
 */

import { Node } from "flexily"

export const DEFAULT_MAX_FLEX_NODE_POOL_SIZE = 256

const _pool: Node[] = []
let _maxPoolSize = DEFAULT_MAX_FLEX_NODE_POOL_SIZE

/**
 * Acquire a clean Flexily Node from the pool, or create a new one if the pool is empty.
 */
export function acquireFlexNode(): Node {
  const node = _pool.pop()
  if (node) {
    return node
  }
  return Node.create()
}

/**
 * Release a Flexily Node back to the pool.
 * Resets the node to clear measure callbacks, closures, children, and styles.
 * If the pool has reached maximum capacity or already contains the node, it is discarded.
 */
export function releaseFlexNode(node: Node | null | undefined): void {
  if (!node) return
  node.reset()
  if (_pool.length < _maxPoolSize && !_pool.includes(node)) {
    _pool.push(node)
  }
}

/**
 * Get current number of idle nodes in the pool.
 */
export function getFlexNodePoolSize(): number {
  return _pool.length
}

/**
 * Clear all pooled nodes.
 */
export function clearFlexNodePool(): void {
  _pool.length = 0
}

/**
 * Get the maximum capacity of the pool.
 */
export function getFlexNodePoolCapacity(): number {
  return _maxPoolSize
}

/**
 * Set max pool capacity (for testing/diagnostics).
 */
export function setFlexNodePoolCapacity(capacity: number): void {
  _maxPoolSize = Math.max(0, capacity)
  if (_pool.length > _maxPoolSize) {
    _pool.length = _maxPoolSize
  }
}

/**
 * Reset max pool capacity back to default.
 */
export function resetFlexNodePoolCapacity(): void {
  _maxPoolSize = DEFAULT_MAX_FLEX_NODE_POOL_SIZE
}
