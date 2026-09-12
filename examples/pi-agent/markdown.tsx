import { Box, Text } from "@vexart/app"
import { Code } from "@vexart/headless"
import { Lexer, type Token, type Tokens } from "marked"
import { For, createMemo } from "solid-js"
import { SyntaxStyle, ONE_DARK } from "@vexart/engine"
import { piColors } from "./theme"

const syntax = SyntaxStyle.fromTheme(ONE_DARK)

// Native text has one wrapping flow per Text node, not browser inline boxes.
// Keep prose in that flow; separate flex children would shrink code and links.
function inline(tokens: Token[]): string {
  return tokens.map((token): string => {
    if (token.type === "br") return "\n"
    if (token.type === "image") return `[Image: ${token.text}] (${token.href})`
    if (token.type === "link") return `${inline(token.tokens || [])} (${token.href})`
    if ("tokens" in token && Array.isArray(token.tokens)) return inline(token.tokens)
    return "text" in token ? String(token.text) : "raw" in token ? token.raw : ""
  }).join("")
}

function Block(props: { token: Token }) {
  const token = props.token
  if (token.type === "space") return null
  if (token.type === "code") return <Box width="grow" paddingY={8}><Code content={token.text} language={token.lang || "plaintext"} syntaxStyle={syntax} width="grow" theme={{ bg: piColors.surface, padding: 12, radius: 8 }} /></Box>
  if (token.type === "hr") return <Box width="grow" height={1} backgroundColor={piColors.border} />
  if (token.type === "list") return <Box direction="column" width="grow" gap={10}><For each={token.items}>{(item: Tokens.ListItem, index) => <Text width="grow" fontSize={17} color={piColors.text} whiteSpace="pre-wrap">{token.ordered ? `${Number(token.start || 1) + index()}. ` : "• "}{inline(item.tokens)}</Text>}</For></Box>
  if (token.type === "blockquote") return <Box width="grow" paddingLeft={16} direction="column" gap={12}><For each={token.tokens}>{(child) => <Block token={child} />}</For></Box>
  if (token.type === "table") return <Box width="grow" direction="column" gap={8}><Text color={piColors.text} fontSize={17} fontWeight={600}>{token.header.map((cell: Tokens.TableCell) => inline(cell.tokens)).join(" | ")}</Text><For each={token.rows}>{(row) => <Text width="grow" color={piColors.text} fontSize={16} whiteSpace="pre-wrap">{row.map((cell: Tokens.TableCell) => inline(cell.tokens)).join(" | ")}</Text>}</For></Box>
  return <Text width="grow" color={piColors.text} fontSize={token.type === "heading" ? 23 : 17} fontWeight={token.type === "heading" ? 600 : 400} whiteSpace="pre-wrap">{"tokens" in token && Array.isArray(token.tokens) ? inline(token.tokens) : "text" in token ? String(token.text) : token.raw}</Text>
}

export function PiMarkdown(props: { content: string }) {
  const tokens = createMemo(() => Lexer.lex(props.content))
  return <Box direction="column" width="grow" gap={20}><For each={tokens()}>{(token) => <Block token={token} />}</For></Box>
}
