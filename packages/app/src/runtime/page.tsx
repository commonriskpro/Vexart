import type { JSX } from "solid-js"
import type { AppBoxProps } from "../components/primitives"
import { Box } from "../components/primitives"

/** @public */
export type PageProps = AppBoxProps & {
  children?: JSX.Element
}

/** @public */
export function Page(props: PageProps) {
  return <Box width="100%" height="100%" {...props}>{props.children}</Box>
}
