export type LRUCache<K, V> = {
  get: (key: K, compute: () => V) => V
  clear: () => void
  readonly size: number
}

export function createLRUCache<K, V>(maxSize: number): LRUCache<K, V> {
  const cache = new Map<K, V>()

  return {
    get(key, compute) {
      if (cache.has(key)) {
        const value = cache.get(key)!
        cache.delete(key)
        cache.set(key, value)
        return value
      }

      if (cache.size >= maxSize) {
        const first = cache.keys().next()
        if (!first.done) cache.delete(first.value)
      }

      const value = compute()
      cache.set(key, value)
      return value
    },
    clear() {
      cache.clear()
    },
    get size() {
      return cache.size
    },
  }
}
