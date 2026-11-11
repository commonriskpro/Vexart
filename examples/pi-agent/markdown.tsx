import { VoidMarkdown } from "vexart"
import { piColors } from "./theme"

export function PiMarkdown(props: { content: string }) {
  return (
    <VoidMarkdown
      content={props.content}
      theme={{
        fg: piColors.text,
        heading: piColors.text,
        codeBlockBg: piColors.surface,
        hrColor: piColors.border,
        blockquoteBorder: piColors.border,
      }}
    />
  )
}
