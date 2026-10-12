// Splits a reply's markdown into blocks, decides which read right-to-left,
// and lays those out as rows: inline styles parsed, levels resolved by the
// Unicode Bidirectional Algorithm, words wrapped to a width, and each row
// pinned so the terminal's renderer draws exactly those levels.

import {
  LRM,
  RLM,
  asEmoji,
  clusters,
  firstStrong,
  fixTypedBrackets,
  hasRtl,
  resolveRtl,
  widthOf,
} from './bidi'

export type Span = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  href?: string
  // The bidi level the paragraph gives this text, once resolved.
  level?: number
}

export type RtlBlock = {
  kind: 'rtl'
  role: 'paragraph' | 'heading' | 'item' | 'quote'
  // Each source line starts a row of its own, as the terminal draws them.
  lines: string[]
  depth: number
  marker: string
  headingLevel: number
  gapBefore: boolean
}

export type MarkdownBlock = { kind: 'markdown'; source: string; gapBefore: boolean }

export type Block = RtlBlock | MarkdownBlock

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const TABLE_ROW = /^\s*\|/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const HTML_BLOCK = /^\s{0,3}<\/?[a-zA-Z][^>]*>\s*$/

type Parsed =
  | { kind: 'markdown'; source: string[]; gapBefore: boolean }
  | {
      kind: 'text'
      role: RtlBlock['role']
      source: string[]
      lines: string[]
      depth: number
      marker: string
      headingLevel: number
      gapBefore: boolean
    }

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    TABLE_ROW.test(line) ||
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line)
  )
}

function parseBlocks(markdown: string): Parsed[] {
  const lines = markdown.split('\n')
  const blocks: Parsed[] = []
  let gap = false
  let i = 0
  const take = () => {
    const was = gap
    gap = false
    return was
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      gap = blocks.length > 0
      i++
      continue
    }

    const fence = FENCE.exec(line)?.[1]
    if (fence) {
      const source = [line]
      i++
      while (i < lines.length) {
        const next = lines[i] ?? ''
        source.push(next)
        i++
        const close = FENCE.exec(next)?.[1]
        if (close && close[0] === fence[0] && close.length >= fence.length) break
      }
      blocks.push({ kind: 'markdown', source, gapBefore: take() })
      continue
    }

    if (TABLE_ROW.test(line)) {
      const source: string[] = []
      while (i < lines.length && TABLE_ROW.test(lines[i] ?? '')) source.push(lines[i++] ?? '')
      blocks.push({ kind: 'markdown', source, gapBefore: take() })
      continue
    }

    if (RULE.test(line) || HTML_BLOCK.test(line)) {
      blocks.push({ kind: 'markdown', source: [line], gapBefore: take() })
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        kind: 'text',
        role: 'heading',
        source: [line],
        lines: [heading[2] ?? ''],
        depth: 0,
        marker: '',
        headingLevel: heading[1]?.length ?? 1,
        gapBefore: take(),
      })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const source: string[] = []
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) {
        source.push(lines[i] ?? '')
        body.push(QUOTE.exec(lines[i] ?? '')?.[1] ?? '')
        i++
      }
      blocks.push({
        kind: 'text',
        role: 'quote',
        source,
        lines: body,
        depth: 0,
        marker: '',
        headingLevel: 0,
        gapBefore: take(),
      })
      continue
    }

    const item = ITEM.exec(line)
    if (item) {
      const indent = widthOf((item[1] ?? '').replace(/\t/g, '    '))
      const source = [line]
      const body = [item[3] ?? '']
      i++
      while (i < lines.length) {
        const next = lines[i] ?? ''
        if (next.trim() === '' || startsBlock(next)) break
        source.push(next)
        body.push(next.trim())
        i++
      }
      blocks.push({
        kind: 'text',
        role: 'item',
        source,
        lines: body,
        depth: Math.floor(indent / 2),
        marker: item[2] ?? '-',
        headingLevel: 0,
        gapBefore: take(),
      })
      continue
    }

    const source: string[] = []
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (next.trim() === '' || (source.length > 0 && startsBlock(next))) break
      source.push(next)
      i++
    }
    blocks.push({
      kind: 'text',
      role: 'paragraph',
      source,
      lines: source.map(l => l.trim()),
      depth: 0,
      marker: '',
      headingLevel: 0,
      gapBefore: take(),
    })
  }
  return blocks
}

// What a reader sees of a text: code spans, link targets, tags and URLs out.
function visibleText(text: string): string {
  return text
    .replace(/(`+)[^`]*?\1/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<[^>\s]+>/g, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+/g, ' ')
}

function countWords(text: string): { rtl: number; ltr: number } {
  const count = { rtl: 0, ltr: 0 }
  for (const word of visibleText(text).split(/\s+/)) {
    const dir = firstStrong(word)
    if (dir === 'R') count.rtl++
    else if (dir === 'L') count.ltr++
  }
  return count
}

/**
 * Whether a paragraph reads right-to-left: it opens with an RTL letter, as a
 * browser's `dir="auto"` decides, or at least a third of its words are RTL,
 * or it holds any RTL word in a reply that is RTL as a whole.
 */
export function isRtlText(text: string, isRtlContext = false): boolean {
  const visible = visibleText(text)
  const { rtl, ltr } = countWords(visible)
  if (rtl === 0) return false
  return firstStrong(visible) === 'R' || isRtlContext || rtl * 2 >= ltr
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter(l => l.trim() !== '').map(l => /^\s*/.exec(l)?.[0].length ?? 0)
  const min = Math.min(...indents)
  return min > 0 && Number.isFinite(min) ? lines.map(l => l.slice(min)) : lines
}

/**
 * The blocks of `markdown`: right-to-left prose as `rtl` blocks, and every
 * stretch of anything else (code, tables, English prose) as one `markdown`
 * block to draw as the terminal always does. Null when nothing reads RTL.
 */
export function splitBlocks(markdown: string): Block[] | null {
  if (!hasRtl(markdown)) return null
  const parsed = parseBlocks(markdown)
  const prose = parsed.flatMap(b => (b.kind === 'text' ? b.lines : []))
  const total = countWords(prose.join('\n'))
  const isRtlMessage = total.rtl > 0 && total.rtl * 2 >= total.ltr

  const blocks: Block[] = []
  let pending: { lines: string[]; gapBefore: boolean } | null = null
  const flush = () => {
    if (pending) blocks.push({ kind: 'markdown', source: dedent(pending.lines).join('\n'), gapBefore: pending.gapBefore })
    pending = null
  }
  for (const block of parsed) {
    if (block.kind === 'text' && isRtlText(block.lines.join(' '), isRtlMessage)) {
      flush()
      blocks.push({
        kind: 'rtl',
        role: block.role,
        lines: block.lines,
        depth: block.depth,
        marker: block.marker,
        headingLevel: block.headingLevel,
        gapBefore: block.gapBefore,
      })
      continue
    }
    if (pending) {
      if (block.gapBefore) pending.lines.push('')
      pending.lines.push(...block.source)
    } else {
      pending = { lines: [...block.source], gapBefore: block.gapBefore }
    }
  }
  flush()
  return blocks.some(b => b.kind === 'rtl') ? blocks : null
}

const ESCAPABLE = /^\\([\\`*_{}[\]()#+\-.!~|<>])/
const CODE = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/
const STRONG = /^(?:\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}]))/u
const STRIKE = /^~~(?=\S)([\s\S]*?\S)~~/
const EMPHASIS = /^(?:\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)|_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}]))/u
const LINK = /^\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/
const AUTOLINK = /^<((?:https?|mailto):[^>\s]+)>/
const BARE_URL = /^(?:https?:\/\/|www\.)[^\s<]*[^\s<.,:;"')\]!?،؛؟]/

type Style = Omit<Span, 'text'>

/** The styled spans of one line of inline markdown. */
export function parseInline(src: string, style: Style = {}): Span[] {
  const out: Span[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ ...style, text: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const prev = i > 0 ? (src[i - 1] ?? '') : ''
    let m: RegExpExecArray | null

    if ((m = ESCAPABLE.exec(rest))) {
      buf += m[1]
      i += m[0].length
      continue
    }
    if ((m = CODE.exec(rest))) {
      flush()
      const body = m[2] ?? ''
      const text = /^ .* $/.test(body) && body.trim() !== '' ? body.slice(1, -1) : body
      out.push({ ...style, code: true, text })
      i += m[0].length
      continue
    }
    if ((m = STRONG.exec(rest))) {
      flush()
      out.push(...parseInline(m[1] ?? m[2] ?? '', { ...style, bold: true }))
      i += m[0].length
      continue
    }
    if ((m = STRIKE.exec(rest))) {
      flush()
      out.push(...parseInline(m[1] ?? '', { ...style, strike: true }))
      i += m[0].length
      continue
    }
    if ((rest[0] === '*' || !/[\p{L}\p{N}]/u.test(prev)) && (m = EMPHASIS.exec(rest))) {
      flush()
      out.push(...parseInline(m[1] ?? m[2] ?? '', { ...style, italic: true }))
      i += m[0].length
      continue
    }
    if ((m = LINK.exec(rest))) {
      flush()
      const label = m[1] ?? ''
      out.push(...parseInline(label === '' ? (m[2] ?? '') : label, { ...style, href: m[2] ?? '' }))
      i += m[0].length
      continue
    }
    if ((m = AUTOLINK.exec(rest))) {
      flush()
      out.push({ ...style, href: m[1] ?? '', text: m[1] ?? '' })
      i += m[0].length
      continue
    }
    if ((prev === '' || /[\s(]/.test(prev)) && (m = BARE_URL.exec(rest))) {
      flush()
      out.push({ ...style, href: m[0], text: m[0] })
      i += m[0].length
      continue
    }
    buf += src[i]
    i++
  }
  flush()
  return out
}

/**
 * The spans of a line for a terminal that can't show clickable links, written
 * out as Claude Code's own markdown writes them there: a link's URL after its
 * text, in brackets, unless the text is the URL itself.
 */
export function writeOutLinks(spans: Span[]): Span[] {
  const out: Span[] = []
  let label = ''
  spans.forEach((span, n) => {
    out.push(span)
    const href = span.href
    if (!href) return
    label += span.text
    if (spans[n + 1]?.href === href) return
    if (label !== href) {
      const style = { bold: span.bold, italic: span.italic, underline: span.underline, strike: span.strike }
      out.push({ ...style, text: ' ' }, { ...style, href, text: `(${href})` })
    }
    label = ''
  })
  return out
}

function sameStyle(a: Span, b: Span): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    a.href === b.href &&
    a.level === b.level
  )
}

function merge(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const span of spans) {
    const last = out[out.length - 1]
    if (last && sameStyle(last, span)) last.text += span.text
    else out.push({ ...span })
  }
  return out
}

// Cuts a word wider than a row into pieces that fit, never inside a cluster.
function splitWide(piece: Span, width: number): Span[] {
  const out: Span[] = []
  let text = ''
  for (const ch of clusters(piece.text)) {
    if (text !== '' && widthOf(text + ch) > width) {
      out.push({ ...piece, text })
      text = ''
    }
    text += ch
  }
  if (text !== '') out.push({ ...piece, text })
  return out
}

/** Wraps spans into rows no wider than `width` cells, breaking at spaces. */
export function wrapSpans(spans: Span[], width: number): Span[][] {
  const room = Math.max(1, width)
  const pieces = spans.flatMap(span =>
    span.text
      .split(/(\s+)/)
      .filter(text => text !== '')
      .map(text => ({ ...span, text })),
  )
  const rows: Span[][] = []
  let row: Span[] = []
  let used = 0
  const push = () => {
    while (row.length > 0 && /^\s+$/.test(row[row.length - 1]?.text ?? '')) row.pop()
    rows.push(merge(row))
    row = []
    used = 0
  }
  for (const piece of pieces) {
    const isSpace = /^\s+$/.test(piece.text)
    if (isSpace) {
      if (row.length === 0) continue
      const w = widthOf(piece.text)
      if (used + w > room) push()
      else {
        row.push({ ...piece, text: ' ' })
        used += 1
      }
      continue
    }
    const w = widthOf(piece.text)
    if (used + w <= room) {
      row.push(piece)
      used += w
      continue
    }
    if (row.length > 0) push()
    if (w <= room) {
      row.push(piece)
      used = w
      continue
    }
    const parts = splitWide(piece, room)
    parts.slice(0, -1).forEach(part => {
      row.push(part)
      push()
    })
    const lastPart = parts[parts.length - 1]
    if (lastPart) {
      row.push(lastPart)
      used = widthOf(lastPart.text)
    }
  }
  if (row.length > 0 || rows.length === 0) push()
  return rows
}

/**
 * Readies the spans of an RTL line for wrapping: bracket pairs typed
 * backwards put the right way round, and text-style pictographs given the
 * emoji selector so they take the two cells a terminal draws them in. Code
 * and links are left as written.
 */
export function prepareSpans(spans: Span[]): Span[] {
  const chars: string[] = []
  const editable: boolean[] = []
  const lengths = spans.map(span => {
    const own = Array.from(span.text)
    const isEditable = !span.code && !span.href
    for (const ch of own) {
      chars.push(ch)
      editable.push(isEditable)
    }
    return own.length
  })
  fixTypedBrackets(chars, editable)

  let at = 0
  return spans.map((span, n) => {
    const count = lengths[n] ?? 0
    const text = chars.slice(at, at + count).join('')
    at += count
    return { ...span, text: span.code || span.href ? text : asEmoji(text) }
  })
}

const LRI = '\u2066'
const PDI = '\u2069'

// Punctuation that opens a Latin word: a slash command (`/rtl`), a flag
// (`--model`), a file type (`.env`) or a path (`~/notes`, `@scope/pkg`).
const LATIN_LEAD = /(^|[\s([{\u00ab"'])([/.\-~@#$]+)(?=[A-Za-z])/g
// Stands in for code and links when looking for those words, so punctuation
// right after them never counts as opening one.
const HELD_OUT = '\uFFFC'

// Opens a row with RLM and puts each run between two marks of its level's
// direction, RLM for odd and LRM for even: a renderer that knows only strong
// characters then has nothing of its own left to resolve.
function pinRow(row: Span[]): Span[] {
  const pinned = row.map(span => {
    const mark = (span.level ?? 1) % 2 === 1 ? RLM : LRM
    return { ...span, text: mark + span.text + mark }
  })
  const first = pinned[0]
  if (first && !first.text.startsWith(RLM)) first.text = RLM + first.text
  return pinned
}

/**
 * Lays out one right-to-left paragraph of styled spans as rows of at most
 * `width` cells, for a renderer that reorders each row by its strong
 * characters alone (no embeddings, overrides or isolates) and mirrors
 * nothing, as Claude Code's own does on Windows terminals and VS Code's.
 *
 * Levels come from the full Unicode Bidirectional Algorithm, resolved once
 * for the whole paragraph as a browser does, with code and links isolated
 * left-to-right as a browser isolates `<code>`. Characters at odd levels are
 * drawn mirrored, and every row is pinned to those levels.
 *
 * Punctuation that opens a Latin word in prose (`/rtl`, `--model`, `.env`)
 * is joined to the word: on its own the algorithm gives it the paragraph's
 * direction and draws it on the word's far side (`rtl/`). An LRM before it,
 * there for resolving only, keeps it on the left, where the reader expects it.
 */
export function layoutRtl(spans: Span[], width: number): Span[][] {
  const prepared = prepareSpans(spans)
  const plain = prepared
    .map(span => (span.code || span.href ? HELD_OUT.repeat(span.text.length) : span.text))
    .join('')
  const leads = new Set<number>()
  for (const match of plain.matchAll(LATIN_LEAD)) leads.add((match.index ?? 0) + (match[1]?.length ?? 0))

  let paragraph = ''
  let offset = 0
  const places: number[][] = []
  for (const span of prepared) {
    const isIsolated = span.code || span.href
    if (isIsolated) paragraph += LRI
    const own: number[] = []
    for (let i = 0; i < span.text.length; i++) {
      if (leads.has(offset + i)) paragraph += LRM
      own.push(paragraph.length)
      paragraph += span.text[i]
    }
    places.push(own)
    offset += span.text.length
    if (isIsolated) paragraph += PDI
  }
  const { levels, mirrors } = resolveRtl(paragraph)

  const runs: Span[] = []
  prepared.forEach((span, n) => {
    const own = places[n] ?? []
    for (let i = 0; i < span.text.length; i++) {
      const at = own[i] ?? 0
      const unit = { ...span, text: mirrors.get(at) ?? span.text[i] ?? '', level: levels[at] ?? 1 }
      const last = runs[runs.length - 1]
      if (last && sameStyle(last, unit)) last.text += unit.text
      else runs.push(unit)
    }
  })
  return wrapSpans(runs, width).map(pinRow)
}

/** Marker drawn at a list item's right, in the order the eye meets it. */
export function itemMarker(marker: string, depth: number): string {
  const ordered = /^(\d+)[.)]$/.exec(marker)
  if (ordered) return `.${ordered[1] ?? ''}`
  return ['•', '◦', '▪'][depth % 3] ?? '•'
}
