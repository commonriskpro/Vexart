/**
 * RadioGroup — truly headless radio button group.
 *
 * Handles focus, keyboard navigation, and selection while visuals are supplied by `renderOption`.
 *
 * @public
 */

import { For } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"
import { useListNavigation } from "../collections/list-navigation"

// ── Types ──

/** @public */
export type RadioOption = {
  value: string
  label: string
  disabled?: boolean
}

/** @public */
export type RadioOptionContext = {
  /** Whether this option is currently selected. */
  selected: boolean
  /** Whether this specific option is focused (selected + group focused). */
  focused: boolean
  /** Whether this option is disabled. */
  disabled: boolean
  /** Index of this option. */
  index: number
  /** Spread on the option element for click selection. */
  optionProps: {
    onPress: () => void
  }
}

/** @public */
export type RadioGroupProps = {
  /** Currently selected value. */
  value?: string
  /** Called with the new value when selection changes. */
  onChange?: (value: string) => void
  /** List of radio options. */
  options: RadioOption[]
  /** Disabled — entire group is not focusable. */
  disabled?: boolean
  /** Focus ID override. */
  focusId?: string
  /** Render each option. Receives the option + context. */
  renderOption: (option: RadioOption, ctx: RadioOptionContext) => JSX.Element
  /** Render the container wrapping all options. Default: column box. */
  renderGroup?: (children: JSX.Element) => JSX.Element
}

/** @public */
export function RadioGroup(props: RadioGroupProps) {
  const disabled = () => props.disabled ?? false

  const selectedIndex = () =>
    props.options.findIndex((o) => o.value === props.value)

  const nav = useListNavigation({
    count: () => props.options.length,
    selectedIndex,
    onSelectedChange: (index) => {
      const opt = props.options[index]
      if (opt && !opt.disabled) {
        props.onChange?.(opt.value)
      }
    },
    onSelect: (index) => {
      const opt = props.options[index]
      if (opt && !opt.disabled) {
        props.onChange?.(opt.value)
      }
    },
    loop: true,
    orientation: "both",
    vim: true,
    isItemDisabled: (index) => {
      const opt = props.options[index]
      return disabled() || (opt?.disabled ?? false)
    },
  })

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === " ") {
        const current = selectedIndex()
        if (current >= 0 && !props.options[current]?.disabled) {
          props.onChange?.(props.options[current].value)
        }
        return
      }
      nav.onKeyDown(e)
    },
  })

  const items = (
    <For each={props.options}>
      {(opt, i) => {
        const ctx: RadioOptionContext = {
          get selected() {
            return props.value === opt.value
          },
          get focused() {
            return focused() && selectedIndex() === i()
          },
          get disabled() {
            return disabled() || (opt.disabled ?? false)
          },
          get index() {
            return i()
          },
          optionProps: {
            onPress: () => {
              const isDisabled = disabled() || (opt.disabled ?? false)
              if (!isDisabled) props.onChange?.(opt.value)
            },
          },
        }
        return props.renderOption(opt, ctx)
      }}
    </For>
  )

  return (
    <>
      {props.renderGroup
        ? props.renderGroup(items)
        : <box direction="column">{items}</box>}
    </>
  )
}
