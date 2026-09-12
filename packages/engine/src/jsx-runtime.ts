/**
 * Reserved universal JSX compiler runtime.
 *
 * This entrypoint is consumed by the Solid JSX transform. It deliberately
 * exposes only the ABI the compiler emits; application code should import
 * supported APIs from `@vexart/engine` or `vexart` instead.
 *
 * Every binding is re-exported from the singleton reconciler module so the
 * compiler runtime, public engine entrypoint, and unified `vexart` barrel
 * share one renderer instance.
 */

export {
  createElement,
  solidCreateTextNode as createTextNode,
  insertNode,
  setProp,
  createComponent,
  insert,
  spread,
  mergeProps,
  use,
  memo,
  effect,
} from "./reconciler/reconciler"
