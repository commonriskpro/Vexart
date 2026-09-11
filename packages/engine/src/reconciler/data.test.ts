import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { useMutation, useQuery } from "./data"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function withRoot<T>(fn: (dispose: () => void) => T): { result: T; dispose: () => void } {
  let dispose!: () => void
  const result = createRoot((d) => {
    dispose = d
    return fn(d)
  })
  return { result, dispose }
}

describe("useQuery", () => {
  test("fetches data successfully on mount, transitions loading from true to false, and populates data()", async () => {
    let resolvePromise!: (val: string) => void
    const fetcher = () =>
      new Promise<string>((resolve) => {
        resolvePromise = resolve
      })

    const { result: query, dispose } = withRoot(() => useQuery(fetcher))

    expect(query.loading()).toBe(true)
    expect(query.data()).toBeUndefined()
    expect(query.error()).toBeUndefined()

    resolvePromise("fetched-payload")
    await sleep(5)

    expect(query.loading()).toBe(false)
    expect(query.data()).toBe("fetched-payload")
    expect(query.error()).toBeUndefined()

    dispose()
  })

  test("works without options argument provided", async () => {
    const { result: query, dispose } = withRoot(() =>
      useQuery(async () => "no-options-result"),
    )

    expect(query.loading()).toBe(true)
    await sleep(5)

    expect(query.loading()).toBe(false)
    expect(query.data()).toBe("no-options-result")
    expect(query.error()).toBeUndefined()

    dispose()
  })

  test("respects enabled: false (does not execute fetcher on mount)", async () => {
    let fetchCount = 0
    const fetcher = async () => {
      fetchCount++
      return "result"
    }

    const { result: query, dispose } = withRoot(() =>
      useQuery(fetcher, { enabled: false }),
    )

    await sleep(5)
    expect(fetchCount).toBe(0)
    expect(query.loading()).toBe(false)
    expect(query.data()).toBeUndefined()
    expect(query.error()).toBeUndefined()

    dispose()
  })

  test("manual refetch() triggers fetch and updates data()", async () => {
    let count = 0
    const fetcher = async () => ++count

    const { result: query, dispose } = withRoot(() =>
      useQuery(fetcher, { enabled: false }),
    )

    expect(count).toBe(0)
    expect(query.data()).toBeUndefined()

    query.refetch()
    expect(query.loading()).toBe(true)
    await sleep(5)
    expect(query.loading()).toBe(false)
    expect(query.data()).toBe(1)

    query.refetch()
    expect(query.loading()).toBe(true)
    await sleep(5)
    expect(query.loading()).toBe(false)
    expect(query.data()).toBe(2)

    dispose()
  })

  test("local mutate(value) updates data() directly", async () => {
    const { result: query, dispose } = withRoot(() =>
      useQuery(async () => "initial", { enabled: false }),
    )

    expect(query.data()).toBeUndefined()
    query.mutate("direct-value")
    expect(query.data()).toBe("direct-value")

    query.mutate("next-value")
    expect(query.data()).toBe("next-value")

    dispose()
  })

  test("functional mutate(prev => ...) updates data() based on previous value", async () => {
    const { result: query, dispose } = withRoot(() =>
      useQuery(async () => 10, { enabled: false }),
    )

    query.mutate(10)
    expect(query.data()).toBe(10)

    query.mutate((prev) => (prev ?? 0) + 5)
    expect(query.data()).toBe(15)

    query.mutate((prev) => (prev ?? 0) * 2)
    expect(query.data()).toBe(30)

    dispose()
  })

  test("captures error in error() signal when fetcher rejects with Error", async () => {
    const err = new Error("Network error")
    const { result: query, dispose } = withRoot(() =>
      useQuery(
        async () => {
          throw err
        },
        { retry: 0 },
      ),
    )

    expect(query.loading()).toBe(true)
    await sleep(5)

    expect(query.loading()).toBe(false)
    expect(query.data()).toBeUndefined()
    expect(query.error()).toBe(err)

    dispose()
  })

  test("captures non-Error rejection as Error in error() signal", async () => {
    const { result: query, dispose } = withRoot(() =>
      useQuery(
        async () => {
          throw "string-based rejection"
        },
        { retry: 0 },
      ),
    )

    await sleep(5)

    expect(query.loading()).toBe(false)
    expect(query.error()).toBeInstanceOf(Error)
    expect(query.error()?.message).toBe("string-based rejection")

    dispose()
  })

  test("retries failed fetch according to retry and retryDelay options before setting final error", async () => {
    let attempts = 0
    const fetcher = async () => {
      attempts++
      throw new Error(`Attempt ${attempts} failed`)
    }

    const { result: query, dispose } = withRoot(() =>
      useQuery(fetcher, { retry: 2, retryDelay: 10 }),
    )

    expect(query.loading()).toBe(true)

    // Initial attempt (0ms) + 1st retry (10ms) + 2nd retry (10ms)
    await sleep(40)

    expect(attempts).toBe(3)
    expect(query.loading()).toBe(false)
    expect(query.error()).toBeInstanceOf(Error)
    expect(query.error()?.message).toBe("Attempt 3 failed")

    dispose()
  })

  test("retries and recovers if a subsequent attempt succeeds", async () => {
    let attempts = 0
    const fetcher = async () => {
      attempts++
      if (attempts < 2) {
        throw new Error("Temporary failure")
      }
      return "recovered payload"
    }

    const { result: query, dispose } = withRoot(() =>
      useQuery(fetcher, { retry: 2, retryDelay: 10 }),
    )

    expect(query.loading()).toBe(true)
    await sleep(30)

    expect(attempts).toBe(2)
    expect(query.loading()).toBe(false)
    expect(query.data()).toBe("recovered payload")
    expect(query.error()).toBeUndefined()

    dispose()
  })

  test("cleans up refetchInterval timer on disposal (dispose())", async () => {
    let count = 0
    const fetcher = async () => ++count

    let disposeFn!: () => void
    const query = createRoot((dispose) => {
      disposeFn = dispose
      return useQuery(fetcher, { refetchInterval: 15 })
    })

    await sleep(5)
    expect(count).toBe(1)
    expect(query.data()).toBe(1)

    // Wait for interval tick
    await sleep(20)
    expect(count).toBe(2)
    expect(query.data()).toBe(2)

    // Dispose the reactive root to trigger onCleanup
    disposeFn()

    // Wait to verify timer is cleared and no further refetches run
    await sleep(35)
    expect(count).toBe(2)
  })

  test("does not set interval when refetchInterval is 0 or negative", async () => {
    let count = 0
    const fetcher = async () => ++count

    const { dispose } = withRoot(() =>
      useQuery(fetcher, { refetchInterval: 0 }),
    )

    await sleep(5)
    expect(count).toBe(1)

    await sleep(25)
    expect(count).toBe(1)

    dispose()
  })
})

describe("useMutation", () => {
  test("executes mutator, tracks loading(), sets data(), and invokes onSuccess and onSettled", async () => {
    let successData: string | undefined
    let successVars: number | undefined
    let settledData: string | undefined
    let settledError: Error | undefined
    let settledVars: number | undefined

    let resolveMutator!: (value: string) => void
    const mutator = (vars: number) =>
      new Promise<string>((resolve) => {
        resolveMutator = () => resolve(`result-${vars}`)
      })

    const { result: mutation, dispose } = withRoot(() =>
      useMutation(mutator, {
        onSuccess: (data, vars) => {
          successData = data
          successVars = vars
        },
        onSettled: (data, err, vars) => {
          settledData = data
          settledError = err
          settledVars = vars
        },
      }),
    )

    expect(mutation.loading()).toBe(false)
    expect(mutation.data()).toBeUndefined()
    expect(mutation.error()).toBeUndefined()

    const mutatePromise = mutation.mutate(42)
    expect(mutation.loading()).toBe(true)

    resolveMutator("result-42")
    const result = await mutatePromise

    expect(result).toBe("result-42")
    expect(mutation.loading()).toBe(false)
    expect(mutation.data()).toBe("result-42")
    expect(mutation.error()).toBeUndefined()

    expect(successData).toBe("result-42")
    expect(successVars).toBe(42)
    expect(settledData).toBe("result-42")
    expect(settledError).toBeUndefined()
    expect(settledVars).toBe(42)

    dispose()
  })

  test("executes mutator successfully without options provided", async () => {
    const { result: mutation, dispose } = withRoot(() =>
      useMutation(async (name: string) => `Hello, ${name}!`),
    )

    const result = await mutation.mutate("World")
    expect(result).toBe("Hello, World!")
    expect(mutation.data()).toBe("Hello, World!")
    expect(mutation.loading()).toBe(false)
    expect(mutation.error()).toBeUndefined()

    dispose()
  })

  test("catches error on mutator failure, sets error(), and invokes onError and onSettled", async () => {
    let errorObj: Error | undefined
    let errorVars: string | undefined
    let errorPrev: string | undefined
    let settledData: string | undefined
    let settledErr: Error | undefined
    let settledVars: string | undefined

    const mutationError = new Error("Failed to save")

    const { result: mutation, dispose } = withRoot(() =>
      useMutation<string, string>(
        async () => {
          throw mutationError
        },
        {
          onError: (err, vars, prev) => {
            errorObj = err
            errorVars = vars
            errorPrev = prev
          },
          onSettled: (data, err, vars) => {
            settledData = data
            settledErr = err
            settledVars = vars
          },
        },
      ),
    )

    const result = await mutation.mutate("input-val")

    expect(result).toBeUndefined()
    expect(mutation.loading()).toBe(false)
    expect(mutation.data()).toBeUndefined()
    expect(mutation.error()).toBe(mutationError)

    expect(errorObj).toBe(mutationError)
    expect(errorVars).toBe("input-val")
    expect(errorPrev).toBeUndefined()

    expect(settledData).toBeUndefined()
    expect(settledErr).toBe(mutationError)
    expect(settledVars).toBe("input-val")

    dispose()
  })

  test("catches non-Error reject in mutation and converts to Error", async () => {
    const { result: mutation, dispose } = withRoot(() =>
      useMutation(async () => {
        throw "mutation string failure"
      }),
    )

    const result = await mutation.mutate()

    expect(result).toBeUndefined()
    expect(mutation.loading()).toBe(false)
    expect(mutation.error()).toBeInstanceOf(Error)
    expect(mutation.error()?.message).toBe("mutation string failure")

    dispose()
  })

  test("executes optimistic update with onMutate, and on failure rolls back data() to previousData", async () => {
    let rollbackPrev: string | undefined
    let rejectMutator!: (err: Error) => void

    let shouldFail = false
    const mutator = (text: string) =>
      new Promise<string>((resolve, reject) => {
        if (shouldFail) {
          rejectMutator = reject
        } else {
          resolve(text)
        }
      })

    const { result: mutation, dispose } = withRoot(() =>
      useMutation<string, string>(mutator, {
        onMutate: (next) => `optimistic-${next}`,
        onError: (_err, _vars, prev) => {
          rollbackPrev = prev
        },
      }),
    )

    // First mutation succeeds to establish previousData
    await mutation.mutate("initial")
    expect(mutation.data()).toBe("initial")

    // Second mutation enables failure
    shouldFail = true
    const failPromise = mutation.mutate("second")

    // Immediately after invoking mutate, optimistic update should be visible
    expect(mutation.loading()).toBe(true)
    expect(mutation.data()).toBe("optimistic-second")

    // Now fail the mutator
    const customError = new Error("Second mutation rejected")
    rejectMutator(customError)

    const result = await failPromise
    expect(result).toBeUndefined()
    expect(mutation.loading()).toBe(false)
    // Should have rolled back to previous data
    expect(mutation.data()).toBe("initial")
    expect(mutation.error()).toBe(customError)
    expect(rollbackPrev).toBe("initial")

    dispose()
  })

  test("does not update data optimistically if onMutate returns undefined", async () => {
    let resolveMutator!: (val: string) => void
    const mutator = () =>
      new Promise<string>((resolve) => {
        resolveMutator = resolve
      })

    const { result: mutation, dispose } = withRoot(() =>
      useMutation<string, void>(mutator, {
        onMutate: () => undefined,
      }),
    )

    const promise = mutation.mutate()
    expect(mutation.data()).toBeUndefined()

    resolveMutator("resolved-value")
    await promise
    expect(mutation.data()).toBe("resolved-value")

    dispose()
  })

  test("reset() resets data(), error(), and loading() back to initial state", async () => {
    const { result: mutation, dispose } = withRoot(() =>
      useMutation(async (val: string) => {
        if (val === "fail") throw new Error("mutation error")
        return val
      }),
    )

    // After success
    await mutation.mutate("ok")
    expect(mutation.data()).toBe("ok")
    expect(mutation.error()).toBeUndefined()
    expect(mutation.loading()).toBe(false)

    mutation.reset()
    expect(mutation.data()).toBeUndefined()
    expect(mutation.error()).toBeUndefined()
    expect(mutation.loading()).toBe(false)

    // After failure
    await mutation.mutate("fail")
    expect(mutation.data()).toBeUndefined()
    expect(mutation.error()).toBeInstanceOf(Error)
    expect(mutation.loading()).toBe(false)

    mutation.reset()
    expect(mutation.data()).toBeUndefined()
    expect(mutation.error()).toBeUndefined()
    expect(mutation.loading()).toBe(false)

    dispose()
  })
})
