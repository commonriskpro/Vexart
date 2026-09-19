/**
 * Combobox — truly headless autocomplete primitive.
 *
 * Handles filtering, focus, open/close state, and keyboard navigation.
 *
 * @public
 */

import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"
import { useDisabled } from "../helpers/disabled"
import { useListNavigation } from "../collections/list-navigation"

// ── Types ──

/** @public */
export type ComboboxOption = {
  value: string
  label: string
  disabled?: boolean
}

/** @public */
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

/** @public */
export type ComboboxOptionContext = {
  /** Whether this option is highlighted via keyboard. */
  highlighted: boolean
  /** Whether this option is the selected value. */
  selected: boolean
  /** Whether this option is disabled. */
  disabled: boolean
}

/** @public */
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

/** @public */
export function Combobox(props: ComboboxProps) {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")

  const disabled = useDisabled(props)

  const defaultFilter = (opt: ComboboxOption, q: string) =>
    opt.label.toLowerCase().includes(q.toLowerCase())

  const filtered = () => {
    const q = query()
    if (!q) return props.options
    const filterFn = props.filter ?? defaultFilter
    return props.options.filter(opt => filterFn(opt, q))
  }

  const filteredFor = (q: string) => {
    if (!q) return props.options
    const filterFn = props.filter ?? defaultFilter
    return props.options.filter(opt => filterFn(opt, q))
  }

  const selectedLabel = () => props.options.find(o => o.value === props.value)?.label

  function firstNonDisabledIndex(opts: ComboboxOption[]): number {
    for (let i = 0; i < opts.length; i++) {
      if (!opts[i].disabled) return i
    }
    return 0
  }

  const selectOption = (value: string) => {
    const opt = props.options.find(o => o.value === value)
    if (opt?.disabled) return
    props.onChange?.(value)
    setQuery("")
    setOpen(false)
  }

  const nav = useListNavigation({
    count: () => filtered().length,
    selectedIndex: 0,
    orientation: "vertical",
    vim: true,
    isItemDisabled: (index) => filtered()[index]?.disabled ?? false,
  })
  const highlightedIndex = nav.selectedIndex
  const setHighlightedIndex = nav.setSelectedIndex

  const { focused, focus } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return

      // Typing — update query and open dropdown
      if (e.char && !e.mods.ctrl && !e.mods.alt && !e.mods.meta) {
        const nextQuery = query() + e.char
        setQuery(nextQuery)
        setOpen(true)
        setHighlightedIndex(firstNonDisabledIndex(filteredFor(nextQuery)))
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
          setHighlightedIndex(firstNonDisabledIndex(filtered()))
        }
        return
      }

      if (e.key === "down" || e.key === "j") {
        if (!open()) {
          setOpen(true)
          setHighlightedIndex(firstNonDisabledIndex(filtered()))
          return
        }
        nav.onKeyDown(e)
        return
      }

      if (e.key === "up" || e.key === "k") {
        if (!open()) return
        nav.onKeyDown(e)
        return
      }

      if (open() && (e.key === "home" || e.key === "end" || e.key === "pageup" || e.key === "pagedown")) {
        nav.onKeyDown(e)
        return
      }
    },
  })

  const inputCtx: ComboboxInputContext = {
    get inputValue() { return query() || selectedLabel() || "" },
    get placeholder() { return props.placeholder ?? "Search…" },
    get open() { return open() },
    get focused() { return focused() },
    get disabled() { return disabled() },
    get selectedLabel() { return selectedLabel() },
  }

  const optionElements = () => {
    const opts = filtered()
    if (opts.length === 0 && props.renderEmpty) {
      return props.renderEmpty()
    }
    return opts.map((opt, i) => {
      const ctx: ComboboxOptionContext = {
        get highlighted() { return highlightedIndex() === i },
        get selected() { return props.value === opt.value },
        get disabled() { return opt.disabled ?? false },
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
        {props.renderInput(inputCtx)}
      </box>
      {open() ? (
        <>
          <box
            floating="root"
            width="100%"
            height="100%"
            zIndex={9997}
            onPress={() => setOpen(false)}
          />
          <box zIndex={9998}>
            {content()}
          </box>
        </>
      ) : null}
    </box>
  )
}
