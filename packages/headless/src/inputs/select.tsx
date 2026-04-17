/**
 * Select — truly headless dropdown select primitive.
 *
 * CONTROLLED component — parent owns the selected value.
 * Focus-aware with keyboard navigation (Up/Down/Enter/Escape).
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard navigation (Up/Down/Enter/Escape)
 *   - Open/close state
 *   - Option registration + selection
 *   - Highlight tracking
 *
 * ALL visual styling is the consumer's responsibility.
 * Use @tge/void VoidSelect for a styled version.
 *
 * Usage (simple — options prop):
 *   <Select
 *     value={value()}
 *     onChange={setValue}
 *     options={[
 *       { value: "apple", label: "Apple" },
 *       { value: "banana", label: "Banana" },
 *     ]}
 *     placeholder="Pick a fruit…"
 *     renderTrigger={(ctx) => <text>{ctx.selectedLabel || ctx.placeholder}</text>}
 *     renderOption={(opt, ctx) => <text>{opt.label}</text>}
 *   />
 */

import { createSignal, createContext, useContext } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

// ── Types ──

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectTriggerContext = {
  /** Currently selected label (or undefined). */
  selectedLabel: string | undefined
  /** Placeholder text. */
  placeholder: string
  /** Whether the dropdown is open. */
  open: boolean
  /** Whether this element is focused. */
  focused: boolean
  /** Whether the select is disabled. */
  disabled: boolean
}

export type SelectOptionContext = {
  /** Whether this option is currently highlighted via keyboard. */
  highlighted: boolean
  /** Whether this option is the selected value. */
  selected: boolean
  /** Whether this option is disabled. */
  disabled: boolean
}

export type SelectProps = {
  /** Currently selected value. */
  value?: string
  /** Called with the new value when an option is selected. */
  onChange?: (value: string) => void
  /** Options list. */
  options?: SelectOption[]
  /** Placeholder text when no value is selected. */
  placeholder?: string
  /** Disabled state — not focusable. */
  disabled?: boolean
  /** Focus ID override. */
  focusId?: string
  /** Render the trigger element. Receives context about current state. */
  renderTrigger?: (ctx: SelectTriggerContext) => JSX.Element
  /** Render each option. Receives the option + context. */
  renderOption?: (option: SelectOption, ctx: SelectOptionContext) => JSX.Element
  /** Render the dropdown container wrapping options. Default: just children. */
  renderContent?: (children: JSX.Element) => JSX.Element
  /** Children — for compound component pattern (advanced). */
  children?: JSX.Element
}

export type SelectTriggerProps = {
  children?: JSX.Element
}

export type SelectContentProps = {
  children?: JSX.Element
}

export type SelectItemProps = {
  value: string
  disabled?: boolean
  children?: JSX.Element
}

// ── Context ──

type SelectContextValue = {
  value: () => string | undefined
  open: () => boolean
  setOpen: (v: boolean) => void
  highlightedIndex: () => number
  options: () => SelectOption[]
  registerOption: (opt: SelectOption) => void
  selectValue: (value: string) => void
  focused: () => boolean
  disabled: () => boolean
}

const SelectContext = createContext<SelectContextValue>()

function useSelectContext(): SelectContextValue {
  const ctx = useContext(SelectContext)
  if (!ctx) throw new Error("Select compound components must be used within <Select>")
  return ctx
}

// ── Select Root ──

export function Select(props: SelectProps) {
  const [open, setOpen] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)
  const [registeredOptions, setRegisteredOptions] = createSignal<SelectOption[]>([])

  const disabled = () => props.disabled ?? false
  const options = () => props.options ?? registeredOptions()

  const registerOption = (opt: SelectOption) => {
    setRegisteredOptions((prev) => {
      if (prev.some((o) => o.value === opt.value)) return prev
      return [...prev, opt]
    })
  }

  const selectValue = (value: string) => {
    const opt = options().find((o) => o.value === value)
    if (opt?.disabled) return
    props.onChange?.(value)
    setOpen(false)
  }

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return

      if (e.key === "enter" || e.key === " ") {
        if (open()) {
          const opts = options()
          const idx = highlightedIndex()
          if (idx >= 0 && idx < opts.length && !opts[idx].disabled) {
            selectValue(opts[idx].value)
          }
        } else {
          setOpen(true)
          const idx = options().findIndex((o) => o.value === props.value)
          setHighlightedIndex(idx >= 0 ? idx : 0)
        }
        return
      }

      if (e.key === "escape") { setOpen(false); return }

      if (!open()) {
        if (e.key === "down" || e.key === "up") {
          setOpen(true)
          const idx = options().findIndex((o) => o.value === props.value)
          setHighlightedIndex(idx >= 0 ? idx : 0)
        }
        return
      }

      if (e.key === "down" || e.key === "j") {
        const opts = options()
        let next = highlightedIndex() + 1
        while (next < opts.length && opts[next].disabled) next++
        if (next < opts.length) setHighlightedIndex(next)
        return
      }

      if (e.key === "up" || e.key === "k") {
        const opts = options()
        let prev = highlightedIndex() - 1
        while (prev >= 0 && opts[prev].disabled) prev--
        if (prev >= 0) setHighlightedIndex(prev)
        return
      }
    },
  })

  // Simple mode — render with render props
  if (props.options && props.renderTrigger) {
    const selectedLabel = () => options().find((o) => o.value === props.value)?.label

    const triggerCtx = (): SelectTriggerContext => ({
      selectedLabel: selectedLabel(),
      placeholder: props.placeholder ?? "Select…",
      open: open(),
      focused: focused(),
      disabled: disabled(),
    })

    const optionElements = () =>
      options().map((opt, i) => {
        const ctx: SelectOptionContext = {
          highlighted: highlightedIndex() === i,
          selected: props.value === opt.value,
          disabled: opt.disabled ?? false,
        }
        const rendered = props.renderOption
          ? props.renderOption(opt, ctx)
          : <text>{opt.label}</text>
        // Wrap in clickable box — onPress selects this option
        return (
          <box onPress={() => { if (!opt.disabled) selectValue(opt.value) }}>
            {rendered}
          </box>
        )
      })

    const content = () => {
      if (!open()) return null
      const children = <>{optionElements()}</>
      return props.renderContent ? props.renderContent(children) : children
    }

    return (
      <box direction="column">
        {/* Click trigger to toggle dropdown */}
        <box onPress={() => { if (!disabled()) setOpen(!open()) }}>
          {props.renderTrigger(triggerCtx())}
        </box>
        {content()}
      </box>
    )
  }

  // Compound mode — context-based
  const ctx: SelectContextValue = {
    value: () => props.value,
    open,
    setOpen,
    highlightedIndex: () => highlightedIndex(),
    options,
    registerOption,
    selectValue,
    focused,
    disabled,
  }

  return (
    <SelectContext.Provider value={ctx}>
      <box direction="column">
        {props.children}
      </box>
    </SelectContext.Provider>
  )
}

// ── Compound sub-components ──

function SelectTrigger(props: SelectTriggerProps) {
  return <>{props.children}</>
}

function SelectContent(props: SelectContentProps) {
  const ctx = useSelectContext()
  return <>{ctx.open() ? props.children : null}</>
}

function SelectItem(props: SelectItemProps) {
  const ctx = useSelectContext()
  const disabled = () => props.disabled ?? false
  const label = typeof props.children === "string" ? props.children : props.value
  ctx.registerOption({ value: props.value, label, disabled: disabled() })
  return <>{props.children ?? <text>{props.value}</text>}</>
}

// ── Attach sub-components ──

Select.Trigger = SelectTrigger
Select.Content = SelectContent
Select.Item = SelectItem
