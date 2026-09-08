/** Return the previous UTF-16 offset on a Unicode codepoint boundary. */
export function previousCodePointOffset(text: string, offset: number) {
  if (offset <= 0) return 0
  const index = Math.min(offset, text.length)
  if (index >= 2) {
    const current = text.charCodeAt(index - 1)
    const previous = text.charCodeAt(index - 2)
    if (current >= 0xdc00 && current <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) return index - 2
  }
  return index - 1
}

/** Return the next UTF-16 offset on a Unicode codepoint boundary. */
export function nextCodePointOffset(text: string, offset: number) {
  const index = Math.max(0, Math.min(offset, text.length))
  if (index + 1 < text.length) {
    const current = text.charCodeAt(index)
    const next = text.charCodeAt(index + 1)
    if (current >= 0xd800 && current <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) return index + 2
  }
  return Math.min(text.length, index + 1)
}
