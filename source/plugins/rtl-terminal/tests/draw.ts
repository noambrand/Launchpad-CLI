// What Claude Code's renderer draws for a laid-out row, with a full
// implementation of the Unicode Bidirectional Algorithm standing in for it.

import { LRM, RLM } from '../hooks/bidi'
import type { Span } from '../hooks/markdown'
import { getEmbeddingLevels, getReorderSegments } from '../hooks/vendor/bidi-js/index.js'

// Claude Code's own on Windows terminals: reorders by the rules, base
// direction from the first strong character, mirrors nothing.
export function drawn(row: Span[]): string {
  const text = row.map(span => span.text).join('')
  const chars = text.split('')
  const embedding = getEmbeddingLevels(text)
  for (const [start, end] of getReorderSegments(text, embedding)) {
    chars.splice(start, end - start + 1, ...chars.slice(start, end + 1).reverse())
  }
  return chars.filter(ch => ch !== RLM && ch !== LRM).join('')
}

