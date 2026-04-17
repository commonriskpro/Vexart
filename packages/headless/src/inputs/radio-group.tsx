/**
 * RadioGroup — truly headless radio button group.
 *
 * CONTROLLED component — parent owns the selected value.
 * Focus-aware with Up/Down arrow navigation and Enter/Space selection.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard navigation (Up/Down/Left/Right, skip disabled)
 *   - Selection tracking
 *
 * ALL visual styling is the consumer's responsibility via renderOption.
 * Use @tge/void VoidRadioGroup for a styled version.
 *
 * Usage:
 *   <RadioGroup
 *     value={size()}
 *     onChange={setSize}
 *     options={[
 *       { value: "small", label: "Small" },
 *       { value: "medium", label: "Medium" },
 *       { value: "large", label: "Large" },
 *     ]}
 *     renderOption={(opt, ctx) => (
 *       <box direction="row" gap={8} alignY="center">
 *         <box width={16} height={16} cornerRadius={8}
 *           borderColor={ctx.selected ? "#22c55e" : "#666"} borderWidth={1}>
 *           {ctx.selected ? <box width={8} height={8} cornerRadius={4} backgroundColor="#22c55e" /> : null}
 *         </box>
 *         <text>{opt.label}</text>
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer-solid"

// ── Types ──

export type RadioOption = {
  value: string
  label: string
  disabled?: boolean
}

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

export function RadioGroup(props: RadioGroupProps) {
  const disabled = () => props.disabled ?? false

  const selectedIndex = () =>
    props.options.findIndex((o) => o.value === props.value)

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      const opts = props.options
      const current = selectedIndex()

      if (e.key === "down" || e.key === "right" || e.key === "j") {
        let next = (current + 1) % opts.length
        let attempts = 0
        while (opts[next].disabled && attempts < opts.length) {
          next = (next + 1) % opts.length
          attempts++
        }
        if (!opts[next].disabled) props.onChange?.(opts[next].value)
        return
      }

      if (e.key === "up" || e.key === "left" || e.key === "k") {
        let prev = current <= 0 ? opts.length - 1 : current - 1
        let attempts = 0
        while (opts[prev].disabled && attempts < opts.length) {
          prev = prev <= 0 ? opts.length - 1 : prev - 1
          attempts++
        }
        if (!opts[prev].disabled) props.onChange?.(opts[prev].value)
        return
      }

      if (e.key === "enter" || e.key === " ") {
        if (current >= 0) props.onChange?.(opts[current].value)
        return
      }
    },
  })

  const children = () =>
    props.options.map((opt, i) => {
      const isDisabled = disabled() || (opt.disabled ?? false)
      const ctx: RadioOptionContext = {
        selected: props.value === opt.value,
        focused: focused() && selectedIndex() === i,
        disabled: isDisabled,
        index: i,
        optionProps: {
          onPress: () => { if (!isDisabled) props.onChange?.(opt.value) },
        },
      }
      return props.renderOption(opt, ctx)
    })

  return (
    <>
      {props.renderGroup
        ? props.renderGroup(<>{children()}</>)
        : <box direction="column">{children()}</box>}
    </>
  )
}
