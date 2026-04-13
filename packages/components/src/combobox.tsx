/**
 * Combobox — truly headless autocomplete/combobox primitive.
 *
 * Combines a text input with a filterable dropdown list.
 * CONTROLLED component — parent owns the value.
 *
 * Provides:
 *   - Text input with filtering
 *   - Keyboard navigation (Up/Down/Enter/Escape)
 *   - Focus management
 *   - Open/close state
 *   - Highlight tracking
 *
 * ALL visual styling is the consumer's responsibility.
 * Use @tge/void VoidCombobox for a styled version.
 *
 * Usage:
 *   <Combobox
 *     value={value()}
 *     onChange={setValue}
 *     options={fruits}
 *     renderInput={(ctx) => (
 *       <box borderWidth={1} borderColor={ctx.focused ? "#4488cc" : "#333"} padding={4}>
 *         <text color="#fff">{ctx.inputValue || ctx.placeholder}</text>
 *       </box>
 *     )}
 *     renderOption={(option, ctx) => (
 *       <box backgroundColor={ctx.highlighted ? "#333" : "transparent"} padding={4}>
 *         <text color="#fff">{option.label}</text>
 *       </box>
 *     )}
 *     renderContent={(children) => (
 *       <box backgroundColor="#1a1a2e" cornerRadius={6} padding={4}>
 *         {children}
 *       </box>
 *     )}
 *   />
 */

import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"

// ── Types ──

export type ComboboxOption = {
  value: string
  label: string
  disabled?: boolean
}

export type ComboboxInputContext = {
  /** Current text in the input. */
  inputValue: string
  /** Placeholder text. */
  placeholder: string
  /** Whether the dropdown is open. */
  open: boolean
  /** Whether the input is focused. */
  focused: boolean
  /** Whether the combobox is disabled. */
  disabled: boolean
  /** Currently selected label. */
  selectedLabel: string | undefined
}

export type ComboboxOptionContext = {
  /** Whether this option is highlighted via keyboard. */
  highlighted: boolean
  /** Whether this option is the selected value. */
  selected: boolean
  /** Whether this option is disabled. */
  disabled: boolean
}

export type ComboboxProps = {
  /** Currently selected value. */
  value?: string
  /** Called when a value is selected. */
  onChange?: (value: string) => void
  /** All available options (filtering happens internally). */
  options: ComboboxOption[]
  /** Placeholder when no value. */
  placeholder?: string
  /** Disabled state. */
  disabled?: boolean
  /** Focus ID override. */
  focusId?: string
  /** Custom filter function. Default: case-insensitive label contains. */
  filter?: (option: ComboboxOption, query: string) => boolean
  /** Render the input area. */
  renderInput: (ctx: ComboboxInputContext) => JSX.Element
  /** Render each option. */
  renderOption: (option: ComboboxOption, ctx: ComboboxOptionContext) => JSX.Element
  /** Render the dropdown container. */
  renderContent?: (children: JSX.Element) => JSX.Element
  /** Render empty state when no options match. */
  renderEmpty?: () => JSX.Element
}

export function Combobox(props: ComboboxProps) {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

  const disabled = () => props.disabled ?? false

  const defaultFilter = (opt: ComboboxOption, q: string) =>
    opt.label.toLowerCase().includes(q.toLowerCase())

  const filtered = () => {
    const q = query()
    if (!q) return props.options
    const filterFn = props.filter ?? defaultFilter
    return props.options.filter(opt => filterFn(opt, q))
  }

  const selectedLabel = () => props.options.find(o => o.value === props.value)?.label

  const selectOption = (value: string) => {
    const opt = props.options.find(o => o.value === value)
    if (opt?.disabled) return
    props.onChange?.(value)
    setQuery("")
    setOpen(false)
  }

  const { focused, focus } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return

      // Typing — update query and open dropdown
      if (e.key.length === 1 && !e.mods.ctrl && !e.mods.alt) {
        setQuery(prev => prev + e.key)
        setOpen(true)
        setHighlightedIndex(0)
        return
      }

      if (e.key === "backspace") {
        setQuery(prev => prev.slice(0, -1))
        if (!open()) setOpen(true)
        setHighlightedIndex(0)
        return
      }

      if (e.key === "escape") {
        if (open()) {
          setOpen(false)
          setQuery("")
        }
        return
      }

      if (e.key === "enter") {
        if (open()) {
          const opts = filtered()
          const idx = highlightedIndex()
          if (idx >= 0 && idx < opts.length && !opts[idx].disabled) {
            selectOption(opts[idx].value)
          }
        } else {
          setOpen(true)
          setHighlightedIndex(0)
        }
        return
      }

      if (e.key === "down" || e.key === "j") {
        if (!open()) {
          setOpen(true)
          setHighlightedIndex(0)
          return
        }
        const opts = filtered()
        let next = highlightedIndex() + 1
        while (next < opts.length && opts[next].disabled) next++
        if (next < opts.length) setHighlightedIndex(next)
        return
      }

      if (e.key === "up" || e.key === "k") {
        if (!open()) return
        const opts = filtered()
        let prev = highlightedIndex() - 1
        while (prev >= 0 && opts[prev].disabled) prev--
        if (prev >= 0) setHighlightedIndex(prev)
        return
      }
    },
  })

  const inputCtx = (): ComboboxInputContext => ({
    inputValue: query() || selectedLabel() || "",
    placeholder: props.placeholder ?? "Search…",
    open: open(),
    focused: focused(),
    disabled: disabled(),
    selectedLabel: selectedLabel(),
  })

  const optionElements = () => {
    const opts = filtered()
    if (opts.length === 0 && props.renderEmpty) {
      return props.renderEmpty()
    }
    return opts.map((opt, i) => {
      const ctx: ComboboxOptionContext = {
        highlighted: highlightedIndex() === i,
        selected: props.value === opt.value,
        disabled: opt.disabled ?? false,
      }
      // Wrap in clickable box with hover — onPress selects, onMouseOver highlights
      return (
        <box
          onPress={() => { if (!opt.disabled) selectOption(opt.value) }}
          onMouseOver={() => setHighlightedIndex(i)}
        >
          {props.renderOption(opt, ctx)}
        </box>
      )
    })
  }

  const content = () => {
    if (!open()) return null
    const children = <>{optionElements()}</>
    return props.renderContent ? props.renderContent(children) : children
  }

  return (
    <box direction="column">
      {/* Click input to toggle dropdown + grab focus for keyboard input */}
      <box onPress={() => { if (!disabled()) { setOpen(!open()); focus() } }}>
        {props.renderInput(inputCtx())}
      </box>
      {content()}
    </box>
  )
}
