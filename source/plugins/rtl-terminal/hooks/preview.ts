// Plain text the person wrote, as opposed to a reply's markdown: the draft in
// the prompt box and the prompt rows of the transcript. The box draws a draft
// left-aligned with brackets unmirrored, each wrapped row in its own
// direction, and its text is what gets sent, so it is left alone and
// previewed above; a prompt row is redrawn in place, the model's copy
// untouched.

import { hasRtl, strongOf, widthOf } from './bidi'
import { isRtlText, layoutRtl, wrapSpans } from './markdown'
import type { Span } from './markdown'

const MIRRORABLE = /[()[\]{}<>«»‹›]/

/**
 * Whether the prompt box would draw `draft` wrong at `width` cells: RTL text
 * mixed with Latin words, holding brackets, over several lines, or wrapping.
 */
export function needsPreview(draft: string, width: number): boolean {
  if (!hasRtl(draft)) return false
  if (draft.includes('\n') || MIRRORABLE.test(draft)) return true
  if (widthOf(draft) > width) return true
  return Array.from(draft).some(ch => strongOf(ch) === 'L')
}

export type PreviewRow = { isRtl: boolean; spans: Span[] }

/** The rows of plain `text` at `width` cells, each RTL row ready to draw. */
export function previewRows(text: string, width: number): PreviewRow[] {
  return text.split('\n').flatMap(line => {
    const isRtl = isRtlText(line)
    const rows = isRtl ? layoutRtl([{ text: line }], width) : wrapSpans([{ text: line }], width)
    return rows.map(spans => ({ isRtl, spans }))
  })
}

/**
 * Plain `text` rewritten for a renderer that keeps it as one block: each RTL
 * line laid out at `width` cells by hand, every row pinned to the levels the
 * Unicode Bidirectional Algorithm gives it. Text with no RTL comes back
 * unchanged.
 */
export function layoutPlainText(text: string, width: number): string {
  if (!hasRtl(text)) return text
  return text
    .split('\n')
    .map(line => {
      if (!isRtlText(line)) return line
      return layoutRtl([{ text: line }], width)
        .map(row => row.map(span => span.text).join(''))
        .join('\n')
    })
    .join('\n')
}
