import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createForm, type FormHandle } from "./form"

describe("Form dirty check", () => {
  test("structural equality for objects", () => createRoot((dispose) => {
    const initial = { a: 1, b: 2 }
    const same = { a: 1, b: 2 }
    const different = { a: 1, b: 3 }

    expect(initial === same).toBe(false)
    expect(JSON.stringify(initial) === JSON.stringify(same)).toBe(true)
    expect(JSON.stringify(initial) === JSON.stringify(different)).toBe(false)

    const form = createForm({
      initialValues: { value: initial },
      onSubmit: () => {},
    })

    form.setValue("value", same)
    expect(form.dirty.value()).toBe(false)

    form.setValue("value", different)
    expect(form.dirty.value()).toBe(true)

    dispose()
  }))
})

describe("Form submission and submitting state", () => {
  test("submitting() is true synchronously during async validation before onSubmit is called", async () => {
    let form!: FormHandle<{ username: string }>
    let resolveValidation!: (error?: string) => void
    const validationPromise = new Promise<string | undefined>((resolve) => {
      resolveValidation = resolve
    })
    let onSubmitCalled = false

    const dispose = createRoot((d) => {
      form = createForm({
        initialValues: { username: "user" },
        validateAsync: {
          username: async () => validationPromise,
        },
        onSubmit: () => {
          onSubmitCalled = true
        },
      })
      return d
    })

    expect(form.submitting()).toBe(false)
    const submitPromise = (form.submit as () => Promise<void>)()

    // Must be true synchronously before async validation finishes
    expect(form.submitting()).toBe(true)
    expect(onSubmitCalled).toBe(false)

    resolveValidation(undefined)
    await submitPromise

    expect(onSubmitCalled).toBe(true)
    expect(form.submitting()).toBe(false)
    dispose()
  })

  test("calling submit() while a submission/validation is already in-flight is safely ignored", async () => {
    let form!: FormHandle<{ username: string }>
    let resolveValidation!: (error?: string) => void
    const validationPromise = new Promise<string | undefined>((resolve) => {
      resolveValidation = resolve
    })
    let validateCalls = 0
    let submitCalls = 0

    const dispose = createRoot((d) => {
      form = createForm({
        initialValues: { username: "user" },
        validateAsync: {
          username: async () => {
            validateCalls++
            return validationPromise
          },
        },
        onSubmit: () => {
          submitCalls++
        },
      })
      return d
    })

    expect(form.submitting()).toBe(false)
    const firstSubmit = (form.submit as () => Promise<void>)()
    expect(form.submitting()).toBe(true)
    expect(validateCalls).toBe(1)

    // Call submit while async validation is in-flight
    const secondSubmit = (form.submit as () => Promise<void>)()
    expect(validateCalls).toBe(1)

    resolveValidation(undefined)
    await firstSubmit
    await secondSubmit

    expect(submitCalls).toBe(1)
    expect(form.submitting()).toBe(false)
    dispose()
  })

  test("calling submit() while onSubmit is in-flight is safely ignored", async () => {
    let form!: FormHandle<{ username: string }>
    let resolveSubmit!: () => void
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve
    })
    let submitCalls = 0

    const dispose = createRoot((d) => {
      form = createForm({
        initialValues: { username: "user" },
        onSubmit: async () => {
          submitCalls++
          await submitPromise
        },
      })
      return d
    })

    expect(form.submitting()).toBe(false)
    const firstSubmit = (form.submit as () => Promise<void>)()
    expect(form.submitting()).toBe(true)
    expect(submitCalls).toBe(1)

    // Call submit while onSubmit is in-flight
    const secondSubmit = (form.submit as () => Promise<void>)()
    expect(submitCalls).toBe(1)

    resolveSubmit()
    await firstSubmit
    await secondSubmit

    expect(submitCalls).toBe(1)
    expect(form.submitting()).toBe(false)
    dispose()
  })

  test("submitting() resets to false when async validation finds errors", async () => {
    let form!: FormHandle<{ username: string }>
    let resolveValidation!: (error?: string) => void
    const validationPromise = new Promise<string | undefined>((resolve) => {
      resolveValidation = resolve
    })
    let onSubmitCalled = false

    const dispose = createRoot((d) => {
      form = createForm({
        initialValues: { username: "user" },
        validateAsync: {
          username: async () => validationPromise,
        },
        onSubmit: () => {
          onSubmitCalled = true
        },
      })
      return d
    })

    const submitPromise = (form.submit as () => Promise<void>)()
    expect(form.submitting()).toBe(true)

    resolveValidation("Username already taken")
    await submitPromise

    expect(form.submitting()).toBe(false)
    expect(form.errors.username()).toBe("Username already taken")
    expect(onSubmitCalled).toBe(false)
    dispose()
  })

  test("submitting() resets to false even if onSubmit throws", async () => {
    let form!: FormHandle<{ username: string }>

    const dispose = createRoot((d) => {
      form = createForm({
        initialValues: { username: "user" },
        onSubmit: async () => {
          throw new Error("Submission network failure")
        },
      })
      return d
    })

    expect(form.submitting()).toBe(false)

    let caughtError: unknown
    try {
      await (form.submit as () => Promise<void>)()
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeDefined()
    expect((caughtError as Error).message).toBe("Submission network failure")
    expect(form.submitting()).toBe(false)
    dispose()
  })

  test("submitting() remains false when sync validation fails", async () => {
    let form!: FormHandle<{ username: string }>
    let onSubmitCalled = false

    const dispose = createRoot((d) => {
      form = createForm({
        initialValues: { username: "" },
        validate: {
          username: (val) => (val ? undefined : "Username is required"),
        },
        onSubmit: () => {
          onSubmitCalled = true
        },
      })
      return d
    })

    await (form.submit as () => Promise<void>)()
    expect(form.submitting()).toBe(false)
    expect(form.errors.username()).toBe("Username is required")
    expect(onSubmitCalled).toBe(false)
    dispose()
  })
})

