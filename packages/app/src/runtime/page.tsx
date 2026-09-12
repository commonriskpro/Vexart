import type { JSX } from "solid-js"
import type { TGEProps } from "@vexart/engine"

/** @public */
export type PageProps = TGEProps & {
  children?: JSX.Element
}

/** @public */
export function Page(props: PageProps) {
  return <box width="100%" height="100%" {...props}>{props.children}</box>
}
