/** Standard disabled accessor for headless components. */
export function useDisabled(props: { disabled?: boolean }): () => boolean {
  return () => props.disabled ?? false
}
