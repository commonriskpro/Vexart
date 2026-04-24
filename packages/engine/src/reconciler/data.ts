/**
 * Data fetching hooks for retained UI state.
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
  fetcher: () => Promise<T>,
  options?: QueryOptions,
): QueryResult<T> {
  const [data, setData] = createSignal<T | undefined>(undefined)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  const enabled = options?.enabled ?? true
  const retry = options?.retry ?? 0
  const retryDelay = options?.retryDelay ?? 1000

  let attempts = 0

  const execute = async () => {
    setLoading(true)
    setError(undefined)
    attempts = 0

    const tryFetch = async (): Promise<void> => {
      try {
        const result = await fetcher()
        setData(() => result)
        setLoading(false)
      } catch (err) {
        attempts++
        if (attempts <= retry) {
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          return tryFetch()
        }
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
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
    const interval = setInterval(execute, options.refetchInterval)
    onCleanup(() => clearInterval(interval))
  }

  const mutate = (updater: T | ((prev: T | undefined) => T)) => {
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
