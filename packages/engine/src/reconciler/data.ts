/**
 * Data fetching hooks for UI state.
 * These helpers expose lightweight query and mutation primitives for Solid-based apps.
 */

import { createSignal, onCleanup } from "solid-js"

// ── Types ──

/** @public */
export type QueryResult<T> = {
  /** The fetched data (undefined while loading or on error). */
  data: () => T | undefined
  /** Whether the query is currently fetching. */
  loading: () => boolean
  /** Error from the last fetch attempt. */
  error: () => Error | undefined
  /** Re-run the query. */
  refetch: () => void
  /** Manually set the data (for optimistic updates). */
  mutate: (data: T | ((prev: T | undefined) => T)) => void
}

/** @public */
export type QueryOptions = {
  /** Whether to run the query immediately. Default: true. */
  enabled?: boolean
  /** Auto-refetch interval in ms. 0 = disabled. Default: 0. */
  refetchInterval?: number
  /** Retry count on error. Default: 0. */
  retry?: number
  /** Retry delay in ms. Default: 1000. */
  retryDelay?: number
}

/** @public */
export type MutationResult<T, V> = {
  /** The result of the last successful mutation. */
  data: () => T | undefined
  /** Whether the mutation is in progress. */
  loading: () => boolean
  /** Error from the last mutation attempt. */
  error: () => Error | undefined
  /** Trigger the mutation. */
  mutate: (variables: V) => Promise<T | undefined>
  /** Reset state to idle. */
  reset: () => void
}

/** @public */
export type MutationOptions<T, V> = {
  /** Called before the mutation — return optimistic data to set immediately. */
  onMutate?: (variables: V) => T | undefined
  /** Called on success. */
  onSuccess?: (data: T, variables: V) => void
  /** Called on error. Receives the previous data for rollback. */
  onError?: (error: Error, variables: V, previousData: T | undefined) => void
  /** Called after success or error. */
  onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void
}

// ── useQuery ──

/** @public */
export function useQuery<T>(
  fetcher: (context?: { signal?: AbortSignal }) => Promise<T>,
  options?: QueryOptions,
): QueryResult<T> {
  const controller = new AbortController()
  let mounted = true
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const [data, setData] = createSignal<T | undefined>(undefined)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  const enabled = options?.enabled ?? true
  const retry = options?.retry ?? 0
  const retryDelay = options?.retryDelay ?? 1000

  let attempts = 0

  const execute = async () => {
    if (!mounted) return
    if (mounted) setLoading(true)
    if (mounted) setError(undefined)
    attempts = 0

    const tryFetch = async (): Promise<void> => {
      try {
        const result = await fetcher({ signal: controller.signal })
        if (mounted) setData(() => result)
        if (mounted) setLoading(false)
      } catch (err) {
        if (!mounted) return
        attempts++
        if (attempts <= retry) {
          await new Promise<void>((resolve) => {
            if (!mounted || controller.signal.aborted) {
              resolve()
              return
            }
            const onAbort = () => {
              if (retryTimer !== undefined) {
                clearTimeout(retryTimer)
                retryTimer = undefined
              }
              controller.signal.removeEventListener("abort", onAbort)
              resolve()
            }
            controller.signal.addEventListener("abort", onAbort, { once: true })
            retryTimer = setTimeout(() => {
              controller.signal.removeEventListener("abort", onAbort)
              retryTimer = undefined
              resolve()
            }, retryDelay)
          })
          if (!mounted) return
          return tryFetch()
        }
        if (mounted) setError(err instanceof Error ? err : new Error(String(err)))
        if (mounted) setLoading(false)
      }
    }

    await tryFetch()
  }

  // Auto-fetch on creation
  if (enabled) {
    execute()
  }

  // Auto-refetch interval
  if (options?.refetchInterval && options.refetchInterval > 0) {
    const interval = setInterval(() => {
      if (mounted) execute()
    }, options.refetchInterval)
    onCleanup(() => clearInterval(interval))
  }

  onCleanup(() => {
    mounted = false
    controller.abort()
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
  })

  const mutate = (updater: T | ((prev: T | undefined) => T)) => {
    if (!mounted) return
    if (typeof updater === "function") {
      setData(prev => (updater as (prev: T | undefined) => T)(prev))
    } else {
      setData(() => updater)
    }
  }

  return {
    data,
    loading,
    error,
    refetch: execute,
    mutate,
  }
}

// ── useMutation ──

/** @public */
export function useMutation<T, V = void>(
  mutator: (variables: V) => Promise<T>,
  options?: MutationOptions<T, V>,
): MutationResult<T, V> {
  const [data, setData] = createSignal<T | undefined>(undefined)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  const mutate = async (variables: V): Promise<T | undefined> => {
    setLoading(true)
    setError(undefined)

    // Optimistic update
    let previousData: T | undefined
    if (options?.onMutate) {
      previousData = data()
      const optimistic = options.onMutate(variables)
      if (optimistic !== undefined) {
        setData(() => optimistic)
      }
    }

    try {
      const result = await mutator(variables)
      setData(() => result)
      setLoading(false)
      options?.onSuccess?.(result, variables)
      options?.onSettled?.(result, undefined, variables)
      return result
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      setLoading(false)
      // Rollback optimistic update
      if (previousData !== undefined) {
        setData(() => previousData)
      }
      options?.onError?.(e, variables, previousData)
      options?.onSettled?.(undefined, e, variables)
      return undefined
    }
  }

  const reset = () => {
    setData(undefined)
    setError(undefined)
    setLoading(false)
  }

  return { data, loading, error, mutate, reset }
}
