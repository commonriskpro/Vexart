/**
 * Form validation system — reactive form state management.
 *
 * Inspired by React Hook Form / Formik but designed for SolidJS signals.
 * Creates reactive form state with field-level and form-level validation.
 *
 * Features:
 *   - Field-level validators (sync and async)
 *   - Form-level validation
 *   - Touched/dirty tracking per field
 *   - Submit handling with validation gate
 *   - Error messages as reactive signals
 *   - Reset support
 *
 * Usage:
 *   const form = createForm({
 *     initialValues: { name: "", email: "" },
 *     validate: {
 *       name: (v) => v.length < 2 ? "Too short" : undefined,
 *       email: (v) => !v.includes("@") ? "Invalid email" : undefined,
 *     },
 *     onSubmit: async (values) => {
 *       await saveUser(values)
 *     },
 *   })
 *
 *   // In JSX:
 *   <Input
 *     value={form.values.name()}
 *     onInput={(v) => form.setValue("name", v)}
 *   />
 *   <Show when={form.errors.name()}>
 *     <text color="#ff4444">{form.errors.name()}</text>
 *   </Show>
 *   <Button onPress={form.submit} disabled={form.submitting()}>
 *     Submit
 *   </Button>
 */

import { createSignal, batch } from "solid-js"

// ── Types ──

/** Validator returns error string or undefined/null for valid. */
export type FieldValidator<T> = (value: T, allValues: Record<string, any>) => string | undefined | null

/** Async validator — same signature but returns a Promise. */
export type AsyncFieldValidator<T> = (value: T, allValues: Record<string, any>) => Promise<string | undefined | null>

export type FormOptions<T extends Record<string, any>> = {
  /** Initial values for all fields. */
  initialValues: T
  /** Per-field sync validators. */
  validate?: { [K in keyof T]?: FieldValidator<T[K]> }
  /** Per-field async validators (run on blur/submit). */
  validateAsync?: { [K in keyof T]?: AsyncFieldValidator<T[K]> }
  /** Form-level validator — runs on submit after field validators. */
  validateForm?: (values: T) => Record<string, string> | undefined | null
  /** Submit handler — only called when validation passes. */
  onSubmit: (values: T) => void | Promise<void>
  /** Validate on every change (default: false — validate on blur/submit). */
  validateOnChange?: boolean
}

export type FieldState = {
  /** Current error message (undefined = valid). */
  error: () => string | undefined
  /** Whether the field has been focused and blurred. */
  touched: () => boolean
  /** Whether the value differs from initial. */
  dirty: () => boolean
}

export type FormHandle<T extends Record<string, any>> = {
  /** Reactive field values — form.values.fieldName() */
  values: { [K in keyof T]: () => T[K] }
  /** Reactive field errors — form.errors.fieldName() */
  errors: { [K in keyof T]: () => string | undefined }
  /** Reactive field touched state — form.touched.fieldName() */
  touched: { [K in keyof T]: () => boolean }
  /** Reactive field dirty state — form.dirty.fieldName() */
  dirty: { [K in keyof T]: () => boolean }
  /** Set a field value. Runs sync validation if validateOnChange. */
  setValue: <K extends keyof T>(field: K, value: T[K]) => void
  /** Set a field error manually. */
  setError: <K extends keyof T>(field: K, error: string | undefined) => void
  /** Mark a field as touched (call on blur). Runs validation. */
  setTouched: <K extends keyof T>(field: K) => void
  /** Whether any field has an error. */
  isValid: () => boolean
  /** Whether the form is currently submitting. */
  submitting: () => boolean
  /** Submit the form — validates, then calls onSubmit if valid. */
  submit: () => void
  /** Reset to initial values, clear errors/touched/dirty. */
  reset: () => void
  /** Get all current values as a plain object. */
  getValues: () => T
}

// ── Factory ──

export function createForm<T extends Record<string, any>>(options: FormOptions<T>): FormHandle<T> {
  const fields = Object.keys(options.initialValues) as (keyof T)[]

  // Create signals for each field
  const valueSignals = {} as { [K in keyof T]: ReturnType<typeof createSignal<T[K]>> }
  const errorSignals = {} as { [K in keyof T]: ReturnType<typeof createSignal<string | undefined>> }
  const touchedSignals = {} as { [K in keyof T]: ReturnType<typeof createSignal<boolean>> }

  for (const field of fields) {
    valueSignals[field] = createSignal(options.initialValues[field])
    errorSignals[field] = createSignal<string | undefined>(undefined)
    touchedSignals[field] = createSignal(false)
  }

  const [submitting, setSubmitting] = createSignal(false)

  // Build accessor objects
  const values = {} as FormHandle<T>["values"]
  const errors = {} as FormHandle<T>["errors"]
  const touched = {} as FormHandle<T>["touched"]
  const dirty = {} as FormHandle<T>["dirty"]

  for (const field of fields) {
    values[field] = valueSignals[field][0] as () => T[typeof field]
    errors[field] = errorSignals[field][0]
    touched[field] = touchedSignals[field][0]
    dirty[field] = () => valueSignals[field][0]() !== options.initialValues[field]
  }

  const validateField = (field: keyof T) => {
    const validator = options.validate?.[field]
    if (!validator) return
    const allValues = getValues()
    const error = validator(valueSignals[field][0]() as T[typeof field], allValues)
    errorSignals[field][1](error ?? undefined)
  }

  const validateAllFields = (): boolean => {
    let valid = true
    const allValues = getValues()

    for (const field of fields) {
      const validator = options.validate?.[field]
      if (validator) {
        const error = validator(valueSignals[field][0]() as T[typeof field], allValues)
        errorSignals[field][1](error ?? undefined)
        if (error) valid = false
      }
    }

    // Form-level validation
    if (options.validateForm) {
      const formErrors = options.validateForm(allValues)
      if (formErrors) {
        for (const [key, msg] of Object.entries(formErrors)) {
          if (key in errorSignals) {
            errorSignals[key as keyof T][1](msg)
            valid = false
          }
        }
      }
    }

    return valid
  }

  const getValues = (): T => {
    const result = {} as T
    for (const field of fields) {
      result[field] = valueSignals[field][0]() as T[typeof field]
    }
    return result
  }

  const setValue = <K extends keyof T>(field: K, value: T[K]) => {
    valueSignals[field][1](() => value)
    if (options.validateOnChange) {
      validateField(field)
    }
  }

  const setError = <K extends keyof T>(field: K, error: string | undefined) => {
    errorSignals[field][1](error)
  }

  const setTouched = <K extends keyof T>(field: K) => {
    touchedSignals[field][1](true)
    validateField(field)
  }

  const isValid = () => {
    for (const field of fields) {
      if (errorSignals[field][0]()) return false
    }
    return true
  }

  const submit = async () => {
    // Mark all fields as touched
    batch(() => {
      for (const field of fields) {
        touchedSignals[field][1](true)
      }
    })

    // Run sync validation
    if (!validateAllFields()) return

    // Run async validation
    if (options.validateAsync) {
      const allValues = getValues()
      const asyncResults = await Promise.all(
        fields.map(async (field) => {
          const validator = options.validateAsync?.[field]
          if (!validator) return { field, error: undefined }
          const error = await validator(valueSignals[field][0]() as T[typeof field], allValues)
          return { field, error: error ?? undefined }
        })
      )
      let hasAsyncErrors = false
      batch(() => {
        for (const { field, error } of asyncResults) {
          if (error) {
            errorSignals[field][1](error)
            hasAsyncErrors = true
          }
        }
      })
      if (hasAsyncErrors) return
    }

    // Submit
    setSubmitting(true)
    try {
      await options.onSubmit(getValues())
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    batch(() => {
      for (const field of fields) {
        valueSignals[field][1](() => options.initialValues[field])
        errorSignals[field][1](undefined)
        touchedSignals[field][1](false)
      }
    })
  }

  return {
    values,
    errors,
    touched,
    dirty,
    setValue,
    setError,
    setTouched,
    isValid,
    submitting,
    submit,
    reset,
    getValues,
  }
}
